# dump-closure-fixtures.ps1 -- TASK WP8: the Java CLOSURE-WAVE oracle.
#
# Compiles the certified Geography sources into websim (NEVER into Geography/),
# compiles the WP8 exporter against them, and runs it with the working directory
# set to Geography/ (the certified loaders take production-relative paths).
#
# Output (git-ignored bulk tree):
#   websim/pipeline/out/closure-fixtures/
#     manifest.json                       SHA-256 of every dump + self-checks
#     waves/<config>/waves.tsv            hour, tick, blocked count, version, tree rollup
#     waves/<config>/edges.tsv            the ordered edge set each wave blocks
#     waves/<config>/blocked-pairs.tsv    the cumulative blocked pair set
#     waves/<config>/trees.tsv            per shelter, per wave: sha256 over the FULL
#                                         distance+predecessor array
#     waves/<config>/trees-sample.tsv     128 stride rows per tree per wave (raw hex)
#     waves/seed-invariance.tsv           per-wave rollup at seeds 42/43/44
#     reaction/{probe,ticks,events}.tsv   the certified GisAgent.step() reacting to waves
#     connectivity/compare.tsv            field-for-field vs the archived reports
#     connectivity/*.regen.json           the regenerated reports
#
#   powershell -File websim\pipeline\java-exporter\dump-closure-fixtures.ps1
#   powershell -File websim\pipeline\java-exporter\dump-closure-fixtures.ps1 -SkipCompile
#   powershell -File websim\pipeline\java-exporter\dump-closure-fixtures.ps1 -Parts connectivity
#   powershell -File websim\pipeline\java-exporter\dump-closure-fixtures.ps1 -Seeds 42
#   powershell -File websim\pipeline\java-exporter\dump-closure-fixtures.ps1 -FullTrees
#   powershell -File websim\pipeline\java-exporter\dump-closure-fixtures.ps1 -Verify
#
# -FullTrees additionally writes every post-wave shelter tree in full
# (~500 MB). The default digest+subset dump is sufficient: trees.tsv carries a
# SHA-256 over the WHOLE distance+predecessor array in a documented canonical
# form, so the port proves full equality by digest and only ships the subset.
#
# -Verify runs the dumper a SECOND time into a scratch tree and diffs every
# file's SHA-256 -- the acceptance criterion "the dumps regenerate
# byte-identically". It doubles the runtime.
#
# Env defaults match scripts/run-headless.ps1: JAVA_HOME (JDK 17), REPAST_HOME.

param(
  [switch]$SkipCompile,
  [switch]$FullTrees,
  [switch]$Verify,
  [string]$Parts = 'all',
  [string]$Seeds = '42,43,44'
)

$ErrorActionPreference = 'Stop'
$javaHome   = if ($env:JAVA_HOME)   { $env:JAVA_HOME }   else { 'C:\Users\Chick\tools\jdk-17.0.19+10' }
$repastHome = if ($env:REPAST_HOME) { $env:REPAST_HOME } else { Join-Path $env:USERPROFILE 'RepastSimphony-2.11.0' }
$here       = $PSScriptRoot
$repoRoot   = (Resolve-Path (Join-Path $here '..\..\..')).Path
$geoDir     = Join-Path $repoRoot 'Geography'
$websimDir  = Join-Path $repoRoot 'websim'
$pluginsDir = Join-Path $repastHome 'eclipse\plugins'

if (-not (Test-Path (Join-Path $javaHome 'bin\javac.exe'))) { throw "JDK not found at $javaHome (set JAVA_HOME)" }
if (-not (Test-Path $pluginsDir)) { throw "Repast plugins not found at $pluginsDir (set REPAST_HOME)" }

$outDir = Join-Path $websimDir 'pipeline\out\closure-fixtures'
New-Item -ItemType Directory -Force $outDir | Out-Null

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
  # Certified sources -> websim ONLY (Geography/bin is never touched).
  $srcs = (Get-ChildItem (Join-Path $geoDir 'src') -Recurse -Filter *.java | ForEach-Object { $_.FullName -replace '\\','/' })
  (@('-nowarn','-encoding','UTF-8','-source','17','-target','17','-cp',('"'+$cpF+'"'),'-d',('"'+$hereF+'/geo-classes"')) + $srcs) -join "`n" |
    Out-File -Encoding ascii (Join-Path $here 'javac-args.txt')
  & "$javaHome\bin\javac.exe" "@$here\javac-args.txt"
  if ($LASTEXITCODE -ne 0) { throw "javac (Geography sources) failed" }

  # WP8 exporter. src-world is compiled alongside because the closure oracle
  # reuses its CertifiedGraph + Io (both public); nothing in src-world changes.
  $wp8 = (Get-ChildItem (Join-Path $here 'src-closures'),(Join-Path $here 'src-world') -Recurse -Filter *.java |
          ForEach-Object { $_.FullName -replace '\\','/' })
  (@('-nowarn','-encoding','UTF-8','-cp',('"'+$cpF+';'+$hereF+'/geo-classes"'),'-d',('"'+$hereF+'/out-closures"')) + $wp8) -join "`n" |
    Out-File -Encoding ascii (Join-Path $here 'javac-closures-args.txt')
  & "$javaHome\bin\javac.exe" "@$here\javac-closures-args.txt"
  if ($LASTEXITCODE -ne 0) { throw "javac (WP8 exporter) failed" }
}

