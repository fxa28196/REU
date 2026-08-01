/**
 * wp8-wave-overlap.ts — is the port's zero blockage count the archive's zero?
 *
 * The archive's headline Scenario-E result is that all four counters are 0 in
 * every closure run, and `13-PHASE-E-PREDICTIONS.md` gives the mechanism: with
 * departures spread over ~455 h at 3–8/hour and a median walk of 24 min, about
 * **four** residents are mid-walk at any wave instant, and none of their routes
 * crossed a closed edge. "Zero because the intersection is tiny" is a very
 * different statement from "zero because the machinery never ran", and a gate
 * that cannot tell them apart is worthless.
 *
 * This script measures the discriminator directly on the port's own run: how
 * many residents are `EN_ROUTE` at each wave tick, and whether the closure-scan
 * branches fired at all (`ROUTENODES_ON`, `SCAN_HIT`, `SCAN_NOHIT` from the
 * engine's own `CountingDecisionProbe`).
 *
 * Note what is NOT gated on the decision layer: `reactToClosureWave` increments
 * `blockagesEncountered` on a hit **before** it consults `decisionConfig`; only
 * the push-vs-reroute choice needs an armed resident. So a layer-off run can
 * still record blockages and reroutes, and a zero from it is a real measurement
 * of route/wave overlap rather than a structural impossibility.
 *
 * ```
 * npx tsx validation/scripts/wp8-wave-overlap.ts SE-E18-seed42 SE2-E18-d1-seed42
 * npx tsx validation/scripts/wp8-wave-overlap.ts --anti-vacuity <waveHour> <hours> [<sourceRun>]
 * ```
 *
 * The second form is the anti-vacuity half — see {@link antiVacuity}. Measured
 * on 2026-07-31: with the 18-edge `closures_E_r1` schedule moved to hour 20,
 * 3,495 residents were mid-walk and all 3,495 scanned (`SCAN_NOHIT` 3,495,
 * `SCAN_HIT` 0); with the 72-edge `closures_E_r1_worst` schedule, 1,585 scanned,
 * again 0 hits. So the scan executes — but `n_push > 0` was still not reached on
 * the engine path at any configuration tried here, and (l.3)'s active branch
 * remains exercised only by `test/wp8-gate-corrosion.test.ts`'s fixtures.
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PARAM_NAMES, parseRunConfig } from "@websim/shared";
import { resolveClosuresCsv, type WorldDataSource } from "@websim/engine/world";
import { readCsvText } from "@websim/engine/loader";
import { CountingDecisionProbe, setDecisionProbe, BR } from "../../engine/src/decision/probe.js";

import { geographyDataSource, runHeadless, headlessAssetsPresent } from "../src/headless.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const ARCHIVE_OF: Readonly<Record<string, string>> = {
  "SE-E18-seed42": "scenario-e",
  "SE-E18-seed43": "scenario-e",
  "SE-E18-seed44": "scenario-e",
  "SE2-E18-d1-seed42": "scenario-e-v2",
  "SE2-E18-d1-seed43": "scenario-e-v2",
  "SE2-E18-d1-seed44": "scenario-e-v2",
};

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

/**
 * Anti-vacuity: move the wave INTO the walking window and show the scan fires.
 *
 * WP8-SPEC-archive-gates.md §4.4 is explicit that reproducing the zero is not
 * enough — *"because a gate that can only ever pass is worthless"* the port must
 * also demonstrate the counter machinery can fire at a non-archived
 * configuration. This runs the certified 18-edge `closures_E_r1` schedule with
 * every activation hour rewritten to `waveHour`, which the port's legacy-latch
 * departure surge occupies. Nothing is written to `Geography/`: the rewritten
 * rows are handed to the engine through the harness's `WorldDataSource`
 * override, so the instrument tree stays byte-untouched.
 */
