/**
 * wp8-clause3-armed-diagnostic.ts — how much of the clause-3 gap is the missing
 * `armResident` call site, and how much is something else?
 *
 * **This is a DIAGNOSTIC, not a reproduction.** Nothing it produces may be
 * reported as clause 3 being met. It was written while two engine defects were
 * open, and it made one substitution for each — both still named in its output,
 * and both now describing the file rather than the engine:
 *
 *  1. The residents are armed through the `HeadlessOptions.beforeRun` harness
 *     seam. That was once the *only* way to get a live layer, because
 *     `engine/src/sim.ts` had no `armResident` call site; `Simulation`'s
 *     constructor performs step 11 itself now, so this arming is redundant with
 *     what the engine already did rather than a substitute for it. The
 *     arithmetic was always the engine's own (`decision/arm.ts`,
 *     `decision/config.ts`); only the *call* is this file's.
 *  2. `informationRegime` is forced from the archived **1** to **0**. The reason
 *     was that `Simulation` implemented `StepWorld` without
 *     `anyUntriedReachableShelter`, so an armed L1 run threw at the first
 *     `REFUSED_ALL_FULL` re-entry. It declares that predicate now and L1 runs
 *     complete (`test/wp8-r3-own-engine.test.ts`, the L1 case), so this
 *     substitution is no longer forced — but it has NOT been lifted here, and
 *     until it is, L0 remains a *different model* and these numbers are still
 *     NOT comparable to the archive as a reproduction.
 *
 * What they *are* good for: bounding how far the arming alone moves the port.
 * `policy_refused` is the sharpest single dial — it is incremented only by the
 * pet/dependants door gate, which only an armed resident can reach.
 *
 * ```
 * npx tsx validation/scripts/wp8-clause3-armed-diagnostic.ts
 * ```
 *
 * Writes `pipeline/out/wp8-replay/clause3-armed-diagnostic.json`.
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PARAM_NAMES, parseRunConfig, type RunConfig } from "@websim/shared";

import { readFrame, sum } from "../src/harness/frame.js";
import { armFromWorld } from "../src/harness/r3-own-engine.js";
import { headlessAssetsPresent, runHeadless } from "../src/headless.js";

/**
 * The four dials this diagnostic needs.
 *
 * Deliberately NOT imported from `wp8-archive-replay.ts`: that module calls
 * `main()` at top level, so importing `scoreRun` from it would re-execute the
 * entire twelve-run replay as a side effect of this file loading.
 */
interface Dials {
  readonly n: number;
  readonly sheltered: number;
  readonly departed: number;
  readonly doorRefusals: number;
  readonly policyRefusals: number;
  readonly unreachableFinal: number | null;
  readonly refusedAllFullFinal: number | null;
  readonly counters: { blockages: number; pushes: number; reroutes: number; stuck: number };
}

function dials(agentsCsv: string, sheltersCsv: string, simulationJson: string): Dials {
  const a = readFrame(agentsCsv, "agents.csv");
  const sh = readFrame(sheltersCsv, "shelters.csv");
  const man = JSON.parse(simulationJson) as { population?: Record<string, number> };
  const zeros = (col: string): readonly number[] =>
    a.has(col) ? a.num(col).map((v) => (Number.isNaN(v) ? 0 : v)) : [];
  const sumCol = (f: typeof sh, c: string): number =>
    f.has(c) ? Math.trunc(sum(f.num(c).map((v) => (Number.isNaN(v) ? 0 : v)))) : 0;
  const refusals = sumCol(sh, "refused_count");
  const policy = sumCol(sh, "policy_refused");
  return {
    n: a.rows.length,
    sheltered: a.column("final_state").filter((s) => s === "SHELTERED").length,
    departed: a.column("time_started_tick").filter((s) => s.trim() !== "").length,
    doorRefusals: refusals,
    policyRefusals: policy,
    unreachableFinal: man.population?.["unreachable"] ?? null,
    refusedAllFullFinal: man.population?.["refused_all_full"] ?? null,
    counters: {
      blockages: Math.trunc(sum(zeros("blockages_encountered"))),
      pushes: Math.trunc(sum(zeros("push_throughs"))),
      reroutes: Math.trunc(sum(zeros("reroutes"))),
      stuck: Math.trunc(sum(zeros("stuck_events"))),
    },
  };
}

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const OUT = path.join(REPO_ROOT, "websim", "pipeline", "out", "wp8-replay");

/** `ContextCreator.doubleParam` fallbacks for names a 33-parameter manifest lacks. */
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

function executedConfig(archive: string, run: string, overrides: Record<string, number>): RunConfig {
  const params = (
    JSON.parse(
      readFileSync(path.join(REPO_ROOT, "docs", "runs", archive, run, "simulation.json"), "utf8"),
    ) as { reproducibility: { parameters: Record<string, number> } }
  ).reproducibility.parameters;
  const raw: Record<string, number> = {};
  for (const name of PARAM_NAMES) {
    const v = params[name] ?? CODE_FALLBACKS[name];
    if (v === undefined) throw new Error(`${run}: no value or fallback for ${name}`);
    raw[name] = v;
  }
  return parseRunConfig({ ...raw, ...overrides }, `archived manifest ${archive}/${run} (diagnostic)`);
}

