<#
.SYNOPSIS
  Dumps the Tier-0 VOLUME fixture: 10^7 draws x 5 seeds x 2 generators, from real Java.

.DESCRIPTION
  Compiles and runs websim.exporter.RngVolumeDumper, writing

    engine/test/fixtures/rng/rng-volume.json   (committed, ~21 KB: digests + checkpoints + heads)

  This is the plan section 3.3 / 5.1 Tier-0 criterion ("10^7 draws x generators x seeds")
  that DR-S5's 2,630,000-draw fixture set did not reach. 10^8 tokens is ~1.7 GB of hex, so
  the artefact is a streaming SHA-256 per sequence plus a CUMULATIVE checkpoint digest every
  10^6 draws; engine/test/rng/volume.parity.test.ts regenerates all 10^8 draws in TypeScript
  on every CI run and compares. The comparison is bit-for-bit; only the storage is compact.

  Runs alongside dump-rng-fixtures.ps1 and writes a DIFFERENT file -- the two certified
  fixtures (java-random.json, colt-mt19937.json) are not touched, so their bytes cannot move
  as a side effect of adding volume coverage.

  Compilation output goes to websim/pipeline/java-exporter/build only; nothing outside
  websim/ is written.

.EXAMPLE
  pwsh websim/pipeline/java-exporter/dump-rng-volume.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$javaHome = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { 'C:\Users\Chick\tools\jdk-17.0.19+10' }
$repastHome = if ($env:REPAST_HOME) { $env:REPAST_HOME } else { Join-Path $env:USERPROFILE 'RepastSimphony-2.11.0' }

$javac = Join-Path $javaHome 'bin\javac.exe'
$java = Join-Path $javaHome 'bin\java.exe'
if (-not (Test-Path $javac)) { throw "JDK not found at $javaHome (set JAVA_HOME)" }

$pluginsDir = Join-Path $repastHome 'eclipse\plugins'
if (-not (Test-Path $pluginsDir)) { throw "Repast plugins not found at $pluginsDir (set REPAST_HOME)" }

$coreDir = Join-Path $pluginsDir 'repast.simphony.core_2.11.0'
$coltJar = Join-Path $coreDir 'lib\colt-1.2.0-no_hep.jar'
if (-not (Test-Path $coltJar)) { throw "colt jar not found at $coltJar" }
$coreBin = Join-Path $coreDir 'bin'

$exporterDir = $PSScriptRoot
$websimDir = Split-Path (Split-Path $exporterDir -Parent) -Parent
$buildDir = Join-Path $exporterDir 'build'
$srcFile = Join-Path $exporterDir 'src\websim\exporter\RngVolumeDumper.java'
$fixtureDir = Join-Path $websimDir 'engine\test\fixtures\rng'

$compileCp = "$coltJar;$coreBin"
$runCp = "$buildDir;$coltJar;$coreBin"

New-Item -ItemType Directory -Force -Path $buildDir | Out-Null
New-Item -ItemType Directory -Force -Path $fixtureDir | Out-Null

Write-Host "compiling $srcFile"
& $javac -Xlint:all -d $buildDir -cp $compileCp $srcFile
if ($LASTEXITCODE -ne 0) { throw "javac failed with exit code $LASTEXITCODE" }

Write-Host "dumping 10^8 draws to $fixtureDir (this takes a few minutes)"
& $java -cp $runCp websim.exporter.RngVolumeDumper $fixtureDir
if ($LASTEXITCODE -ne 0) { throw "dumper failed with exit code $LASTEXITCODE" }

Write-Host ''
Write-Host 'Now verify the TypeScript clones against the new fixture:'
Write-Host '  npx vitest run --project engine test/rng/volume'