function Invoke-Dump([string]$target) {
  New-Item -ItemType Directory -Force $target | Out-Null
  $runArgs = @(
    '-XX:+IgnoreUnrecognizedVMOptions',
    '--add-opens=java.base/java.lang.reflect=ALL-UNNAMED',
    '--add-modules=ALL-SYSTEM',
    '--add-exports=java.base/jdk.internal.ref=ALL-UNNAMED',
    '--add-exports=java.desktop/sun.awt=ALL-UNNAMED',
    '--add-exports=java.base/java.lang=ALL-UNNAMED',
    # cglib (behind Repast's CallBackAction) reflects into ClassLoader.defineClass
    # to build a FastClass for a scheduled method, so java.lang must be OPENED.
    '--add-opens=java.base/java.lang=ALL-UNNAMED',
    '--add-opens=java.base/java.util=ALL-UNNAMED',
    # java.util.Random.seed is read (raw) so the port can compare stream state.
    '--add-opens=java.base/java.util.concurrent.atomic=ALL-UNNAMED',
    '-Xmx6g'
  )
  if ($FullTrees) { $runArgs += '-Dwebsim.wp8.fullTrees=true' }
  $runArgs += @(
    '-cp', ('"' + $cpF + ';' + $hereF + '/geo-classes;' + $hereF + '/out-closures"'),
    'websim.exporter.closures.ClosureOracle',
    ('"' + (((Resolve-Path $target).Path) -replace '\\','/') + '"'),
    # QUOTED: java's @argfile splits on whitespace, and PowerShell renders an
    # array-bound -Seeds as "42 43 44", which would otherwise arrive as three
    # separate arguments and silently dump seed 42 only.
    ('"' + ($Parts -join ',') + '"'),
    ('"' + ($Seeds -join ',') + '"')
  )
  $runArgs -join "`n" | Out-File -Encoding ascii (Join-Path $here 'java-closures-run-args.txt')
  Push-Location $geoDir
  try {
    & "$javaHome\bin\java.exe" "@$here\java-closures-run-args.txt"
    if ($LASTEXITCODE -ne 0) { throw "ClosureOracle failed (exit $LASTEXITCODE)" }
  } finally { Pop-Location }
}

Write-Host "== WP8 closure oracle run 1 (parts=$Parts seeds=$Seeds) -> $outDir"
Invoke-Dump $outDir

if ($Verify) {
  # Run 2 lands in the OS temp tree, never under pipeline/out/, so a verification
  # pass can never leave scratch behind for `npm run check:scratch` to find.
  $out2 = Join-Path ([System.IO.Path]::GetTempPath()) ('websim-closure-verify-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Force $out2 | Out-Null
  Write-Host "== WP8 closure oracle run 2 (byte-identity verification) -> $out2"
  Invoke-Dump $out2

  function Hash-Tree([string]$root) {
    $map = @{}
    if (-not (Test-Path $root)) { return $map }
    foreach ($f in (Get-ChildItem $root -Recurse -File | Sort-Object FullName)) {
      $rel = $f.FullName.Substring($root.Length).TrimStart('\','/') -replace '\\','/'
      $map[$rel] = (Get-FileHash -Algorithm SHA256 $f.FullName).Hash
    }
    return $map
  }
  # manifest.json carries javaVersion/javaVendor only -- no clock, no paths -- so
  # it is compared like every other file.
  $a = Hash-Tree $outDir; $b = Hash-Tree $out2
  $mismatch = 0; $compared = 0
  foreach ($k in ($a.Keys | Sort-Object)) {
    if (-not $b.ContainsKey($k)) { Write-Host "  MISSING in run 2: $k"; $mismatch++; continue }
    $compared++
    if ($a[$k] -ne $b[$k]) { Write-Host "  DIFFERS: $k"; $mismatch++ }
  }
  foreach ($k in ($b.Keys | Sort-Object)) {
    if (-not $a.ContainsKey($k)) { Write-Host "  EXTRA in run 2: $k"; $mismatch++ }
  }
  if ($mismatch -gt 0) { throw "BYTE-IDENTITY FAILED: $mismatch of $compared files differ" }
  Write-Host "== BYTE-IDENTITY VERIFIED: $compared files, 0 differences across two independent runs"
  Remove-Item -Recurse -Force $out2
}

$bytes = (Get-ChildItem $outDir -Recurse -File | Measure-Object -Property Length -Sum).Sum
Write-Host ("WP8 dumps: {0:N0} files, {1:N1} MB -> {2}" -f `
  (Get-ChildItem $outDir -Recurse -File).Count, ($bytes / 1MB), $outDir)
