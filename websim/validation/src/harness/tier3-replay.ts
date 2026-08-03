/**
 * tier3-replay.ts — pointing the ported gate suite at a replayed run.
 *
 * This module registers **no checks of its own**. Every line it produces comes
 * out of `../gates/` or `./gate-*.ts`, under those gates' own names, in the
 * certified scripts' own order. Its entire job is to choose the right
 * instrument for the run class and to feed it the right operands — which is a
 * real job, because pointing `verify_E_runs.py` at a `present-day-three-arm`
 * run fails gate (h) on every one of them for a reason that is about the
 * logger's vintage rather than about the model.
 *
 * ## The one thing worth reading twice: which run is the R3 reference
 *
 * Gate (a) compares an E0 null against a no-layer reference. In the **archive**
 * the reference is a run written by an older logger, so the six Phase-E
 * attribute columns are *null-only* and `compare_table`'s `e_only_cols`
 * allowance covers them. The **port has one writer**: both sides carry the full
 * 59-column header, so with the layer off those six columns are present and
 * empty, and they would land in the shared projection and fail.
 *
 * `r3-own-engine.ts` already named and measured this (its `e-appended`
 * projection) and this module reuses its `dropCsvColumns` rather than inventing
 * a second reshaping. The reference is projected down by the six Phase-E
 * columns and `policy_refused`; the four Scenario-E counters stay **in** the
 * comparison, which is what makes the projection the strongest passing form
 * rather than the most convenient one.
 */

import { PARAM_NAMES } from "@websim/shared";

import {
  checkAnalyzeRun,
  checkVerify2026,
  populationColumnSha256,
  runVerifyEChecks,
  unreachableIdSetSha256,
  type ArmRun,
} from "../gates/index.js";

import type { Checks } from "./checks.js";
import { E_AGENT_COLS, E_SHELTER_COLS } from "./constants.js";
import type { ClosureScheduleSource } from "./gate-k-closures.js";
import { checkR3 } from "./r3-identity.js";
import { dropCsvColumns } from "./r3-own-engine.js";
import { runFromDocuments, type RunView } from "./run-view.js";
import {
  checkGoldenCapacity,
  checkGoldenCrossArmHashes,
  checkGoldenEnvelope,
  checkGoldenExposure,
  checkGoldenMarginals,
  type GoldenSummaries,
} from "./tier3-golden.js";
import type { ReplayedRun } from "./working-set-replay.js";

export interface Tier3Options {
  readonly schedules: ClosureScheduleSource;
  readonly golden: GoldenSummaries;
  /**
   * For a `null` target only: the port's replay of the run named by
   * `target.r3Reference`. Absent is a hard error, never a silent skip — gate
   * (a) is the flagship and a missing reference must not degrade it to nothing.
   */
  readonly reference?: ReplayedRun;
}

/**
 * The `e-appended` reference frame: the no-layer run reshaped to the writer
 * generation the archive's R3 reference came from, minus the Phase-E block.
 */
export function projectR3Reference(reference: ReplayedRun): RunView {
  return runFromDocuments({
    name: `${reference.docs.name} [e-appended]`,
    agentsCsv: dropCsvColumns(reference.docs.agentsCsv, E_AGENT_COLS),
    sheltersCsv: dropCsvColumns(reference.docs.sheltersCsv, E_SHELTER_COLS),
    simulationJson: reference.docs.simulationJson,
  });
}

/**
 * Score one replayed run at Tier 3: the certified per-run gate suite for its
 * class, `analyze_run`'s arithmetic recomputation, and the golden-summary
 * comparisons against the archive.
 */
export function scoreTier3(ck: Checks, r: ReplayedRun, o: Tier3Options): void {
  const view = r.view;
  const ctx = {
    runDir: r.target.runDir,
    seed: r.built.seed,
    arm: r.built.arm,
    golden: o.golden,
  } as const;

  switch (r.target.cls) {
    case "pre-e":
      // `verify_2026_runs.py`'s per-run half is the cross-arm set, scored over
      // the whole family by `scoreTier3CrossArm`. Per run, the arithmetic gate.
      break;
    case "null": {
      const reference = o.reference;
      if (reference === undefined) {
        throw new Error(
          `scoreTier3(${r.target.runDir}): an E0 null needs its --reference replay for gate (a). ` +
            "Refusing to score the null without it — see tools/artifact-gate.ts for the policy.",
        );
      }
      checkR3(ck, view, projectR3Reference(reference));
      runVerifyEChecks(ck, view, { arm: "null" });
      break;
    }
    case "er":
      runVerifyEChecks(ck, view, { arm: "er" });
      break;
    case "se":
      runVerifyEChecks(ck, view, { arm: "se", schedules: o.schedules });
      break;
  }

  checkAnalyzeRun(ck, view);

  checkGoldenEnvelope(ck, view, ctx);
  checkGoldenMarginals(ck, view, r.archivedView, ctx);
  checkGoldenCapacity(ck, view, ctx);
  checkGoldenCrossArmHashes(ck, view, r.archivedView, ctx, {
    population: populationColumnSha256,
    unreachable: unreachableIdSetSha256,
  });
  checkGoldenExposure(ck, view, ctx);
}

/**
 * `verify_2026_runs.py` over the replayed three-arm family.
 *
 * Cross-arm by construction: the population hash and the UNREACHABLE id set
 * must agree across arms *within a seed*, so this cannot be a per-run check and
 * is not pretended to be one.
 */
export function scoreTier3CrossArm(ck: Checks, preE: readonly ReplayedRun[]): void {
  const runs: ArmRun[] = preE.map((r) => ({
    arm: r.built.arm,
    seed: r.built.seed,
    run: r.view,
  }));
  checkVerify2026(ck, runs);
}

/**
 * The number of parameters a port manifest must carry, as a sanity operand for
 * the acceptance suite: the port's writer emits all of {@link PARAM_NAMES}, so
 * gate (h)'s 21-of-21 and gate (i)'s 7-of-7 are satisfied by construction and a
 * shortfall means the writer changed.
 */
export const PORT_MANIFEST_PARAM_COUNT = PARAM_NAMES.length;
