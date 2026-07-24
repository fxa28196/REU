# fetch-encampments.ps1 -- acquire a representative sample of real Portland
# encampment locations from the City of Portland IRP Campsite Reports dataset.
#
# Produces: Geography/data/encampments/irp_campsite_reports_sample.csv
#
# Provenance, licensing and the CRITICAL temporal caveat: Geography/data/README.md
# and docs/science/DATA_SOURCES.md (dataset D2b).
#
# TEMPORAL MISMATCH (documented, not hidden): the City's open-data feed
# retains only a rolling recent window of campsite reports. As of 2026-07-24
# the earliest record is 2025-01-08 -- there are ZERO records for the Sept 2020
# study event. These points are REAL reported Portland encampment locations,
# but from 2025-2026, used as a spatial-distribution proxy for 2020. This is a
# flagged assumption; the model warns when it uses them (see ContextCreator).
#
# The data is complaint-driven (reports to 311 / pdxreporter.org), so it is
# biased toward visible, complained-about camps -- also documented.
#
# Usage:
#   powershell -File scripts\fetch-encampments.ps1
#   powershell -File scripts\fetch-encampments.ps1 -Offsets 34 -PerOffset 200

param(
    [int]$Offsets = 17,       # number of sampling windows across the OBJECTID range
    [int]$PerOffset = 200,    # records per window (service maxRecordCount = 200)
    [int]$Stride = 4000       # OBJECTID-offset step between windows
)

$ErrorActionPreference = 'Stop'
$svc = 'https://www.portlandmaps.com/od/rest/services/COP_OpenData_Miscellaneous/MapServer/1396'

$repoRoot = Split-Path $PSScriptRoot -Parent
$outDir   = Join-Path $repoRoot 'Geography\data\encampments'
New-Item -ItemType Directory -Force $outDir | Out-Null
$out = Join-Path $outDir 'irp_campsite_reports_sample.csv'

# Systematic sample across the full available period: non-duplicate reports
# only (duplicate=0), ordered by OBJECTID, stepping resultOffset so the sample
# spans the whole date range rather than one recent cluster.
$rows = New-Object System.Collections.Generic.List[object]
for ($i = 0; $i -lt $Offsets; $i++) {
    $off = $i * $Stride
    $q = "$svc/query?where=duplicate%3D0&outFields=inc_date_create,inc_id,IS_VEHICLE" +
         "&orderByFields=OBJECTID&resultOffset=$off&resultRecordCount=$PerOffset" +
         "&returnGeometry=true&outSR=4326&f=json"
    $r = Invoke-RestMethod $q -TimeoutSec 120
    foreach ($f in $r.features) {
        if ($f.geometry -and $f.geometry.x) {
            $rows.Add([pscustomobject]@{
                lon        = [math]::Round($f.geometry.x, 6)
                lat        = [math]::Round($f.geometry.y, 6)
                inc_date   = [DateTimeOffset]::FromUnixTimeMilliseconds([int64]$f.attributes.inc_date_create).UtcDateTime.ToString('yyyy-MM-dd')
                inc_id     = $f.attributes.inc_id
                is_vehicle = $f.attributes.IS_VEHICLE
            })
        }
    }
    Write-Host ("  offset {0,6}: {1} cumulative points" -f $off, $rows.Count)
}

$rows | Export-Csv $out -NoTypeInformation -Encoding UTF8
$hash = (Get-FileHash $out -Algorithm SHA256).Hash
Write-Host ""
Write-Host "Wrote $out"
Write-Host "  points   : $($rows.Count)"
Write-Host "  date span: $(($rows.inc_date | Sort-Object)[0]) .. $(($rows.inc_date | Sort-Object)[-1])"
Write-Host "  SHA256   : $hash"
Write-Host ""
Write-Host "Recorded values (retrieved 2026-07-24, default parameters):"
Write-Host "  points=3400  date span 2025-01-08 .. 2026-07-23"
Write-Host "  NOTE: resultOffset paging over a live feed is not guaranteed"
Write-Host "  byte-identical across dates as new reports arrive; the SPATIAL"
Write-Host "  DISTRIBUTION is the reproducible quantity, not the exact rows."