function antiVacuity(waveHour: number, hours: number, source = "SE-E18-seed42"): void {
  const archive = ARCHIVE_OF[source];
  if (archive === undefined) throw new Error(`${source} is not a closure run in the replay matrix`);
  const params = (
    JSON.parse(
      readFileSync(path.join(REPO_ROOT, "docs", "runs", archive, source, "simulation.json"), "utf8"),
    ) as { reproducibility: { parameters: Record<string, number> } }
  ).reproducibility.parameters;
  const config = parseRunConfig(
    { ...CODE_FALLBACKS, ...params, simulationHours: hours },
    `${source} executed manifest (anti-vacuity)`,
  );

  const base = geographyDataSource();
  const closuresCsv = resolveClosuresCsv(config.closuresCode, config.closureDraw)!;
  // Rewrite the CSV **text** and re-read it with the engine's own parser rather
  // than synthesising row objects: `CsvRow` is the loader's type with a `get`
  // method, and hand-built plain objects would be a second, drifting reader.
  const rewritten = readFileSync(path.join(REPO_ROOT, "Geography", ...closuresCsv.split("/")), "utf8")
    .split(/\r?\n/u)
    .filter((l) => l.length > 0)
    .map((line, i) => {
      if (i === 0) return line;
      const c = line.split(",");
      c[2] = String(waveHour);
      return c.join(",");
    })
    .join("\n");
  const rewrittenRows = readCsvText(rewritten);
  const data: WorldDataSource = {
    exists: (p) => base.exists(p),
    readCsv: (p) => (p === closuresCsv ? rewrittenRows : base.readCsv(p)),
  };

  const probe = new CountingDecisionProbe();
  setDecisionProbe(probe);
  let sim: import("@websim/engine/sim").Simulation | null = null;
  let enRouteAtWave = -1;
  const result = runHeadless({
    config,
    paramNames: PARAM_NAMES,
    data,
    beforeRun: (s) => {
      sim = s;
    },
    onHour: (hour) => {
      if (hour !== waveHour || sim === null) return;
      enRouteAtWave = sim.residents.filter((a) => a.state === "EN_ROUTE").length;
    },
  });
  setDecisionProbe(null);

  let blk = 0;
  let psh = 0;
  let rrt = 0;
  let stk = 0;
  let badDecide = 0;
  let badStuck = 0;
  for (const a of result.sim.residents) {
    blk += a.blockagesEncountered;
    psh += a.pushThroughs;
    rrt += a.reroutes;
    stk += a.stuckEvents;
    if (a.blockagesEncountered !== a.pushThroughs + a.reroutes) badDecide++;
    if (a.stuckEvents > a.pushThroughs) badStuck++;
  }
  console.log(
    JSON.stringify({
      mode: "anti-vacuity",
      note: `${source}'s certified schedule with every activation_hour rewritten to ${waveHour}; Geography/ untouched`,
      source,
      scheduleFile: closuresCsv,
      scheduledEdges: result.sim.closures?.schedule.scheduledEdges ?? 0,
      waveHour,
      hours,
      enRouteAtWave,
      probe: {
        SCAN_HIT: probe.counts[BR.SCAN_HIT] ?? 0,
        SCAN_NOHIT: probe.counts[BR.SCAN_NOHIT] ?? 0,
        PUSH_TRUE: probe.counts[BR.PUSH_TRUE] ?? 0,
      },
      counters: { blockages: blk, pushes: psh, reroutes: rrt, stuck: stk },
      "l.1 rows violating blk == psh + rrt": badDecide,
      "l.2 rows violating stk <= psh": badStuck,
      "l.3": psh > 0 ? "evaluable" : "n_push == 0, l.3 takes its else branch (the archive's path)",
    }),
  );
}

