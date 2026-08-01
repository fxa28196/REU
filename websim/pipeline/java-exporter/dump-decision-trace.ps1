# dump-decision-trace.ps1 -- WP8: the Java DECISION-LAYER TRACE oracle.
#
# Pipeline (all compiler output lands inside websim/; Geography/ is read-only):
#   1. compile the probe/instrumenter/dump helpers      -> out-probe/
#   2. generate the INSTRUMENTED GisAgent.java          -> gen-src/  (+ audit)
#   3. compile the certified Geography sources          -> geo-classes/
#   4. compile Geography with the instrumented GisAgent -> geo-inst-classes/
#   5. compile the WP5/WP6 exporter (CertifiedGraph/Io) -> out-world/
#   6. compile the WP8 driver                           -> out-decision/
#   7. run the driver against geo-inst-classes          -> websim/pipeline/out/decision-fixtures/
#
# Usage (from the repo root):
#   powershell -File websim\pipeline\java-exporter\dump-decision-trace.ps1
#   powershell -File websim\pipeline\java-exporter\dump-decision-trace.ps1 -Only "ER-A"
#   powershell -File websim\pipeline\java-exporter\dump-decision-trace.ps1 -SkipCompile
#   powershell -File websim\pipeline\java-exporter\dump-decision-trace.ps1 -Neutrality -Only "E0-A"
#
# -Neutrality is the acceptance gate for "the instrumentation changes nothing":
# it runs the IDENTICAL driver a second time against the CERTIFIED geo-classes
# (where the probe calls simply do not exist) into a scratch tree, and requires
# agents-final.tsv and draws-digest.tsv to be byte-identical between the two.

param(
  [switch]$SkipCompile,
  [switch]$CompileOnly,
  [switch]$Neutrality,
  [string]$Only = "",
  [string]$OutDir = ""
)

$ErrorActionPreference = 'Stop'
$javaHome   = if ($env:JAVA_HOME)   { $env:JAVA_HOME }   else { 'C:\Users\Chick\tools\jdk-17.0.19+10' }
$repastHome = if ($env:REPAST_HOME) { $env:REPAST_HOME } else { Join-Path $env:USERPROFILE 'RepastSimphony-2.11.0' }
$here       = $PSScriptRoot
$repoRoot   = (Resolve-Path (Join-Path $here '..\..\..')).Path
$geoDir     = Join-Path $repoRoot 'Geography'
$pluginsDir = Join-Path $repastHome 'eclipse\plugins'

if (-not (Test-Path (Join-Path $javaHome 'bin\javac.exe'))) { throw "JDK not found at $javaHome (set JAVA_HOME)" }
if (-not (Test-Path $pluginsDir)) { throw "Repast plugins not found at $pluginsDir (set REPAST_HOME)" }

$outFixtures = if ($OutDir) { $OutDir } else { Join-Path $repoRoot 'websim\pipeline\out\decision-fixtures' }
New-Item -ItemType Directory -Force $outFixtures | Out-Null

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

function Invoke-Javac([string]$argsFile, [string[]]$flags, [string[]]$sources) {
  ($flags + $sources) -join "`n" | Out-File -Encoding ascii (Join-Path $here $argsFile)
  & "$javaHome\bin\javac.exe" "@$here\$argsFile"
  if ($LASTEXITCODE -ne 0) { throw "javac failed ($argsFile)" }
}

