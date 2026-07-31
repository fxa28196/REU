# run-export.ps1 -- SPIKE S2: build + run the read-only certified graph exporter.
#
# Compiles the certified Geography sources into websim (NEVER into Geography/),
# compiles GraphExport against them, and runs it with the working directory set
# to Geography/ (the certified loader is handed the production-relative path
# "./data/Streets.shp").
#
#   powershell -File websim\pipeline\java-exporter\run-export.ps1
#   powershell -File websim\pipeline\java-exporter\run-export.ps1 -NoU27   # diagnostic
#
# Env defaults match scripts/run-headless.ps1: JAVA_HOME (JDK 17), REPAST_HOME.

param(
  [switch]$NoU27,
  [switch]$SkipCompile,
  [string]$OutDir
)

$ErrorActionPreference = 'Stop'
$javaHome   = if ($env:JAVA_HOME)   { $env:JAVA_HOME }   else { 'C:\Users\Chick\tools\jdk-17.0.19+10' }
$repastHome = if ($env:REPAST_HOME) { $env:REPAST_HOME } else { Join-Path $env:USERPROFILE 'RepastSimphony-2.11.0' }
$here       = $PSScriptRoot
$repoRoot   = (Resolve-Path (Join-Path $here '..\..\..')).Path
$geoDir     = Join-Path $repoRoot 'Geography'
$pluginsDir = Join-Path $repastHome 'eclipse\plugins'
if (-not $OutDir) {
  $OutDir = if ($NoU27) { Join-Path $here '..\out\graph-dump-nou27' } else { Join-Path $here '..\out\graph-dump' }
}
New-Item -ItemType Directory -Force $OutDir | Out-Null
$OutDirAbs = (Resolve-Path $OutDir).Path

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
($cp) | Out-File -Encoding ascii (Join-Path $here 'classpath.txt')

if (-not $SkipCompile) {
  # Certified sources -> websim ONLY (Geography/bin is never touched).
  $srcs = (Get-ChildItem (Join-Path $geoDir 'src') -Recurse -Filter *.java | ForEach-Object { $_.FullName -replace '\\','/' })
  (@('-nowarn','-encoding','UTF-8','-source','17','-target','17','-cp',('"'+$cpF+'"'),'-d',('"'+$hereF+'/geo-classes"')) + $srcs) -join "`n" |
    Out-File -Encoding ascii (Join-Path $here 'javac-args.txt')
  & "$javaHome\bin\javac.exe" "@$here\javac-args.txt"
  if ($LASTEXITCODE -ne 0) { throw "javac (Geography sources) failed" }

  (@('-nowarn','-encoding','UTF-8','-cp',('"'+$cpF+';'+$hereF+'/geo-classes"'),'-d',('"'+$hereF+'/out"'),($hereF+'/GraphExport.java'))) -join "`n" |
    Out-File -Encoding ascii (Join-Path $here 'javac-exporter-args.txt')
  & "$javaHome\bin\javac.exe" "@$here\javac-exporter-args.txt"
  if ($LASTEXITCODE -ne 0) { throw "javac (GraphExport) failed" }
}

# ---- run (JVM flags verbatim from scripts/run-headless.ps1) ------------------
$runArgs = @(
  '-XX:+IgnoreUnrecognizedVMOptions',
  '--add-opens=java.base/java.lang.reflect=ALL-UNNAMED',
  '--add-modules=ALL-SYSTEM',
  '--add-exports=java.base/jdk.internal.ref=ALL-UNNAMED',
  '--add-exports=java.desktop/sun.awt=ALL-UNNAMED',
  '--add-exports=java.base/java.lang=ALL-UNNAMED',
  '--add-opens=java.base/java.util=ALL-UNNAMED',
  '-Xmx6g',
  '-cp', ('"' + $cpF + ';' + $hereF + '/geo-classes;' + $hereF + '/out"'),
  'GraphExport',
  ('"' + ($OutDirAbs -replace '\\','/') + '"')
)
if ($NoU27) { $runArgs += '--no-u27' }
$runArgs -join "`n" | Out-File -Encoding ascii (Join-Path $here 'java-run-args.txt')

Push-Location $geoDir
try {
  & "$javaHome\bin\java.exe" "@$here\java-run-args.txt"
  if ($LASTEXITCODE -ne 0) { throw "GraphExport failed (exit $LASTEXITCODE)" }
} finally { Pop-Location }
Write-Host "S2 dump: $OutDirAbs"
