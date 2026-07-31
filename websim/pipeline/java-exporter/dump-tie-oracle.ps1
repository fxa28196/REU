# dump-tie-oracle.ps1 -- TASK C2 (a): the certified oracle for Dijkstra's
# behaviour at an EXACT double distance tie.
#
# Compiles websim/pipeline/java-exporter/src-tie against the already-compiled
# certified Geography classes (geo-classes/, produced by dump-world-fixtures.ps1)
# and runs the dumper. Geography/ itself is only ever READ.
#
# The certified corpus contains no exact tie at all -- all 109,434 edge lengths
# are pairwise distinct as raw doubles, and all 3,539,712 certified tree rows
# have exactly one incoming relaxation that lands on their distance. The tie
# policy therefore cannot be pinned down by any cut of the real graph, so this
# dumper runs the certified StreetNetwork over small SYNTHETIC graphs whose
# weights are real geodesics between real certified node positions.
#
# Output (committed):
#   websim/engine/test/fixtures/graph-tie/tie-oracle.tsv
#
#   powershell -File websim\pipeline\java-exporter\dump-tie-oracle.ps1
#   powershell -File websim\pipeline\java-exporter\dump-tie-oracle.ps1 -Verify
#
# -Verify dumps a second time into a scratch directory and compares the SHA-256,
# which is what makes "the fixture regenerates byte-identically" a checked claim
# rather than an assertion.

param(
  [switch]$SkipCompile,
  [switch]$Verify
)

$ErrorActionPreference = 'Stop'
$javaHome   = if ($env:JAVA_HOME)   { $env:JAVA_HOME }   else { 'C:\Users\Chick\tools\jdk-17.0.19+10' }
$repastHome = if ($env:REPAST_HOME) { $env:REPAST_HOME } else { Join-Path $env:USERPROFILE 'RepastSimphony-2.11.0' }
$here       = $PSScriptRoot
$repoRoot   = (Resolve-Path (Join-Path $here '..\..\..')).Path
$geoDir     = Join-Path $repoRoot 'Geography'
$websimDir  = Join-Path $repoRoot 'websim'
$pluginsDir = Join-Path $repastHome 'eclipse\plugins'
$geoClasses = Join-Path $here 'geo-classes'

if (-not (Test-Path (Join-Path $javaHome 'bin\javac.exe'))) { throw "JDK not found at $javaHome (set JAVA_HOME)" }
if (-not (Test-Path $pluginsDir)) { throw "Repast plugins not found at $pluginsDir (set REPAST_HOME)" }
if (-not (Test-Path (Join-Path $geoClasses 'geography\routing\StreetNetwork.class'))) {
  throw "geo-classes is empty -- run dump-world-fixtures.ps1 first (it compiles the certified sources)"
}

# ---- classpath: same fileTree spec as Geography/build.gradle -----------------
$pats = @('repast.simphony.*','libs.*','saf.*','org.codehaus.groovy*')
$jars = @()
foreach ($e in (Get-ChildItem $pluginsDir)) {
  $match = $false; foreach ($p in $pats) { if ($e.Name -like $p) { $match = $true } }
  if (-not $match) { continue }
  if ($e.PSIsContainer) { $jars += (Get-ChildItem $e.FullName -Recurse -File -Filter *.jar | ForEach-Object { $_.FullName }) }
  elseif ($e.Extension -eq '.jar') { $jars += $e.FullName }
}
$bins = (Get-ChildItem $pluginsDir -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'bin') } |
         ForEach-Object { Join-Path $_.FullName 'bin' })
$cp = (($jars + $bins) | Sort-Object -Unique) -join ';'
$cpF   = $cp -replace '\\','/'
$hereF = $here -replace '\\','/'

if (-not $SkipCompile) {
  $srcs = (Get-ChildItem (Join-Path $here 'src-tie') -Recurse -Filter *.java | ForEach-Object { $_.FullName -replace '\\','/' })
  (@('-nowarn','-encoding','UTF-8','-cp',('"'+$cpF+';'+$hereF+'/geo-classes"'),'-d',('"'+$hereF+'/out-tie"')) + $srcs) -join "`n" |
    Out-File -Encoding ascii (Join-Path $here 'javac-tie-args.txt')
  & "$javaHome\bin\javac.exe" "@$here\javac-tie-args.txt"
  if ($LASTEXITCODE -ne 0) { throw "javac (tie dumper) failed" }
}

function Invoke-TieDump([string]$target) {
  New-Item -ItemType Directory -Force $target | Out-Null
  $runArgs = @(
    '-XX:+IgnoreUnrecognizedVMOptions',
    '--add-opens=java.base/java.lang.reflect=ALL-UNNAMED',
    '--add-opens=java.base/java.util=ALL-UNNAMED',
    '-cp', ('"' + $cpF + ';' + $hereF + '/geo-classes;' + $hereF + '/out-tie"'),
    'websim.exporter.tie.TieOracleDumper',
    ('"' + (((Resolve-Path $target).Path) -replace '\\','/') + '"')
  )
  $runArgs -join "`n" | Out-File -Encoding ascii (Join-Path $here 'java-tie-run-args.txt')
  # working directory = repo root, so the dumper can digest the certified source
  Push-Location $repoRoot
  try {
    & "$javaHome\bin\java.exe" "@$here\java-tie-run-args.txt"
    if ($LASTEXITCODE -ne 0) { throw "TieOracleDumper failed (exit $LASTEXITCODE)" }
  } finally { Pop-Location }
}

$fixtureDir = Join-Path $websimDir 'engine\test\fixtures\graph-tie'
Write-Host "== C2 tie oracle -> $fixtureDir"
Invoke-TieDump $fixtureDir

if ($Verify) {
  $scratch = Join-Path $env:TEMP ('websim-tie-verify-' + [guid]::NewGuid().ToString('N'))
  try {
    Invoke-TieDump $scratch
    $a = (Get-FileHash -Algorithm SHA256 (Join-Path $fixtureDir 'tie-oracle.tsv')).Hash
    $b = (Get-FileHash -Algorithm SHA256 (Join-Path $scratch 'tie-oracle.tsv')).Hash
    if ($a -ne $b) { throw "BYTE-IDENTITY FAILED: $a != $b" }
    Write-Host "== BYTE-IDENTITY VERIFIED across two independent runs ($a)"
  } finally {
    if (Test-Path $scratch) { Remove-Item -Recurse -Force $scratch }
  }
}

Get-ChildItem $fixtureDir -Filter '*.tsv' | ForEach-Object {
  Write-Host ("  {0}  {1:N0} bytes" -f $_.Name, $_.Length)
}
