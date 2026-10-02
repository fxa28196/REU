# fetch-airnow-hourly.ps1 -- acquire one month of hourly PM2.5 for the Portland
# tri-county area (Multnomah, Washington, Clackamas) from AirNow's public hourly
# data files at files.airnowtech.org.
#
# Why this exists: fetch-aqs-pm25.ps1 pulls the certified EPA AQS record, but
# AQS receives agency data months after the fact. On 2026-10-02 the 2026 AQS
# hourly 88502 file contained no Oregon rows for August 2026. AirNow carries the
# preliminary real-time series from the same Oregon DEQ monitors; it is the
# series behind the public AQI, not the certified record. Values may later be
# revised in AQS. Treat this file as provisional until the AQS pull succeeds.
#
# Produces: Geography/data/airnow/airnow_hourly_pm25_portland_<Year>-<Month>.csv
#           Geography/data/airnow/airnow_hourly_pm25_portland_<Year>-<Month>.json
#
# File format (AirNow HourlyData_YYYYMMDDHH.dat, pipe-delimited, no header):
#   valid date (MM/DD/YY) | valid time (HH:MM, GMT) | AQSID | site name |
#   GMT offset | parameter | units | value | data source
# AQSID = state(2)+county(3)+site(4); Oregon=41, Multnomah=051, Washington=067,
# Clackamas=005.
#
# Source and licence: U.S. EPA AirNow (public domain, provisional data).
#
# Usage:
#   powershell -File scripts\fetch-airnow-hourly.ps1 -Year 2026 -Month 08

param(
    [int]$Year = 2026,
    [string]$Month = '08',
    [string[]]$CountyPrefixes = @('41051', '41067', '41005'),
    [string]$Parameter = 'PM2.5'
)

$ErrorActionPreference = 'Stop'
$base = 'https://files.airnowtech.org/airnow'

$repoRoot = Split-Path $PSScriptRoot -Parent
$outDir   = Join-Path $repoRoot 'Geography\data\airnow'
New-Item -ItemType Directory -Force $outDir | Out-Null
$out = Join-Path $outDir "airnow_hourly_pm25_portland_$Year-$Month.csv"
$man = Join-Path $outDir "airnow_hourly_pm25_portland_$Year-$Month.json"

$startedUtc = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
$days = [DateTime]::DaysInMonth($Year, [int]$Month)
$rows = New-Object System.Collections.Generic.List[object]
$fetched = 0
$missing = New-Object System.Collections.Generic.List[string]

for ($d = 1; $d -le $days; $d++) {
    for ($h = 0; $h -le 23; $h++) {
        $day   = '{0}{1}{2:00}' -f $Year, $Month, $d
        $stamp = '{0}{1:00}' -f $day, $h
        $url   = "$base/$Year/$day/HourlyData_$stamp.dat"
        $txt = $null
        for ($try = 1; $try -le 3; $try++) {
            try {
                # The server labels these files binary/octet-stream, so .Content
                # arrives as a byte array; decode it to text before parsing.
                $raw = (Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 120).Content
                if ($raw -is [byte[]]) { $txt = [System.Text.Encoding]::UTF8.GetString($raw) } else { $txt = [string]$raw }
                break
            }
            catch {
                if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 404) { break }
                if ($try -eq 3) { break }
                Start-Sleep -Seconds (3 * $try)
            }
        }
        if ($null -eq $txt) { $missing.Add($stamp); continue }
        $fetched++
        foreach ($line in ($txt -split "`n")) {
            $f = $line.TrimEnd("`r").Split('|')
            if ($f.Count -lt 9) { continue }
            if ($f[5] -ne $Parameter) { continue }
            $aqsid = $f[2]
            $hit = $false
            foreach ($p in $CountyPrefixes) { if ($aqsid.StartsWith($p)) { $hit = $true; break } }
            if (-not $hit) { continue }
            $rows.Add([pscustomobject]@{
                date_gmt   = $f[0]
                time_gmt   = $f[1]
                aqsid      = $aqsid
                site_name  = $f[3].Trim()
                gmt_offset = $f[4]
                parameter  = $f[5]
                units      = $f[6]
                value      = $f[7]
                agency     = $f[8].Trim()
            })
        }
    }
    Write-Host ("  day {0:00}: {1} rows so far, {2} files fetched, {3} missing" -f $d, $rows.Count, $fetched, $missing.Count)
}

$rows | Export-Csv $out -NoTypeInformation -Encoding UTF8
$hash = (Get-FileHash $out -Algorithm SHA256).Hash
$monitors = @($rows | Select-Object -ExpandProperty aqsid -Unique)
$manifest = [ordered]@{
    dataset               = 'U.S. EPA AirNow hourly observations (files.airnowtech.org, HourlyData_*.dat), provisional'
    period                = "$Year-$Month"
    counties              = 'Multnomah (41051), Washington (41067), Clackamas (41005), Oregon'
    parameter             = $Parameter
    retrieved_utc         = $startedUtc
    hourly_files_expected = $days * 24
    hourly_files_fetched  = $fetched
    hourly_files_missing  = @($missing)
    rows                  = $rows.Count
    monitors              = $monitors.Count
    monitor_aqsids        = $monitors
    sha256                = $hash
    note                  = 'Provisional real-time values, not the certified AQS record. Re-run fetch-aqs-pm25.ps1 for this month once EPA posts it.'
}
$manifest | ConvertTo-Json -Depth 3 | Set-Content $man -Encoding UTF8

Write-Host ""
Write-Host "Wrote $out"
Write-Host "  rows     : $($rows.Count)"
Write-Host "  monitors : $($monitors.Count)"
Write-Host "  files    : $fetched fetched, $($missing.Count) missing"
Write-Host "  SHA256   : $hash"
Write-Host "Wrote $man"
