# fetch-aqs-pm25.ps1 -- reproducibly re-acquire the study's hourly PM2.5 dataset
# from EPA's Air Quality System (AQS) pre-generated AirData files.
#
# Produces: Geography/data/airnow/aqs_hourly_pm25_portland_2020-09.csv
#           (Multnomah + Washington + Clackamas counties, September 2020)
#
# Provenance, licensing and known limitations: Geography/data/README.md
# and docs/science/DATA_SOURCES.md (dataset D3).
#
# Why parameter 88502 and not 88101:
#   88101 = PM2.5 FRM/FEM mass. The 2020 hourly 88101 file contains NO
#           Multnomah County monitors (verified 2026-07-24: only Harney,
#           Klamath and Lane County sites report hourly 88101 in Oregon).
#   88502 = "Acceptable PM2.5 AQI & Speciation Mass" (non-FRM continuous).
#           This is how Oregon DEQ's Portland-area continuous monitors
#           report, and it is the series behind AirNow's real-time AQI.
#
# Usage:
#   powershell -File scripts\fetch-aqs-pm25.ps1
#   powershell -File scripts\fetch-aqs-pm25.ps1 -Year 2020 -Month 09 -KeepRaw

param(
    [int]$Year = 2020,
    [string]$Month = '09',
    [string[]]$Counties = @('Multnomah', 'Washington', 'Clackamas'),
    [string]$StateCode = '41',          # Oregon FIPS
    [string]$ParameterCode = '88502',
    [switch]$KeepRaw                    # keep the ~2 GB decompressed national CSV
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path $PSScriptRoot -Parent
$outDir   = Join-Path $repoRoot 'Geography\data\airnow'
$work     = Join-Path ([System.IO.Path]::GetTempPath()) "aqs_fetch_$Year$Month"
New-Item -ItemType Directory -Force $outDir | Out-Null
New-Item -ItemType Directory -Force $work   | Out-Null

$zipName = "hourly_${ParameterCode}_${Year}.zip"
$url     = "https://aqs.epa.gov/aqsweb/airdata/$zipName"
$zipPath = Join-Path $work $zipName

Write-Host "1/4 Downloading $url ..."
Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing -TimeoutSec 1800
$zipHash = (Get-FileHash $zipPath -Algorithm SHA256).Hash
Write-Host "    $((Get-Item $zipPath).Length) bytes; SHA256=$zipHash"
# Recorded value for hourly_88502_2020.zip retrieved 2026-07-24:
#   8762E57443C91CC059A90FD0C55D25B93775EDAA3930D8C530B9561A649D2075
# EPA reissues these files when monitoring agencies certify/correct data,
# so a differing hash means the upstream data changed -- not that the
# download failed. Record the new hash and note it in data/README.md.

Write-Host "2/4 Extracting ..."
Expand-Archive -Path $zipPath -DestinationPath $work -Force
$csv = Join-Path $work "hourly_${ParameterCode}_${Year}.csv"

Write-Host "3/4 Filtering to state $StateCode, ${Year}-${Month} (streaming; the national file is ~2 GB) ..."
$statePrefix = '"' + $StateCode + '"'
$datePattern = "$Year-$Month-"
$staged = Join-Path $work 'state_month.csv'
$reader = [System.IO.StreamReader]::new($csv)
$writer = [System.IO.StreamWriter]::new($staged, $false, [System.Text.Encoding]::UTF8)
$header = $reader.ReadLine()
$writer.WriteLine($header)
$kept = 0
while (($line = $reader.ReadLine()) -ne $null) {
    if ($line.StartsWith($statePrefix) -and $line.Contains($datePattern)) {
        $writer.WriteLine($line); $kept++
    }
}
$reader.Close(); $writer.Close()
Write-Host "    $kept state-month rows"

Write-Host "4/4 Restricting to counties: $($Counties -join ', ') ..."
$final = Join-Path $outDir "aqs_hourly_pm25_portland_$Year-$Month.csv"
$rows = Import-Csv $staged | Where-Object { $_.'County Name' -in $Counties }
$rows | Export-Csv $final -NoTypeInformation -Encoding UTF8

$finalHash = (Get-FileHash $final -Algorithm SHA256).Hash
Write-Host ""
Write-Host "Wrote $final"
Write-Host "  rows     : $($rows.Count)"
Write-Host "  monitors : $(($rows | Select-Object 'County Code','Site Num' -Unique).Count)"
Write-Host "  SHA256   : $finalHash"
Write-Host ""
Write-Host "Recorded values for 2020-09 (retrieved 2026-07-24):"
Write-Host "  rows=4795  monitors=7"
Write-Host "  SHA256=D908556C347ECDF68342CE859B1C56813CC606F695804C0BA71992604486CA08"

if (-not $KeepRaw) {
    Remove-Item $csv, $staged -Force -ErrorAction SilentlyContinue
    Write-Host "(removed the decompressed national CSV; pass -KeepRaw to retain it)"
}
