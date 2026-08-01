/**
 * wp8-clause3-scan-eligible.ts — how many residents are eligible to scan at each
 * closure wave, and how many actually scanned.
 *
 * `wp8-wave-overlap.ts` reports `SCAN_NOHIT` for the whole run and an hourly
 * `EN_ROUTE` census sampled at the END of each hour. Neither is the wave
 * instant, and the two numbers do not reconcile on their own. This script
 * measures the population that `agents/step.ts:379` actually gates on —
 * `leg !== null && routeNodes !== null && state === "EN_ROUTE"` — at the tick
 * immediately BEFORE each wave lands, which is exactly the set the wave can
 * reach.
 *
 * It drives the tick loop itself (`Simulation.runUntil` resumes from its own
 * counter, so slicing is bit-identical) and takes the census between slices.
 *
 * ```
 * npx tsx validation/scripts/wp8-clause3-scan-eligible.ts
 * ```
 *
 * Writes `pipeline/out/wp8-replay/clause3-scan-eligible.json`.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PARAM_NAMES, parseRunConfig, type RunConfig } from "@websim/shared";

import { headlessAssetsPresent, runHeadless } from "../src/headless.js";
import { CountingDecisionProbe, setDecisionProbe, BR } from "../../engine/src/decision/probe.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const ARCHIVE_ROOT = path.join(REPO_ROOT, "docs", "runs");
const OUT_ROOT = path.join(REPO_ROOT, "websim", "pipeline", "out", "wp8-replay");

const CASES: readonly { run: string; archive: string }[] = [
  { run: "SE-E18-seed42", archive: "scenario-e" },
  { run: "SE-E18-seed43", archive: "scenario-e" },
  { run: "SE-E18-seed44", archive: "scenario-e" },
  { run: "SE2-E18-d1-seed42", archive: "scenario-e-v2" },
  { run: "SE2-E18-d1-seed43", archive: "scenario-e-v2" },
  { run: "SE2-E18-d1-seed44", archive: "scenario-e-v2" },
];

const CODE_FALLBACKS: Readonly<Record<string, number>> = {
  smokeSeriesCode: 0,
  smokeScale: 1.0,
  closuresCode: 0,
  pStuck: 0.3,
  stuckDelayH: 3.0,
  pushThetaThreshold: -0.25,
  kPush: 1.0,
  closureDraw: 1,
};

function buildConfig(run: string, archive: string): RunConfig {
  const manifest = JSON.parse(
    readFileSync(path.join(ARCHIVE_ROOT, archive, run, "simulation.json"), "utf8"),
  ) as { reproducibility: { parameters: Record<string, number> } };
  const params = manifest.reproducibility.parameters;
  const raw: Record<string, number> = {};
  for (const name of PARAM_NAMES) {
    const executed = params[name];
    raw[name] = executed ?? CODE_FALLBACKS[name]!;
  }
  return parseRunConfig(raw, `archived manifest ${archive}/${run}`);
}

function main(): void {
  if (!headlessAssetsPresent()) {
    console.error("SKIP: packed graph assets absent — this run produced NO numbers.");
    process.exit(2);
  }
  mkdirSync(OUT_ROOT, { recursive: true });
  const out: Record<string, unknown>[] = [];

  for (const c of CASES) {
    const config = buildConfig(c.run, c.archive);
    const probe = new CountingDecisionProbe();
    setDecisionProbe(probe);

    const perWave: Record<string, unknown>[] = [];
    runHeadless({
      config,
      paramNames: PARAM_NAMES,
      beforeRun: (sim) => {
        const waves = sim.closures?.schedule.waveHours ?? [];
        const tpH = sim.ticksPerHour;
        for (const hour of waves) {
          const waveTick = hour * tpH;
          if (waveTick < 1) continue;
          sim.runUntil(waveTick - 1);
          let enRoute = 0;
          let withLeg = 0;
          let withRouteNodes = 0;
          let eligible = 0;
          for (const a of sim.residents) {
            if (a.state !== "EN_ROUTE") continue;
            enRoute++;
            if (a.leg !== null) withLeg++;
            if (a.routeNodes !== null) withRouteNodes++;
            if (a.leg !== null && a.routeNodes !== null) eligible++;
          }
          perWave.push({
            hour,
            waveTick,
            censusAtTick: sim.tick,
            enRoute,
            withLeg,
            withRouteNodes,
            scanEligible: eligible,
          });
        }
        // The remaining ticks are executed by runHeadless's own `sim.run()`.
      },
    });
    setDecisionProbe(null);

    const counts = probe.counts;
    const rec = {
      run: c.run,
      waves: perWave,
      totalScanEligible: perWave.reduce((a, w) => a + (w["scanEligible"] as number), 0),
      SCAN_NOHIT: counts[BR.SCAN_NOHIT] ?? 0,
      SCAN_HIT: counts[BR.SCAN_HIT] ?? 0,
      ROUTENODES_ON: counts[BR.ROUTENODES_ON] ?? 0,
    };
    out.push(rec);
    console.log(JSON.stringify(rec));
  }

  const p = path.join(OUT_ROOT, "clause3-scan-eligible.json");
  writeFileSync(
    p,
    `${JSON.stringify(
      { schema: "websim/wp8-clause3-scan-eligible/v1", generated: new Date().toISOString(), runs: out },
      null,
      2,
    )}\n`,
  );
  console.log(`wrote ${p}`);
}

main();
