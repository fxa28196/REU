# dump-world-fixtures.ps1 -- TASK F1: Java fixture exporter for WP5 + WP6.
#
# Compiles the certified Geography sources into websim (NEVER into Geography/),
# compiles the F1 exporter against them, and runs it with the working directory
# set to Geography/ (the certified loaders are handed production-relative paths).
#
# Outputs:
#   websim/pipeline/out/world-fixtures/        bulk dumps (git-ignored)
#   websim/engine/test/fixtures/world/         manifest + stride-sampled oracles
#   websim/engine/test/fixtures/format/        the HALF_UP formatter oracle
#
#   powershell -File websim\pipeline\java-exporter\dump-world-fixtures.ps1
#   powershell -File websim\pipeline\java-exporter\dump-world-fixtures.ps1 -SkipTrees
#   powershell -File websim\pipeline\java-exporter\dump-world-fixtures.ps1 -Verify
#
# -Verify runs the dumper a SECOND time into a scratch tree and diffs every
# file's SHA-256, which is the acceptance criterion "dumps regenerate
# byte-identically across two runs". It doubles the runtime.
#
# Env defaults match scripts/run-headless.ps1: JAVA_HOME (JDK 17), REPAST_HOME.

param(
  [switch]$SkipCompile,
  [switch]$SkipTrees,
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

if (-not (Test-Path (Join-Path $javaHome 'bin\javac.exe'))) { throw "JDK not found at $javaHome (set JAVA_HOME)" }
if (-not (Test-Path $pluginsDir)) { throw "Repast plugins not found at $pluginsDir (set REPAST_HOME)" }

$outDir     = Join-Path $websimDir 'pipeline\out\world-fixtures'
$fixtureDir = Join-Path $websimDir 'engine\test\fixtures'
New-Item -ItemType Directory -Force $outDir | Out-Null
New-Item -ItemType Directory -Force (Join-Path $fixtureDir 'world')  | Out-Null
New-Item -ItemType Directory -Force (Join-Path $fixtureDir 'format') | Out-Null

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

  # F1 exporter. Deliberately a SEPARATE source root from src/: build-and-dump.ps1
  # globs src/**.java with only the GeographicLib jar on the classpath, and these
  # classes need the whole Repast/GeoTools stack.
  $f1 = (Get-ChildItem (Join-Path $here 'src-world') -Recurse -Filter *.java | ForEach-Object { $_.FullName -replace '\\','/' })
  (@('-nowarn','-encoding','UTF-8','-cp',('"'+$cpF+';'+$hereF+'/geo-classes"'),'-d',('"'+$hereF+'/out-world"')) + $f1) -join "`n" |
    Out-File -Encoding ascii (Join-Path $here 'javac-world-args.txt')
  & "$javaHome\bin\javac.exe" "@$here\javac-world-args.txt"
  if ($LASTEXITCODE -ne 0) { throw "javac (F1 exporter) failed" }
}

function Invoke-Dump([string]$targetOut, [string]$targetFixtures) {
  New-Item -ItemType Directory -Force $targetOut | Out-Null
  New-Item -ItemType Directory -Force (Join-Path $targetFixtures 'world')  | Out-Null
  New-Item -ItemType Directory -Force (Join-Path $targetFixtures 'format') | Out-Null
  $runArgs = @(
    '-XX:+IgnoreUnrecognizedVMOptions',
    '--add-opens=java.base/java.lang.reflect=ALL-UNNAMED',
    '--add-modules=ALL-SYSTEM',
    '--add-exports=java.base/jdk.internal.ref=ALL-UNNAMED',
    '--add-exports=java.desktop/sun.awt=ALL-UNNAMED',
    '--add-exports=java.base/java.lang=ALL-UNNAMED',
    '--add-opens=java.base/java.util=ALL-UNNAMED',
    '-Xmx6g'
  )
  if ($SkipTrees) { $runArgs += '-Dwebsim.f1.skipTrees=true' }
  $runArgs += @(
    '-cp', ('"' + $cpF + ';' + $hereF + '/geo-classes;' + $hereF + '/out-world"'),
    'websim.exporter.world.WorldFixtures',
    ('"' + (((Resolve-Path $targetOut).Path) -replace '\\','/') + '"'),
    ('"' + (((Resolve-Path $targetFixtures).Path) -replace '\\','/') + '"')
  )
  $runArgs -join "`n" | Out-File -Encoding ascii (Join-Path $here 'java-world-run-args.txt')
  Push-Location $geoDir
  try {
    & "$javaHome\bin\java.exe" "@$here\java-world-run-args.txt"
    if ($LASTEXITCODE -ne 0) { throw "WorldFixtures failed (exit $LASTEXITCODE)" }
  } finally { Pop-Location }
}