interface Variant {
  readonly label: string;
  readonly archive: string;
  readonly run: string;
  readonly armed: boolean;
  readonly regime: 0 | 1;
}

/**
 * `armed` is the *harness* seam, not the layer's liveness. `Simulation` arms the
 * run itself whenever `enableDecisionLayer` is 1, so an `armed: false` row is the
 * plain shipped path with a live layer — not, as these labels once said, an
 * unarmed one. The rows are kept as a pair so the diagnostic still shows that
 * the harness arming adds nothing the engine did not already do.
 */
const VARIANTS: readonly Variant[] = [
  { label: "ER-A-seed42 shipped path (engine-armed, regime 1 as archived)", archive: "phase-e", run: "ER-A-n6842-seed42", armed: false, regime: 1 },
  { label: "ER-A-seed42 harness-ARMED, regime 1 exactly as archived", archive: "phase-e", run: "ER-A-n6842-seed42", armed: true, regime: 1 },
  { label: "ER-A-seed42 harness-ARMED, regime forced 0 (NOT the archived regime)", archive: "phase-e", run: "ER-A-n6842-seed42", armed: true, regime: 0 },
  { label: "SE-E18-seed42 shipped path (engine-armed, regime 1 as archived)", archive: "scenario-e", run: "SE-E18-seed42", armed: false, regime: 1 },
  { label: "SE-E18-seed42 harness-ARMED, regime forced 0 (NOT the archived regime)", archive: "scenario-e", run: "SE-E18-seed42", armed: true, regime: 0 },
];

function main(): void {
  if (!headlessAssetsPresent()) {
    console.error("SKIP: packed graph assets absent — this run produced NO numbers.");
    process.exit(2);
  }

  const records: unknown[] = [];
  for (const v of VARIANTS) {
    const config = executedConfig(v.archive, v.run, { informationRegime: v.regime });
    let armed = 0;
    let threw: string | null = null;
    let metrics: unknown = null;
    const t0 = performance.now();
    try {
      const result = runHeadless({
        config,
        paramNames: PARAM_NAMES,
        beforeRun: v.armed
          ? (sim, world): void => {
              armed = armFromWorld(sim, world, config);
            }
          : undefined,
      });
      metrics = dials(
        result.parity.agentsCsv,
        result.parity.sheltersCsv,
        result.parity.simulationJson,
      );
      const census = new Map<string, number>();
      for (const a of result.sim.residents) census.set(a.state, (census.get(a.state) ?? 0) + 1);
      records.push({
        ...v,
        armedResidents: armed,
        threw: null,
        stateCensus: Object.fromEntries([...census].sort()),
        metrics,
        runMs: performance.now() - t0,
      });
    } catch (err) {
      threw = (err as Error).message;
      records.push({ ...v, armedResidents: armed, threw, metrics, runMs: performance.now() - t0 });
    }
    const m = metrics as Dials | null;
    console.log(
      `${v.label.padEnd(58)} armed=${String(armed).padStart(5)}  ` +
        (threw === null
          ? `departed=${m?.departed} sheltered=${m?.sheltered} policy_refusals=${m?.policyRefusals} ` +
            `unreachable=${m?.unreachableFinal}`
          : `THREW: ${threw.slice(0, 110)}`),
    );
  }

  const archived = VARIANTS.filter((v) => !v.armed).map((v) => {
    const dir = path.join(REPO_ROOT, "docs", "runs", v.archive, v.run);
    return {
      run: v.run,
      metrics: dials(
        readFileSync(path.join(dir, "agents.csv"), "utf8"),
        readFileSync(path.join(dir, "shelters.csv"), "utf8"),
        readFileSync(path.join(dir, "simulation.json"), "utf8"),
      ),
    };
  });
  for (const a of archived) {
    console.log(
      `${`ARCHIVE ${a.run}`.padEnd(58)}              ` +
        `departed=${a.metrics.departed} sheltered=${a.metrics.sheltered} ` +
        `policy_refusals=${a.metrics.policyRefusals} unreachable=${a.metrics.unreachableFinal}`,
    );
  }

  writeFileSync(
    path.join(OUT, "clause3-armed-diagnostic.json"),
    `${JSON.stringify(
      {
        schema: "websim/wp8-clause3-armed-diagnostic/v1",
        generated: new Date().toISOString(),
        note:
          "DIAGNOSTIC ONLY. engine/src/sim.ts arms the run itself now, so the 'armed: false' " +
          "variants are the plain shipped path with a live decision layer and the 'armed: true' " +
          "ones re-arm it through the beforeRun harness seam. Simulation also declares " +
          "anyUntriedReachableShelter now, so informationRegime 1 is runnable; the variants " +
          "that force it to 0 are still a DIFFERENT MODEL from the archived configuration and " +
          "no variant here is a reproduction of it.",
        variants: records,
        archived,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`\n[diagnostic] wrote ${path.join(OUT, "clause3-armed-diagnostic.json")}`);
}

main();
