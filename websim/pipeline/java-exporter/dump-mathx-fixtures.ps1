<#
.SYNOPSIS
  Rebuilds the WP3 (task F2) mathx parity fixtures from real Java.

.DESCRIPTION
  Compiles and runs websim.exporter.MathxFixtureDumper against the JDK's StrictMath,
  java.lang.Math, java.util.Formatter and the JLS narrowing casts, writing:

    engine/test/fixtures/mathx/mathx-strictmath.json   (committed)
    engine/test/fixtures/mathx/mathx-format.json       (committed)
    engine/test/fixtures/mathx/mathx-trunccast.json    (committed)

  The dumper links against nothing but the JDK -- no Repast, no colt, no GeographicLib --
  so this script needs only JAVA_HOME. It touches no file owned by the other exporters
  (GraphExport.java, RngFixtureDumper.java, GeodesicDirectFixtureDumper.java).

  The dumper is deterministic: re-running it must produce byte-identical JSON. If a rerun
  changes a file, the JDK changed underneath the port -- that is a finding, not a fixture
  to overwrite.

  Compilation output goes to websim/pipeline/java-exporter/build only; nothing outside
  websim/ is written.

.EXAMPLE
  pwsh websim/pipeline/java-exporter/dump-mathx-fixtures.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$javaHome = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { 'C:\Users\Chick\tools\jdk-17.0.19+10' }
$javac = Join-Path $javaHome 'bin\javac.exe'
$java = Join-Path $javaHome 'bin\java.exe'
if (-not (Test-Path $javac)) { throw "JDK not found at $javaHome (set JAVA_HOME)" }

$exporterDir = $PSScriptRoot
$websimDir = Split-Path (Split-Path $exporterDir -Parent) -Parent
$buildDir = Join-Path $exporterDir 'build'
$srcFile = Join-Path $exporterDir 'src\websim\exporter\MathxFixtureDumper.java'
$fixtureDir = Join-Path $websimDir 'engine\test\fixtures\mathx'

New-Item -ItemType Directory -Force -Path $buildDir | Out-Null
New-Item -ItemType Directory -Force -Path $fixtureDir | Out-Null

Write-Host "compiling $srcFile"
& $javac -Xlint:all -d $buildDir $srcFile
if ($LASTEXITCODE -ne 0) { throw "javac failed with exit code $LASTEXITCODE" }

Write-Host "dumping mathx fixtures to $fixtureDir"
& $java -cp $buildDir websim.exporter.MathxFixtureDumper $fixtureDir
if ($LASTEXITCODE -ne 0) { throw "dumper failed with exit code $LASTEXITCODE" }

Write-Host ''
Write-Host 'Now verify the TypeScript ports against the new fixtures:'
Write-Host '  npm test -w @websim/engine'