Write-Host "== F1 run 1 -> $outDir"
Invoke-Dump $outDir $fixtureDir

if ($Verify) {
  $out2 = Join-Path $websimDir 'pipeline\out\world-fixtures-run2'
  $fx2  = Join-Path $websimDir 'pipeline\out\world-fixtures-run2-fixtures'
  if (Test-Path $out2) { Remove-Item -Recurse -Force $out2 }
  if (Test-Path $fx2)  { Remove-Item -Recurse -Force $fx2 }
  Write-Host "== F1 run 2 (byte-identity verification) -> $out2"
  Invoke-Dump $out2 $fx2

  function Hash-Tree([string]$root) {
    $map = @{}
    if (-not (Test-Path $root)) { return $map }
    foreach ($f in (Get-ChildItem $root -Recurse -File | Sort-Object FullName)) {
      $rel = $f.FullName.Substring($root.Length).TrimStart('\','/') -replace '\\','/'
      $map[$rel] = (Get-FileHash -Algorithm SHA256 $f.FullName).Hash
    }
    return $map
  }
  # Only F1's own outputs are compared. engine/test/fixtures/ also holds the
  # WP2-S5 rng/ fixtures, which this exporter neither writes nor owns; including
  # them would report a false byte-identity failure every time.
  $mismatch = 0; $compared = 0
  $pairs = @(
    @($outDir, $out2),
    @((Join-Path $fixtureDir 'world'),  (Join-Path $fx2 'world')),
    @((Join-Path $fixtureDir 'format'), (Join-Path $fx2 'format'))
  )
  foreach ($pair in $pairs) {
    $a = Hash-Tree $pair[0]; $b = Hash-Tree $pair[1]
    foreach ($k in ($a.Keys | Sort-Object)) {
      if (-not $b.ContainsKey($k)) { Write-Host "  MISSING in run 2: $k"; $mismatch++; continue }
      $compared++
      if ($a[$k] -ne $b[$k]) { Write-Host "  DIFFERS: $k"; $mismatch++ }
    }
    foreach ($k in ($b.Keys | Sort-Object)) {
      if (-not $a.ContainsKey($k)) { Write-Host "  EXTRA in run 2: $k"; $mismatch++ }
    }
  }
  if ($mismatch -gt 0) {
    throw "BYTE-IDENTITY FAILED: $mismatch of $compared files differ between two runs"
  }
  Write-Host "== BYTE-IDENTITY VERIFIED: $compared files, 0 differences across two independent runs"
  Remove-Item -Recurse -Force $out2
  Remove-Item -Recurse -Force $fx2
}

$bytes = (Get-ChildItem $outDir -Recurse -File | Measure-Object -Property Length -Sum).Sum
Write-Host ("F1 bulk dumps: {0:N0} files, {1:N1} MB -> {2}" -f `
  (Get-ChildItem $outDir -Recurse -File).Count, ($bytes / 1MB), $outDir)
Write-Host "F1 committed fixtures + manifest -> $fixtureDir"
