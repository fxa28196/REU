<#
.SYNOPSIS
  Rebuilds the WP2-S5 RNG bit-parity fixtures from real Java.

.DESCRIPTION
  Compiles and runs websim.exporter.RngFixtureDumper against the JDK's java.util.Random
  and the cern/colt MersenneTwister shipped inside Repast Simphony, writing:

    engine/test/fixtures/rng/java-random.json    (committed, compact: head + SHA-256)
    engine/test/fixtures/rng/colt-mt19937.json   (committed, compact: head + SHA-256)
    pipeline/out/rng-full/*.hex                  (git-ignored, ~27 MB, -Full only)

  The dumper is deterministic: re-running it must produce byte-identical JSON. If a
  rerun changes a digest, the JDK or the colt jar changed underneath the port -- that is
  a finding, not a fixture to overwrite.

  Compilation output goes to websim/pipeline/java-exporter/build only; nothing outside
  websim/ is written.

.PARAMETER Full
  Also emit the full one-token-per-line dumps, which unlock the opt-in
  engine/test/rng/full-dump.parity.test.ts suite.

.EXAMPLE
  pwsh websim/pipeline/java-exporter/dump-rng-fixtures.ps1 -Full
#>
[CmdletBinding()]
param(
  [switch]$Full
)

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

# The Repast runtime is needed only for the RandomHelper cross-check; the dumper degrades
# gracefully (records SKIPPED) when it is absent.
$runtimeDir = Get-ChildItem $pluginsDir -Directory |
  Where-Object { $_.Name -like 'repast.simphony.runtime_*' } | Select-Object -First 1

$exporterDir = $PSScriptRoot
$websimDir = Split-Path (Split-Path $exporterDir -Parent) -Parent
$buildDir = Join-Path $exporterDir 'build'
$srcFile = Join-Path $exporterDir 'src\websim\exporter\RngFixtureDumper.java'
$fixtureDir = Join-Path $websimDir 'engine\test\fixtures\rng'
$fullDir = Join-Path $websimDir 'pipeline\out\rng-full'

$compileCp = "$coltJar;$coreBin"
$runCp = "$buildDir;$coltJar;$coreBin"
if ($runtimeDir) {
  $runCp = "$buildDir;$(Join-Path $runtimeDir.FullName 'bin');$(Join-Path $runtimeDir.FullName 'lib\*');$coreBin;$coltJar"
}

New-Item -ItemType Directory -Force -Path $buildDir | Out-Null
New-Item -ItemType Directory -Force -Path $fixtureDir | Out-Null

Write-Host "compiling $srcFile"
& $javac -Xlint:all -d $buildDir -cp $compileCp $srcFile
if ($LASTEXITCODE -ne 0) { throw "javac failed with exit code $LASTEXITCODE" }

# No --add-modules/--add-opens here. The Repast batch launcher needs them; this dumper
# only touches java.util.Random, colt and (reflectively) RandomHelper, and adding
# --add-modules=ALL-SYSTEM makes the JVM emit an incubator-module WARNING on stderr --
# which Windows PowerShell 5.1 turns into a terminating NativeCommandError.
$jvmArgs = @()
if ($Full) {
  $jvmArgs += '-Dwebsim.rng.full=true'
  New-Item -ItemType Directory -Force -Path $fullDir | Out-Null
}

Write-Host "dumping fixtures to $fixtureDir"
if ($jvmArgs.Count -gt 0) {
  & $java @jvmArgs -cp $runCp websim.exporter.RngFixtureDumper $fixtureDir $fullDir
} else {
  & $java -cp $runCp websim.exporter.RngFixtureDumper $fixtureDir $fullDir
}
if ($LASTEXITCODE -ne 0) { throw "dumper failed with exit code $LASTEXITCODE" }

Write-Host ''
Write-Host 'Now verify the TypeScript clones against the new fixtures:'
Write-Host '  npm test -w @websim/engine'
