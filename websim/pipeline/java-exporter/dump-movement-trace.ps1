# dump-movement-trace.ps1 -- FIX A: the DIRECT movement oracle.
#
# Compiles the certified Geography sources into websim (NEVER into Geography/),
# compiles the exporter against them, and runs MovementTrace with the working
# directory set to Geography/ (the certified loaders take production-relative
# paths).
#
# Output (COMMITTED -- this is a clean-clone oracle, not a gated one):
#   websim/engine/test/fixtures/movement/{ticks,routes,legs,smoke}.tsv + manifest.json
#
#   powershell -File websim\pipeline\java-exporter\dump-movement-trace.ps1
#   powershell -File websim\pipeline\java-exporter\dump-movement-trace.ps1 -SkipCompile
#   powershell -File websim\pipeline\java-exporter\dump-movement-trace.ps1 -Verify
#
# -Verify runs the dumper a SECOND time into a scratch tree and diffs every
# file's SHA-256: the acceptance criterion "the trace regenerates byte-identically".

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

if (-not (Test-Path (Join-Path $javaHome 'bin\javac.exe'))) { throw "JDK not found at $javaHome (set JAVA_HOME)" }
if (-not (Test-Path $pluginsDir)) { throw "Repast plugins not found at $pluginsDir (set REPAST_HOME)" }

# No bulk output tree: the whole trace is committed, so there is nothing to put
# under the git-ignored pipeline/out/ -- and an empty scratch directory there
# would (rightly) trip `npm run check:scratch`.
$fixtureDir = Join-Path $websimDir 'engine\test\fixtures'
New-Item -ItemType Directory -Force (Join-Path $fixtureDir 'movement') | Out-Null

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
  $srcs = (Get-ChildItem (Join-Path $geoDir 'src') -Recurse -Filter *.java | ForEach-Object { $_.FullName -replace '\\','/' })
  (@('-nowarn','-encoding','UTF-8','-source','17','-target','17','-cp',('"'+$cpF+'"'),'-d',('"'+$hereF+'/geo-classes"')) + $srcs) -join "`n" |
    Out-File -Encoding ascii (Join-Path $here 'javac-args.txt')
  & "$javaHome\bin\javac.exe" "@$here\javac-args.txt"
  if ($LASTEXITCODE -ne 0) { throw "javac (Geography sources) failed" }

  $srcWorld = (Get-ChildItem (Join-Path $here 'src-world') -Recurse -Filter *.java | ForEach-Object { $_.FullName -replace '\\','/' })
  (@('-nowarn','-encoding','UTF-8','-cp',('"'+$cpF+';'+$hereF+'/geo-classes"'),'-d',('"'+$hereF+'/out-world"')) + $srcWorld) -join "`n" |
    Out-File -Encoding ascii (Join-Path $here 'javac-world-args.txt')
  & "$javaHome\bin\javac.exe" "@$here\javac-world-args.txt"
  if ($LASTEXITCODE -ne 0) { throw "javac (exporter) failed" }
}

function Invoke-Dump([string]$targetFixtures) {
  New-Item -ItemType Directory -Force (Join-Path $targetFixtures 'movement') | Out-Null
  $runArgs = @(
    '-XX:+IgnoreUnrecognizedVMOptions',
    '--add-opens=java.base/java.lang.reflect=ALL-UNNAMED',
    '--add-modules=ALL-SYSTEM',
    '--add-exports=java.base/jdk.internal.ref=ALL-UNNAMED',
    '--add-exports=java.desktop/sun.awt=ALL-UNNAMED',
    '--add-exports=java.base/java.lang=ALL-UNNAMED',
    # cglib (behind Repast's CallBackAction) reflects into ClassLoader.defineClass
    # to build a FastClass for the scheduled method, so java.lang must be OPENED,
    # not merely exported. Scheduling is the only thing that needs this.
    '--add-opens=java.base/java.lang=ALL-UNNAMED',
    '--add-opens=java.base/java.util=ALL-UNNAMED',
    '-Xmx6g'
  )
  $runArgs += @(
    '-cp', ('"' + $cpF + ';' + $hereF + '/geo-classes;' + $hereF + '/out-world"'),
    'websim.exporter.world.MovementTrace',
    ('"' + (((Resolve-Path $targetFixtures).Path) -replace '\\','/') + '"')
  )
  $runArgs -join "`n" | Out-File -Encoding ascii (Join-Path $here 'java-move-run-args.txt')
  Push-Location $geoDir
  try {
    & "$javaHome\bin\java.exe" "@$here\java-move-run-args.txt"
    if ($LASTEXITCODE -ne 0) { throw "MovementTrace failed (exit $LASTEXITCODE)" }
  } finally { Pop-Location }
}

Write-Host "== FIX-A movement trace run 1 -> $fixtureDir\movement"
Invoke-Dump $fixtureDir

if ($Verify) {
  # Run 2 lands in the OS temp tree, never under pipeline/out/, so a verification
  # pass can never leave scratch behind for `npm run check:scratch` to find.
  $fx2 = Join-Path ([System.IO.Path]::GetTempPath()) ('websim-movement-verify-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Force $fx2 | Out-Null
  Write-Host "== FIX-A movement trace run 2 (byte-identity verification) -> $fx2"
  Invoke-Dump $fx2

  $a = Get-ChildItem (Join-Path $fixtureDir 'movement') -File | Sort-Object Name
  $mismatch = 0; $compared = 0
  foreach ($f in $a) {
    $other = Join-Path (Join-Path $fx2 'movement') $f.Name
    if (-not (Test-Path $other)) { Write-Host "  MISSING in run 2: $($f.Name)"; $mismatch++; continue }
    $compared++
    if ((Get-FileHash -Algorithm SHA256 $f.FullName).Hash -ne (Get-FileHash -Algorithm SHA256 $other).Hash) {
      Write-Host "  DIFFERS: $($f.Name)"; $mismatch++
    }
  }
  if ($mismatch -gt 0) { throw "BYTE-IDENTITY FAILED: $mismatch of $compared files differ" }
  Write-Host "== BYTE-IDENTITY VERIFIED: $compared files, 0 differences across two independent runs"
  Remove-Item -Recurse -Force $fx2
}

Get-ChildItem (Join-Path $fixtureDir 'movement') -File | ForEach-Object {
  Write-Host ("  {0,-16} {1,10:N0} bytes" -f $_.Name, $_.Length)
}
