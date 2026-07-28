# run-headless.ps1 -- run the Geography model headless (no GUI, no Eclipse) and
# write the agent/shelter/simulation result files.
#
# Usage (from the repo root) -- -ParamsFile is REQUIRED:
#   powershell -File scripts\run-headless.ps1 -ParamsFile "batch\batch_params_2026_A_seed42.xml"
#   powershell -File scripts\run-headless.ps1 -ParamsFile "batch\batch_params_2026_C_seed44.xml" -TimeoutSec 600
#
# Outputs land in Geography\output\run_seed<seed>\ (agents.csv, shelters.csv,
# simulation.json). NOTE the output directory is keyed by SEED ONLY, so rename it
# immediately -- the next arm at the same seed will otherwise overwrite it.
#
# Parameters, including the random seed, come from the -ParamsFile you pass.
# The current pipeline is documented in docs/final/TECHNICAL_REFERENCE.md.
#
# Environment defaults match docs/setup/ENVIRONMENT_SETUP.md:
#   JAVA_HOME    JDK 17  (default C:\Users\Chick\tools\jdk-17.0.19+10)
#   REPAST_HOME  Repast Simphony 2.11.0 (default %USERPROFILE%\RepastSimphony-2.11.0)

param(
  [int]$TimeoutSec = 600,
  # Repast sweep/params file, relative to the Geography project dir.
  #
  # REQUIRED -- there is deliberately no default. This used to default to
  # batch\batch_params.xml, the retired n=50 regression fixture, so a bare
  # invocation silently ran a 50-agent smoke test that looked like a real run.
  # The current study arms are:
  #   batch\batch_params_2026_A_seed42.xml   reality        (36 sites / 2,234)
  #   batch\batch_params_2026_B_seed42.xml   more capacity  (36 sites / 6,842)
  #   batch\batch_params_2026_C_seed42.xml   better placed  (46 sites / 6,842)
  # Seeds 42-50 exist for each arm.
  [Parameter(Mandatory = $true)]
  [string]$ParamsFile
)

$ErrorActionPreference = 'Stop'
$javaHome   = if ($env:JAVA_HOME)   { $env:JAVA_HOME }   else { 'C:\Users\Chick\tools\jdk-17.0.19+10' }
$repastHome = if ($env:REPAST_HOME) { $env:REPAST_HOME } else { Join-Path $env:USERPROFILE 'RepastSimphony-2.11.0' }
$projectDir = Join-Path (Split-Path $PSScriptRoot -Parent) 'Geography'
$pluginsDir = Join-Path $repastHome 'eclipse\plugins'

if (-not (Test-Path (Join-Path $javaHome 'bin\java.exe'))) { throw "JDK not found at $javaHome (set JAVA_HOME)" }
if (-not (Test-Path $pluginsDir)) { throw "Repast plugins not found at $pluginsDir (set REPAST_HOME)" }

$runtimeDir = Get-ChildItem $pluginsDir -Directory |
              Where-Object { $_.Name -like 'repast.simphony.runtime_*' } | Select-Object -First 1
if (-not $runtimeDir) { throw "repast.simphony.runtime_* not found under $pluginsDir" }
$cp = (Join-Path $runtimeDir.FullName 'bin') + ';' + (Join-Path $runtimeDir.FullName 'lib\*')
$rs = (Resolve-Path (Join-Path $projectDir 'Geography.rs')).Path

# JVM flags verbatim from the Eclipse launcher + hs_err_pid5412.log; -Xmx4g for
# the 112k-feature street layer.
$jvmArgs = @(
  '-XX:+IgnoreUnrecognizedVMOptions',
  '--add-opens=java.base/java.lang.reflect=ALL-UNNAMED',
  '--add-modules=ALL-SYSTEM',
  '--add-exports=java.base/jdk.internal.ref=ALL-UNNAMED',
  '--add-exports=java.desktop/sun.awt=ALL-UNNAMED',
  '--add-exports=java.base/java.lang=ALL-UNNAMED',
  '--add-opens=java.base/java.util=ALL-UNNAMED',
  '--add-exports=java.xml/com.sun.org.apache.xpath.internal.objects=ALL-UNNAMED',
  '--add-exports=java.xml/com.sun.org.apache.xpath.internal=ALL-UNNAMED',
  '--add-opens=java.base/java.lang=ALL-UNNAMED',
  '-Xmx4g'
)

Push-Location $projectDir
try {
  $p = Start-Process -FilePath (Join-Path $javaHome 'bin\java.exe') `
        -ArgumentList ($jvmArgs + @('-cp', "`"$cp`"",
            'repast.simphony.runtime.RepastBatchMain',
            '-params', $ParamsFile, "`"$rs`"")) `
        -WorkingDirectory $projectDir -NoNewWindow -PassThru
  Wait-Process -Id $p.Id -Timeout $TimeoutSec -ErrorAction SilentlyContinue
  if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force; Write-Host "Stopped after ${TimeoutSec}s cap" }
  $latest = Get-ChildItem (Join-Path $projectDir 'output') -Directory |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($latest) { Write-Host "Results in $($latest.FullName)" }
} finally {
  Pop-Location
}
