# run-model.ps1 -- compile and launch the Repast Simphony Geography model
# without Gradle or Eclipse (pure JDK fallback path).
#
# Usage:
#   powershell -File scripts\run-model.ps1                # compile + launch GUI
#   powershell -File scripts\run-model.ps1 -CompileOnly   # compile only
#   powershell -File scripts\run-model.ps1 -DebugJvm      # launch, wait for debugger on :5005
#
# Environment (defaults match docs/setup/ENVIRONMENT_SETUP.md):
#   JAVA_HOME    JDK 17 install  (default C:\Users\Chick\tools\jdk-17.0.19+10)
#   REPAST_HOME  Repast Simphony 2.11.0 install (default %USERPROFILE%\RepastSimphony-2.11.0)

param(
    [switch]$CompileOnly,
    [switch]$DebugJvm
)

$ErrorActionPreference = 'Stop'

$javaHome   = if ($env:JAVA_HOME)   { $env:JAVA_HOME }   else { 'C:\Users\Chick\tools\jdk-17.0.19+10' }
$repastHome = if ($env:REPAST_HOME) { $env:REPAST_HOME } else { Join-Path $env:USERPROFILE 'RepastSimphony-2.11.0' }
$projectDir = Join-Path (Split-Path $PSScriptRoot -Parent) 'Geography'
$pluginsDir = Join-Path $repastHome 'eclipse\plugins'

if (-not (Test-Path (Join-Path $javaHome 'bin\javac.exe'))) { throw "JDK not found at $javaHome (set JAVA_HOME)" }
if (-not (Test-Path $pluginsDir)) { throw "Repast plugins not found at $pluginsDir (set REPAST_HOME)" }

# ---- Compile src -> bin via Gradle ----
# Gradle owns the classpath (build.gradle resolves the ~1,265 Repast plugin jars
# as a fileTree) and targets Geography/bin, which is the directory
# Geography.rs/user_path.xml scans for agent classes.
#
# This previously invoked javac directly with an @argfile. That is not viable on
# Windows: javac treats a backslash inside an argfile as an escape character, so
# every path in the classpath was silently corrupted (C:\Users -> C:Users) and
# every Repast/GeoTools import failed to resolve.
Push-Location $projectDir
try {
    & (Join-Path $projectDir 'gradlew.bat') compileJava --console=plain
    if ($LASTEXITCODE -ne 0) { throw "gradlew compileJava failed with exit code $LASTEXITCODE" }
} finally {
    Pop-Location
}
Write-Host "Compile OK -> $projectDir\bin"
if ($CompileOnly) { exit 0 }

# ---- Launch RepastMain (classpath = runtime plugin only; Repast bootstraps the rest) ----
$runtimeDir = Get-ChildItem $pluginsDir -Directory |
              Where-Object { $_.Name -like 'repast.simphony.runtime_*' } |
              Select-Object -First 1
if (-not $runtimeDir) { throw "repast.simphony.runtime_* not found under $pluginsDir" }
$runCp = (Join-Path $runtimeDir.FullName 'bin') + ';' + (Join-Path $runtimeDir.FullName 'lib\*')

# JVM flags verbatim from launchers/Geography Model.launch (and hs_err_pid5412.log),
# plus -Xmx4g because the 112k-feature street layer OOMed on the default heap.
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
if ($DebugJvm) {
    $jvmArgs += '-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=5005'
    Write-Host 'JVM will wait for a debugger on localhost:5005 ...'
}

Push-Location $projectDir
try {
    & (Join-Path $javaHome 'bin\java.exe') @jvmArgs -cp $runCp `
        repast.simphony.runtime.RepastMain (Join-Path $projectDir 'Geography.rs')
} finally {
    Pop-Location
}