function main(): void {
  const runs = process.argv.slice(2);
  if (runs.length === 0) throw new Error("usage: wp8-wave-overlap.ts <run> [<run> ...]");
  if (!headlessAssetsPresent()) {
    console.error("SKIP: packed graph assets absent");
    process.exit(2);
  }
  if (runs[0] === "--anti-vacuity") {
    antiVacuity(Number(runs[1] ?? 20), Number(runs[2] ?? 48), runs[3] ?? "SE-E18-seed42");
    return;
  }

  const out: Record<string, unknown>[] = [];
  for (const run of runs) {
    const archive = ARCHIVE_OF[run];
    if (archive === undefined) throw new Error(`${run} is not a closure run in the replay matrix`);
    const params = (
      JSON.parse(
        readFileSync(path.join(REPO_ROOT, "docs", "runs", archive, run, "simulation.json"), "utf8"),
      ) as { reproducibility: { parameters: Record<string, number> } }
    ).reproducibility.parameters;
    const config = parseRunConfig({ ...CODE_FALLBACKS, ...params }, `${archive}/${run}`);

    const probe = new CountingDecisionProbe();
    setDecisionProbe(probe);

    // Sampled every tick a wave lands on, plus the tick before and after, so a
    // reader can see whether the population was simply not walking yet.
    const perWave: { hour: number; tick: number; enRoute: number }[] = [];
    const hourlyEnRoute: number[] = [];
    let sim: import("@websim/engine/sim").Simulation | null = null;

    const result = runHeadless({
      config,
      paramNames: PARAM_NAMES,
      beforeRun: (s) => {
        sim = s;
      },
      onHour: (hour) => {
        const s = sim;
        if (s === null) return;
        let enRoute = 0;
        for (const a of s.residents) if (a.state === "EN_ROUTE") enRoute++;
        hourlyEnRoute.push(enRoute);
        if (s.closures !== null && s.closures.schedule.waveHours.includes(hour)) {
          perWave.push({ hour, tick: s.tick, enRoute });
        }
      },
    });
    setDecisionProbe(null);

    // Concurrency over the WHOLE run, for the "~4 concurrent walkers"
    // comparison. Measured by sampling the live `EN_ROUTE` census once an hour,
    // NOT re-derived from `time_started_tick`/`time_arrived_tick`: a resident
    // that never reaches a shelter has an empty arrival cell, and treating that
    // as "still walking at the end of the run" would count all 4,782
    // never-sheltered residents as permanent walkers and inflate the figure by
    // three orders of magnitude. The state census cannot make that mistake.
    let peakEnRoute = 0;
    let sumEnRoute = 0;
    for (const n of hourlyEnRoute) {
      peakEnRoute = Math.max(peakEnRoute, n);
      sumEnRoute += n;
    }
    const hourly = hourlyEnRoute;

    const counts = probe.counts;
    const record = {
      run,
      closuresCode: config.closuresCode,
      waveHours: [...(result.sim.closures?.schedule.waveHours ?? [])],
      enRouteAtWave: perWave,
      peakConcurrentWalkersOverRun: peakEnRoute,
      meanConcurrentWalkers: Math.round((sumEnRoute / hourly.length) * 100) / 100,
      hoursWithAnyWalker: hourly.filter((n) => n > 0).length,
      lastHourWithAnyWalker: hourly.reduce((last, n, i) => (n > 0 ? i + 1 : last), -1),
      probe: {
        ROUTENODES_ON: counts[BR.ROUTENODES_ON] ?? 0,
        ROUTENODES_OFF: counts[BR.ROUTENODES_OFF] ?? 0,
        SCAN_HIT: counts[BR.SCAN_HIT] ?? 0,
        SCAN_NOHIT: counts[BR.SCAN_NOHIT] ?? 0,
      },
      countersTotal: result.sim.residents.reduce(
        (acc, a) => acc + a.blockagesEncountered + a.pushThroughs + a.reroutes + a.stuckEvents,
        0,
      ),
    };
    out.push(record);
    console.log(JSON.stringify(record));
  }

  writeFileSync(
    path.join(REPO_ROOT, "websim", "pipeline", "out", "wp8-replay", "wave-overlap.json"),
    `${JSON.stringify({ schema: "websim/wp8-wave-overlap/v1", runs: out }, null, 2)}\n`,
  );
}

main();