if (-not $SkipCompile) {
  Write-Host "== 1/6 probe + instrumenter -> out-probe"
  $probeSrc = @('DecisionProbe','RecordingRandom','Instrument','Dump') |
              ForEach-Object { "$hereF/src-decision/websim/exporter/decision/$_.java" }
  Invoke-Javac 'javac-probe-args.txt' @('-nowarn','-encoding','UTF-8','-d',('"'+$hereF+'/out-probe"')) $probeSrc

  Write-Host "== 2/6 generate the instrumented GisAgent -> gen-src"
  Remove-Item -Recurse -Force (Join-Path $here 'gen-src') -ErrorAction SilentlyContinue
  & "$javaHome\bin\java.exe" -cp (Join-Path $here 'out-probe') websim.exporter.decision.Instrument `
      (Join-Path $geoDir 'src\geography\agents\GisAgent.java') `
      (Join-Path $here 'gen-src') `
      (Join-Path $here 'gen-src\instrumentation-audit.txt')
  if ($LASTEXITCODE -ne 0) { throw "instrumentation failed" }

  Write-Host "== 3/6 certified Geography -> geo-classes"
  $geoSrcs = (Get-ChildItem (Join-Path $geoDir 'src') -Recurse -Filter *.java | ForEach-Object { $_.FullName -replace '\\','/' })
  Invoke-Javac 'javac-geo-args.txt' `
    @('-nowarn','-encoding','UTF-8','-source','17','-target','17','-cp',('"'+$cpF+'"'),'-d',('"'+$hereF+'/geo-classes"')) `
    $geoSrcs

  Write-Host "== 4/6 instrumented Geography -> geo-inst-classes"
  Remove-Item -Recurse -Force (Join-Path $here 'geo-inst-classes') -ErrorAction SilentlyContinue
  $instSrcs = ($geoSrcs | Where-Object { $_ -notmatch 'agents/GisAgent\.java$' })
  $instSrcs += ("$hereF/gen-src/geography/agents/GisAgent.java")
  Invoke-Javac 'javac-geo-inst-args.txt' `
    @('-nowarn','-encoding','UTF-8','-source','17','-target','17','-cp',('"'+$cpF+';'+$hereF+'/out-probe"'),'-d',('"'+$hereF+'/geo-inst-classes"')) `
    $instSrcs

  Write-Host "== 5/6 WP5/WP6 exporter (CertifiedGraph, Io) -> out-world"
  $worldSrcs = (Get-ChildItem (Join-Path $here 'src-world') -Recurse -Filter *.java | ForEach-Object { $_.FullName -replace '\\','/' })
  Invoke-Javac 'javac-world-dec-args.txt' `
    @('-nowarn','-encoding','UTF-8','-cp',('"'+$cpF+';'+$hereF+'/geo-classes"'),'-d',('"'+$hereF+'/out-world"')) `
    $worldSrcs

  Write-Host "== 6/6 WP8 driver -> out-decision"
  Invoke-Javac 'javac-decision-args.txt' `
    @('-nowarn','-encoding','UTF-8','-cp',('"'+$cpF+';'+$hereF+'/geo-classes;'+$hereF+'/out-probe;'+$hereF+'/out-world"'),'-d',('"'+$hereF+'/out-decision"')) `
    @("$hereF/src-decision/websim/exporter/decision/DecisionTrace.java")
}

if ($CompileOnly) { Write-Host "== compile only: done"; exit 0 }

function Invoke-Trace([string]$geoClasses, [string]$target, [string]$label) {
  New-Item -ItemType Directory -Force $target | Out-Null
  $runArgs = @(
    '-XX:+IgnoreUnrecognizedVMOptions',
    '--add-opens=java.base/java.lang.reflect=ALL-UNNAMED',
    '--add-modules=ALL-SYSTEM',
    '--add-exports=java.base/jdk.internal.ref=ALL-UNNAMED',
    '--add-exports=java.desktop/sun.awt=ALL-UNNAMED',
    '--add-exports=java.base/java.lang=ALL-UNNAMED',
    # cglib (behind Repast's CallBackAction) reflects into ClassLoader.defineClass
    # to build a FastClass for the scheduled method, so java.lang must be OPENED.
    '--add-opens=java.base/java.lang=ALL-UNNAMED',
    '--add-opens=java.base/java.util=ALL-UNNAMED',
    '-Xmx8g', '-Xss8m'
  )
  $runArgs += @(
    '-cp', ('"' + $cpF + ';' + ($geoClasses -replace '\\','/') + ';' + $hereF + '/out-probe;' + $hereF + '/out-world;' + $hereF + '/out-decision"'),
    'websim.exporter.decision.DecisionTrace',
    ('"' + (((Resolve-Path $target).Path) -replace '\\','/') + '"'),
    ('"' + $Only + '"'),
    ('"' + $label + '"')
  )
  $runArgs -join "`n" | Out-File -Encoding ascii (Join-Path $here "java-decision-$label-run-args.txt")
  Push-Location $geoDir
  try {
    & "$javaHome\bin\java.exe" "@$here\java-decision-$label-run-args.txt"
    if ($LASTEXITCODE -ne 0) { throw "DecisionTrace ($label) failed (exit $LASTEXITCODE)" }
  } finally { Pop-Location }
}

# SEC-A is deliberately excluded from the main invocation and run in its own JVM:
# StreetNetwork.blockEdge()/declareClosureSchedule() are permanent, so two closure
# arms in one process would make the second one run on the first one's mutilated
# graph. SE-E18 is the archived arm and gets the pristine one.
$mainOnly = if ($Only) { $Only } else { "E0-A,E0-B,E0-C,ER-A,ER-C,LEG-A,ERL-A,L0P-A,SE-E18" }
$Only = $mainOnly
Write-Host "== INSTRUMENTED run -> $outFixtures  (configs: $mainOnly)"
Invoke-Trace (Join-Path $here 'geo-inst-classes') $outFixtures 'instrumented'

if (-not $PSBoundParameters.ContainsKey('Only')) {
  $covDir = Join-Path $outFixtures 'cov-closures'
  $Only = 'SEC-A'
  Write-Host "== INSTRUMENTED closure-coverage run (own JVM, pristine graph) -> $covDir"
  Invoke-Trace (Join-Path $here 'geo-inst-classes') $covDir 'instrumented'
  $Only = $mainOnly
}

if ($Neutrality) {
  $scratch = Join-Path ([System.IO.Path]::GetTempPath()) ('websim-decision-neutrality-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Force $scratch | Out-Null
  Write-Host "== CERTIFIED control run (no probe calls exist in this GisAgent) -> $scratch"
  Invoke-Trace (Join-Path $here 'geo-classes') $scratch 'certified'

  $bad = 0
  foreach ($f in @('agents-final.tsv','draws-digest.tsv','shelters.tsv')) {
    $a = Join-Path $outFixtures $f
    $b = Join-Path $scratch $f
    if (-not (Test-Path $b)) { Write-Host "  MISSING in control run: $f"; $bad++; continue }
    $ha = (Get-FileHash -Algorithm SHA256 $a).Hash
    $hb = (Get-FileHash -Algorithm SHA256 $b).Hash
    if ($ha -ne $hb) { Write-Host "  DIFFERS: $f`n    instrumented $ha`n    certified    $hb"; $bad++ }
    else { Write-Host "  IDENTICAL: $f  $ha" }
  }
  if ($bad -gt 0) { throw "NEUTRALITY GATE FAILED: $bad file(s) differ -- the instrumentation is NOT behaviour-neutral" }
  Write-Host "== NEUTRALITY GATE PASSED: instrumented == certified on every outcome file"
  Remove-Item -Recurse -Force $scratch
}

Get-ChildItem $outFixtures -File | Sort-Object Name | ForEach-Object {
  Write-Host ("  {0,-24} {1,14:N0} bytes" -f $_.Name, $_.Length)
}
$total = (Get-ChildItem $outFixtures -File | Measure-Object -Property Length -Sum).Sum
Write-Host ("  TOTAL {0:N1} MiB" -f ($total / 1MB))
