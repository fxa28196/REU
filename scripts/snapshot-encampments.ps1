# snapshot-encampments.ps1 -- capture the ENTIRE City of Portland IRP Campsite
# Reports feed as it stands today, into a dated file.
#
# Why this exists: the feed keeps only a rolling window and no history
# (see fetch-encampments.ps1). A snapshot that is not taken is lost. The
# next-study audit (docs/next-study/STATUS.md, Phase 1) asked for one now and
# then weekly through fire season.
#
# This script does NOT touch Geography/data/encampments/irp_campsite_reports_sample.csv.
# That file is the archived model input (3,400-point systematic sample taken
# 2026-07-24 by fetch-encampments.ps1) and every archived run's manifest records
# its checksum. This script writes beside it, never over it.
#
# Produces: Geography/data/encampments/snapshots/irp_campsite_reports_full_<date>.csv
#           Geography/data/encampments/snapshots/irp_campsite_reports_full_<date>.json
#           (manifest: retrieval time, record count, SHA256, date span, fields)
#
# Source and licence: City of Portland open data (PortlandMaps), dataset D2b in
# docs/science/DATA_SOURCES.md. Complaint-driven; biased toward visible camps.
#
# Usage:
#   powershell -File scripts\snapshot-encampments.ps1
#   powershell -File scripts\snapshot-encampments.ps1 -Date 2026-10-02

param(
    [string]$Date = (Get-Date -Format 'yyyy-MM-dd'),
    [int]$PageSize = 200          # service maxRecordCount = 200
)

$ErrorActionPreference = 'Stop'
$svc = 'https://www.portlandmaps.com/od/rest/services/COP_OpenData_Miscellaneous/MapServer/1396'

$repoRoot = Split-Path $PSScriptRoot -Parent
$outDir   = Join-Path $repoRoot 'Geography\data\encampments\snapshots'
New-Item -ItemType Directory -Force $outDir | Out-Null
$out = Join-Path $outDir "irp_campsite_reports_full_$Date.csv"
$man = Join-Path $outDir "irp_campsite_reports_full_$Date.json"

$startedUtc = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
$total = (Invoke-RestMethod "$svc/query?where=1%3D1&returnCountOnly=true&f=json" -TimeoutSec 120).count
Write-Host "Feed reports $total records at $startedUtc"

function ToIso([object]$ms) {
    # esriFieldTypeDate values are epoch milliseconds (UTC).
    if ($null -eq $ms -or $ms -eq '') { return '' }
    return [DateTimeOffset]::FromUnixTimeMilliseconds([int64]$ms).UtcDateTime.ToString('yyyy-MM-ddTHH:mm:ssZ')
}

function ItemDate([object]$v) {
    # item_date_create is NOT an epoch field: the service stores it as a
    # yyyyMMddHHmmss integer (e.g. 20261001095023). Reformat it as ISO 8601
    # without a zone; the feed does not state which zone it is in.
    if ($null -eq $v -or $v -eq '') { return '' }
    $s = [string]$v
    if ($s.Length -eq 14) {
        return ('{0}-{1}-{2}T{3}:{4}:{5}' -f $s.Substring(0,4), $s.Substring(4,2), $s.Substring(6,2), $s.Substring(8,2), $s.Substring(10,2), $s.Substring(12,2))
    }
    return $s   # unknown shape: keep the raw value rather than guess
}

$rows = New-Object System.Collections.Generic.List[object]
$off = 0
$pages = 0
while ($true) {
    $q = "$svc/query?where=1%3D1&outFields=*&orderByFields=OBJECTID&resultOffset=$off" +
         "&resultRecordCount=$PageSize&returnGeometry=true&outSR=4326&f=json"
    $r = $null
    for ($try = 1; $try -le 5; $try++) {
        try { $r = Invoke-RestMethod $q -TimeoutSec 120; break }
        catch { if ($try -eq 5) { throw }; Start-Sleep -Seconds (5 * $try) }
    }
    if (-not $r.features -or $r.features.Count -eq 0) { break }
    foreach ($f in $r.features) {
        $a = $f.attributes
        $rows.Add([pscustomobject]@{
            OBJECTID         = $a.OBJECTID
            report_id        = $a.report_id
            inc_id           = $a.inc_id
            inc_date_create  = ToIso $a.inc_date_create
            item_date_create = ItemDate $a.item_date_create
            duplicate        = $a.duplicate
            IS_VEHICLE       = $a.IS_VEHICLE
            lon              = $(if ($f.geometry -and $null -ne $f.geometry.x) { [math]::Round($f.geometry.x, 6) } else { '' })
            lat              = $(if ($f.geometry -and $null -ne $f.geometry.y) { [math]::Round($f.geometry.y, 6) } else { '' })
        })
    }
    $off += $r.features.Count
    $pages++
    if ($pages % 50 -eq 0) { Write-Host ("  {0,7} / {1}" -f $off, $total) }
    if ($r.features.Count -lt $PageSize) { break }
}

$rows | Export-Csv $out -NoTypeInformation -Encoding UTF8
$hash = (Get-FileHash $out -Algorithm SHA256).Hash
$dates = @($rows.inc_date_create | Where-Object { $_ } | Sort-Object)
$manifest = [ordered]@{
    dataset             = 'City of Portland IRP Campsite Reports (PortlandMaps open data, layer 1396)'
    service             = $svc
    retrieved_utc       = $startedUtc
    feed_reported_count = $total
    rows_written        = $rows.Count
    earliest_inc_date   = $(if ($dates.Count -gt 0) { $dates[0] } else { '' })
    latest_inc_date     = $(if ($dates.Count -gt 0) { $dates[-1] } else { '' })
    fields              = @('OBJECTID','report_id','inc_id','inc_date_create','item_date_create','duplicate','IS_VEHICLE','lon','lat')
    sha256              = $hash
    note                = 'Full feed snapshot. The feed keeps no history; this file is the only record of its contents on this date. Not a model input.'
}
$manifest | ConvertTo-Json -Depth 3 | Set-Content $man -Encoding UTF8

Write-Host ""
Write-Host "Wrote $out"
Write-Host "  rows     : $($rows.Count) (feed reported $total)"
Write-Host "  date span: $($manifest.earliest_inc_date) .. $($manifest.latest_inc_date)"
Write-Host "  SHA256   : $hash"
Write-Host "Wrote $man"
