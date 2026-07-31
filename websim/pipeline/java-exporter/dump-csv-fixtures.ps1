# dump-csv-fixtures.ps1 -- WP5: adversarial byte fixtures for the CsvLoader port.
#
# geography.data.CsvLoader depends on nothing outside java.io / java.util, so
# this compiles ONE certified source file plus the dumper and needs neither
# Repast nor GeoTools. Compile output goes into websim only; Geography/ is read.
#
#   powershell -File websim\pipeline\java-exporter\dump-csv-fixtures.ps1
#   powershell -File websim\pipeline\java-exporter\dump-csv-fixtures.ps1 -Verify
#
# -Verify runs the dumper twice into different files and compares SHA-256, which
# is the "dumps regenerate byte-identically" acceptance.

param([switch]$Verify)

$ErrorActionPreference = 'Stop'
$javaHome  = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { 'C:\Users\Chick\tools\jdk-17.0.19+10' }
$here      = $PSScriptRoot
$repoRoot  = (Resolve-Path (Join-Path $here '..\..\..')).Path
$geoSrc    = Join-Path $repoRoot 'Geography\src'
$websimDir = Join-Path $repoRoot 'websim'

if (-not (Test-Path (Join-Path $javaHome 'bin\javac.exe'))) { throw "JDK not found at $javaHome (set JAVA_HOME)" }

$outClasses = Join-Path $here 'out-csv'
$fixture    = Join-Path $websimDir 'engine\test\fixtures\csv\adversarial.tsv'
New-Item -ItemType Directory -Force $outClasses | Out-Null
New-Item -ItemType Directory -Force (Split-Path $fixture) | Out-Null

$javac = Join-Path $javaHome 'bin\javac.exe'
$java  = Join-Path $javaHome 'bin\java.exe'

Write-Host '[WP5] compiling certified CsvLoader + adversarial dumper into websim/pipeline/java-exporter/out-csv'
& $javac -encoding UTF-8 -nowarn -d $outClasses `
  (Join-Path $geoSrc 'geography\data\CsvLoader.java') `
  (Join-Path $here 'src-csv\websim\exporter\csv\CsvAdversarialDumper.java')
if ($LASTEXITCODE -ne 0) { throw "javac failed ($LASTEXITCODE)" }

& $java -cp $outClasses websim.exporter.csv.CsvAdversarialDumper $fixture
if ($LASTEXITCODE -ne 0) { throw "dumper failed ($LASTEXITCODE)" }

if ($Verify) {
  $second = Join-Path $env:TEMP 'websim-csv-adversarial-verify.tsv'
  & $java -cp $outClasses websim.exporter.csv.CsvAdversarialDumper $second
  if ($LASTEXITCODE -ne 0) { throw "verify run failed ($LASTEXITCODE)" }
  $a = (Get-FileHash $fixture -Algorithm SHA256).Hash
  $b = (Get-FileHash $second  -Algorithm SHA256).Hash
  Remove-Item $second -Force
  if ($a -ne $b) { throw "dump is NOT reproducible: $a vs $b" }
  Write-Host "[WP5] reproducible: sha256 $a"
}

Write-Host "[WP5] fixture at $fixture"
