# deploy-mcecs.ps1 -- publish the websim site, the symposium deck and the presenter
# script to an MCECS personal web space (https://web.cecs.pdx.edu/~<user>/).
#
# What it uploads (into ~/public_html/<Target>/ on the campus host):
#   index.html                       a small landing page (docs/final/site/index.html)
#   sim/                             websim/app/dist (must exist and have passed the gates)
#   deck/capacity-is-not-access-symposium.html, deck/screenshots/, deck/deck_numbers.json
#   deck/PRESENTER_SCRIPT_REFORMAT.html
#
# What it does NOT do: build. Build and gate first (websim/docs/DEPLOY.md §1-2):
#   cd websim; npm run build -w app; npm run deploy-check; npm run check:deploy -w @websim/pipeline
# This script re-runs deploy-check itself and stops on a non-zero exit.
#
# Credentials: none stored. OpenSSH prompts for the MCECS password (three times:
# mkdir, scp, permissions). Per CAT documentation the web server expects
# directories 711 and files 600; this script sets exactly that.
#
# Usage:
#   powershell -File scripts\deploy-mcecs.ps1 -User fxa28196_guest
#   powershell -File scripts\deploy-mcecs.ps1 -User fxa28196_guest -Target reu -RemoteHost websftp.cecs.pdx.edu

param(
    [Parameter(Mandatory = $true)][string]$User,
    [string]$Target = 'reu',
    [string]$RemoteHost = 'websftp.cecs.pdx.edu'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent

$dist      = Join-Path $repoRoot 'websim\app\dist'
$deckDir   = Join-Path $repoRoot 'docs\final\presentation'
$presenter = Join-Path $repoRoot 'docs\final\PRESENTER_SCRIPT_REFORMAT.html'
$landing   = Join-Path $repoRoot 'docs\final\site\index.html'
foreach ($p in @($dist, $deckDir, $presenter, $landing)) {
    if (-not (Test-Path $p)) { throw "missing: $p" }
}

Write-Host "1/4 Re-running the WP14 publish gate over websim/app/dist ..."
Push-Location (Join-Path $repoRoot 'websim')
try {
    & npm run deploy-check | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "deploy-check failed (exit $LASTEXITCODE); nothing uploaded" }
} finally { Pop-Location }

Write-Host "2/4 Staging a local copy of the site tree ..."
$stage = Join-Path ([System.IO.Path]::GetTempPath()) ("mcecs-stage-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $stage | Out-Null
Copy-Item $landing (Join-Path $stage 'index.html')
Copy-Item $dist (Join-Path $stage 'sim') -Recurse
New-Item -ItemType Directory -Force (Join-Path $stage 'deck') | Out-Null
Copy-Item (Join-Path $deckDir 'capacity-is-not-access-symposium.html') (Join-Path $stage 'deck')
Copy-Item (Join-Path $deckDir 'deck_numbers.json') (Join-Path $stage 'deck')
Copy-Item (Join-Path $deckDir 'screenshots') (Join-Path $stage 'deck\screenshots') -Recurse
Copy-Item $presenter (Join-Path $stage 'deck')
$files = (Get-ChildItem $stage -Recurse -File)
Write-Host ("    {0} files, {1:N1} MB" -f $files.Count, (($files | Measure-Object Length -Sum).Sum / 1MB))

Write-Host "3/4 Uploading to $User@$RemoteHost : ~/public_html/$Target/  (password prompts) ..."
& ssh "$User@$RemoteHost" "mkdir -p public_html && rm -rf public_html/$Target.new && mkdir public_html/$Target.new"
if ($LASTEXITCODE -ne 0) { throw "ssh mkdir failed" }
& scp -r -q (Join-Path $stage '*') "${User}@${RemoteHost}:public_html/$Target.new/"
if ($LASTEXITCODE -ne 0) { throw "scp failed" }

Write-Host "4/4 Setting permissions (dirs 711, files 600) and swapping the new tree in ..."
$remote = "cd public_html && find $Target.new -type d -exec chmod 711 {} + && find $Target.new -type f -exec chmod 600 {} + && rm -rf $Target.old && (test -d $Target && mv $Target $Target.old || true) && mv $Target.new $Target && rm -rf $Target.old && echo swapped"
& ssh "$User@$RemoteHost" $remote
if ($LASTEXITCODE -ne 0) { throw "remote permission/swap step failed" }

Remove-Item $stage -Recurse -Force
Write-Host ""
Write-Host "Published: https://web.cecs.pdx.edu/~$User/$Target/"
Write-Host "Now run the post-deploy dry run in websim/docs/DEPLOY.md section 5 against that URL."
