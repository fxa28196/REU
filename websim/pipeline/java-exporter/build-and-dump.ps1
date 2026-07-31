# SPIKE WP2-S1 — compile + run the geodesic Direct fixture dumper.
#
# READ-ONLY against the repo: the only jar consumed is the GeographicLib the certified
# model links against (resolved from the Repast install, never copied). All build output
# lands under websim/pipeline/java-exporter/.
#
#   .\build-and-dump.ps1              # 10000 tuples per mode
#   .\build-and-dump.ps1 -N 1000      # smaller run

param(
  [int]$N = 10000
)

$ErrorActionPreference = 'Stop'

$javaHome   = if ($env:JAVA_HOME)   { $env:JAVA_HOME }   else { 'C:\Users\Chick\tools\jdk-17.0.19+10' }
$repastHome = if ($env:REPAST_HOME) { $env:REPAST_HOME } else { Join-Path $env:USERPROFILE 'RepastSimphony-2.11.0' }

$javac = Join-Path $javaHome 'bin\javac.exe'
$java  = Join-Path $javaHome 'bin\java.exe'
if (-not (Test-Path $javac)) { throw "javac not found at $javac (set JAVA_HOME)" }

$pluginsDir = Join-Path $repastHome 'eclipse\plugins'
if (-not (Test-Path $pluginsDir)) { throw "Repast plugins not found at $pluginsDir (set REPAST_HOME)" }

# Same resolution rule as Geography/build.gradle: repast.simphony.*/**/*.jar
$geoLib = Get-ChildItem $pluginsDir -Recurse -Filter 'GeographicLib-Java-*.jar' -ErrorAction SilentlyContinue |
          Select-Object -First 1
if (-not $geoLib) { throw "GeographicLib-Java-*.jar not found under $pluginsDir" }
Write-Host "GeographicLib jar: $($geoLib.FullName)"

$here     = $PSScriptRoot
$srcDir   = Join-Path $here 'src'
$outDir   = Join-Path $here 'out'
$fixtures = Join-Path $here 'fixtures'

New-Item -ItemType Directory -Force -Path $outDir   | Out-Null
New-Item -ItemType Directory -Force -Path $fixtures | Out-Null

$sources = @(Get-ChildItem $srcDir -Recurse -Filter '*.java' | ForEach-Object { $_.FullName })
Write-Host "Compiling $($sources.Count) source file(s) -> $outDir"
$javacArgs = @('-encoding', 'UTF-8', '-cp', $geoLib.FullName, '-d', $outDir) + $sources
& $javac $javacArgs
if ($LASTEXITCODE -ne 0) { throw "javac failed (exit $LASTEXITCODE)" }

$cp = "$outDir;$($geoLib.FullName)"
Write-Host "Dumping $N tuples per mode -> $fixtures"
$javaArgs = @('-cp', $cp, 'websim.exporter.GeodesicDirectFixtureDumper', $fixtures, "$N")
& $java $javaArgs
if ($LASTEXITCODE -ne 0) { throw "dumper failed (exit $LASTEXITCODE)" }

Get-ChildItem $fixtures -Filter '*.tsv' | ForEach-Object {
  Write-Host ("  {0}  {1:N0} bytes" -f $_.Name, $_.Length)
}
