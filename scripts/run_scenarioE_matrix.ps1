# run_scenarioE_matrix.ps1 -- drive the Scenario-E run matrix (round-5 E cycle).
#
# Usage (from the repo root), AFTER committing -- the run-discipline rule is
# commit FIRST, then run, so every manifest stamps a clean tree:
#   powershell -File scripts\run_scenarioE_matrix.ps1 -Phase nulls
#   powershell -File scripts\run_scenarioE_matrix.ps1 -Phase severe
#   powershell -File scripts\run_scenarioE_matrix.ps1 -Phase controls
#
#   nulls    = the three E0-null runs (R3 identity proof vs the archived arms)
#   severe   = codes 18/19/20 x seeds 42/43/44, closuresCode=1  (9 runs)
#   controls = the same nine with closuresCode=0                (9 runs)
#
# Each run's output dir (keyed by SEED ONLY -- Geography\output\run_seed<n>)
# is renamed IMMEDIATELY to a unique name, per the round-5 lesson: the next
# arm at the same seed silently overwrites it otherwise.
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('nulls', 'severe', 'controls', 'worst', 'worstcontrols')]
  [string]$Phase,
  [int]$TimeoutSec = 1800
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$outRoot = Join-Path $repo 'Geography\output'

# Refuse to run on a dirty tree: six ER runs were stamped dirty last cycle
# because files landed mid-run, and the whole matrix had to be re-run.
$dirty = (git -C $repo status --porcelain)
if ($dirty) { throw "Working tree is DIRTY -- commit first, then run.`n$dirty" }

$runs = @()
if ($Phase -eq 'nulls') {
  foreach ($arm in 'A', 'B', 'C') {
    $runs += @{ params = "batch\batch_params_2026_E0null_${arm}_seed42.xml"
                seed = 42; name = "E0null-$arm-seed42" }
  }
} elseif ($Phase -eq 'severe') {
  foreach ($arm in 'E18', 'E19', 'E20') {
    foreach ($seed in 42, 43, 44) {
      $runs += @{ params = "batch\batch_params_2026_SE_${arm}_seed$seed.xml"
                  seed = $seed; name = "SE-$arm-seed$seed" }
    }
  }
} elseif ($Phase -eq 'controls') {
  foreach ($arm in 'E18', 'E19', 'E20') {
    foreach ($seed in 42, 43, 44) {
      $runs += @{ params = "batch\batch_params_2026_SEnc_${arm}_seed$seed.xml"
                  seed = $seed; name = "SEnc-$arm-seed$seed" }
    }
  }
} elseif ($Phase -eq 'worst') {
  # v2 worst case: the draw range on the reality arm, central draw on C/D.
  foreach ($arm in 'E18', 'E19', 'E20') {
    $draws = if ($arm -eq 'E18') { 1, 2, 3 } else { , 1 }
    foreach ($d in $draws) {
      foreach ($seed in 42, 43, 44) {
        $runs += @{ params = "batch\batch_params_2026_SE2_${arm}_d${d}_seed$seed.xml"
                    seed = $seed; name = "SE2-$arm-d$d-seed$seed" }
      }
    }
  }
} else {
  foreach ($arm in 'E18', 'E19', 'E20') {
    foreach ($seed in 42, 43, 44) {
      $runs += @{ params = "batch\batch_params_2026_SE2nc_${arm}_seed$seed.xml"
                  seed = $seed; name = "SE2nc-$arm-seed$seed" }
    }
  }
}

$done = 0
foreach ($r in $runs) {
  $done++
  $src = Join-Path $outRoot "run_seed$($r.seed)"
  $dst = Join-Path $outRoot $r.name
  if (Test-Path $dst) { Write-Host "[$done/$($runs.Count)] SKIP $($r.name) (exists)"; continue }
  if (Test-Path $src) { throw "stale $src exists -- rename or remove it first" }
  Write-Host "[$done/$($runs.Count)] RUN $($r.params) -> $($r.name)"
  & powershell -File (Join-Path $PSScriptRoot 'run-headless.ps1') `
      -ParamsFile $r.params -TimeoutSec $TimeoutSec
  if (-not (Test-Path (Join-Path $src 'simulation.json'))) {
    throw "run produced no simulation.json in $src -- stopping the matrix"
  }
  Rename-Item $src $dst
  Write-Host "[$done/$($runs.Count)] DONE $($r.name)"
}
Write-Host "Phase '$Phase' complete: $($runs.Count) run(s)."
