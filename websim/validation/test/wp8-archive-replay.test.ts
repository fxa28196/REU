/**
 * wp8-archive-replay.test.ts — WP8 acceptance clause 3, as a gate.
 *
 * > The port reproduces the archived ER / SE / SE2 outcomes exactly.
 *
 * This is the headline scientific result of the work package, and until this
 * file existed **nothing asserted any of it**. The numbers were produced by
 * `validation/scripts/wp8-archive-replay.ts` and read off its stdout by a human.
 * A claim defended by a script somebody has to remember to run is a claim
 * nothing defends — which is exactly how the WP8 arming defect survived its
 * first gate, with the tree at 1369 green while an acceptance clause was
 * measurably false.
 *
 * ── Where the expected values come from ────────────────────────────────────
 *
 * **The archive, and only the archive.** For each of the twelve archived runs
 * this suite:
 *
 *  1. builds the `RunConfig` from that run's **archived executed manifest**
 *     (`reproducibility.parameters`), never from the shipped preset — spec
 *     §5.6 item 4, and the reason is asserted below: the SE/SE2 manifests
 *     executed `pushThetaThreshold = 0.0` where the preset says −0.25;
 *  2. runs the TS engine on it;
 *  3. scores the port's **written CSV text** and the **archived Java bytes**
 *     with the same `score_scenarioE.py` transcription; and
 *  4. requires all nineteen metrics to be equal, by `Object.is`.
 *
 * No expected value is read from anything the port wrote. `pipeline/out/` is not
 * touched by this file at all — an expectation derived from the code under test
 * is worth nothing, and a golden file the port refreshes is that expectation
 * with an extra step. The three headline runs additionally carry their published
 * counts as literals, asserted against the ARCHIVE side: that pins the reading
 * of the archive itself, so a scorer bug that moved both sides together (the one
 * failure a same-scorer equality cannot see) still turns this file red.
 *
 * ── What the twelve runs cost, and why they are all here ───────────────────
 *
 * Roughly 15 s of engine each. The claim is "three seeds, four families,
 * exactly", so sampling one seed would leave two thirds of it ungated; the runs
 * are driven through `runHeadlessAsync` so vitest's worker heartbeat survives
 * the file (see `headless.ts`, and the flagship's slice-identity case which
 * proves slicing changes nothing).
 *
 * Gated on `pipeline/out/assets`, `docs/runs/` and `Geography/`.
 */

import { beforeAll, expect, it } from "vitest";

import { describeArchive } from "@websim/pipeline/archive";

import { artifactGate, describeGated, type ArtifactRef } from "../../tools/artifact-gate.js";
import {
  ARCHIVE_REPLAY_CASES,
  REPLAY_METRIC_FIELDS,
  archiveRunDir,
  buildReplayConfig,
  metricDeltas,
  scoreArchivedRun,
  scoreRun,
  type ReplayCase,
  type RunMetrics,
} from "../src/harness/archive-replay.js";
import { ASSET_DIR, GEOGRAPHY_DIR, runHeadlessAsync } from "../src/headless.js";
import { PARAM_NAMES } from "@websim/shared";

const archive = describeArchive();

const TOPOLOGY: ArtifactRef = {
  source: "graph-asset",
  label: "topology",
  path: `${ASSET_DIR}/graph-topology.bin`,
};
const GEOMETRY: ArtifactRef = {
  source: "graph-asset",
  label: "geometry",
  path: `${ASSET_DIR}/graph-geometry.bin`,
};
const ARCHIVE_REF: ArtifactRef = {
  source: "archive",
  label: "docs/runs (phase-e, scenario-e, scenario-e-v2)",
  path: archiveRunDir(ARCHIVE_REPLAY_CASES[0]!, archive.root),
};
const CLOSURES: ArtifactRef = {
  source: "geography",
  label: "data/closures/closures_E_r1_worst.csv",
  path: `${GEOGRAPHY_DIR}/data/closures/closures_E_r1_worst.csv`,
};

const gate = artifactGate({
  gate: "validation:wp8-archive-replay",
  suite: "WP8 clause 3 — the port reproduces the archived ER/SE/SE2 runs",
  evidence:
    "the port's own engine, driven from the twelve archived EXECUTED manifests, reproducing " +
    "the certified Java instrument's sheltered counts, door and policy refusals, terminal " +
    "state census and exposure means exactly — the headline scientific result of WP8, which " +
    "otherwise exists only as the stdout of validation/scripts/wp8-archive-replay.ts",
  artifacts: [TOPOLOGY, GEOMETRY, ARCHIVE_REF, CLOSURES],
});

// ---------------------------------------------------------------------------

/** The engine work happens once, in `beforeAll`; the cases are then cheap. */
const PREPARE_TIMEOUT_MS = 1_800_000;
const CASE_TIMEOUT_MS = 120_000;

/**
 * The published clause-3 numbers, as literals, for the three seed-42 headline
 * runs. Asserted against the ARCHIVE side — see the module doc.
 */
const HEADLINE: Readonly<
  Record<
    string,
    {
      readonly sheltered: number;
      readonly policy_refusals: number;
      readonly door_refusals_total: number;
      readonly unreachable_final: number;
    }
  >
> = {
  "ER-A-n6842-seed42": {
    sheltered: 1215,
    policy_refusals: 541,
    door_refusals_total: 836,
    unreachable_final: 4,
  },
  "SE-E18-seed42": {
    sheltered: 1252,
    policy_refusals: 543,
    door_refusals_total: 834,
    unreachable_final: 9,
  },
  "SE2-E18-d1-seed42": {
    sheltered: 1307,
    policy_refusals: 709,
    door_refusals_total: 1152,
    unreachable_final: 9,
  },
};

/** The run the bit-stability case executes twice — the cheapest of the twelve. */
const REPEAT_RUN = "ER-A-n6842-seed44";

interface Replayed {
  readonly port: RunMetrics;
  readonly archived: RunMetrics;
}

const replayed = new Map<string, Replayed>();
let repeatFirst: { agentsCsv: string; sheltersCsv: string; simulationJson: string } | null = null;
let repeatSecond: { agentsCsv: string; sheltersCsv: string; simulationJson: string } | null = null;

function resultFor(run: string): Replayed {
  const hit = replayed.get(run);
  if (hit === undefined) {
    throw new Error(`${run} was not replayed`);
  }
  return hit;
}

async function replay(c: ReplayCase): Promise<{
  readonly metrics: RunMetrics;
  readonly docs: { agentsCsv: string; sheltersCsv: string; simulationJson: string };
}> {
  const { config } = buildReplayConfig(c, archive.root);
  const result = await runHeadlessAsync({ config, paramNames: PARAM_NAMES });
  const docs = {
    agentsCsv: result.parity.agentsCsv,
    sheltersCsv: result.parity.sheltersCsv,
    simulationJson: result.parity.simulationJson,
  };
  return {
    metrics: scoreRun(docs.agentsCsv, docs.sheltersCsv, docs.simulationJson),
    docs,
  };
}

beforeAll(async () => {
  if (gate.action !== "run") {
    return;
  }
  for (const c of ARCHIVE_REPLAY_CASES) {
    const { metrics, docs } = await replay(c);
    replayed.set(c.run, { port: metrics, archived: scoreArchivedRun(c, archive.root) });
    if (c.run === REPEAT_RUN) {
      repeatFirst = docs;
    }
  }
  // The repeat, last, so it cannot perturb anything the other cases read.
  const again = await replay(ARCHIVE_REPLAY_CASES.find((c) => c.run === REPEAT_RUN)!);
  repeatSecond = again.docs;
}, PREPARE_TIMEOUT_MS);

// ---------------------------------------------------------------------------

describeGated(gate, () => {
  it("the matrix is the archived one: 4 families x 3 seeds, all present on disk", () => {
    expect(ARCHIVE_REPLAY_CASES.length).toBe(12);
    const families = new Map<string, number>();
    for (const c of ARCHIVE_REPLAY_CASES) {
      families.set(c.family, (families.get(c.family) ?? 0) + 1);
    }
    expect(Object.fromEntries([...families].sort())).toEqual({
      "ER-A": 3,
      "ER-C": 3,
      "SE-E18": 3,
      "SE2-E18-d1": 3,
    });
    expect(replayed.size).toBe(12);
  });

  it("the configurations come from the archived EXECUTED manifests, not the presets", () => {
    // Spec §5.6 item 4, mechanised. This is the premise of every count below: if
    // the runs were driven from the shipped presets they would execute
    // pushThetaThreshold = -0.25 where the archive executed 0.0, and any
    // agreement would be an accident of that parameter being inert.
    for (const c of ARCHIVE_REPLAY_CASES) {
      const built = buildReplayConfig(c, archive.root);
      const fallbacks = Object.keys(built.fromFallback).sort();
      if (c.archive === "phase-e") {
        // 33-parameter logger-v1 manifests: the whole Scenario-E block falls
        // back to ContextCreator.doubleParam's code defaults.
        expect(built.fromManifest.length, c.run).toBe(33);
        expect(fallbacks, c.run).toEqual([
          "closureDraw",
          "closuresCode",
          "kPush",
          "pStuck",
          "pushThetaThreshold",
          "smokeScale",
          "smokeSeriesCode",
          "stuckDelayH",
        ]);
        expect(built.presetDelta, c.run).toEqual({});
      } else {
        expect(built.fromManifest.length, c.run).toBe(c.archive === "scenario-e" ? 40 : 41);
        expect(fallbacks, c.run).toEqual(c.archive === "scenario-e" ? ["closureDraw"] : []);
        // The one documented preset-vs-executed difference, and it is REAL:
        // Repast's batch reader zeroes negative `number` constants (QUIRK 23).
        expect(built.presetDelta, c.run).toEqual({ pushThetaThreshold: [-0.25, 0] });
      }
    }
  }, CASE_TIMEOUT_MS);

  it("the ARCHIVE carries the published clause-3 numbers", () => {
    // Read off the certified Java bytes, before the port is mentioned. If the
    // archive on this machine is not the archive those numbers were published
    // from, everything below is measuring the wrong thing and says so here.
    for (const [run, want] of Object.entries(HEADLINE)) {
      const { archived } = resultFor(run);
      expect(archived.sheltered, `${run} sheltered`).toBe(want.sheltered);
      expect(archived.policy_refusals, `${run} policy_refusals`).toBe(want.policy_refusals);
      expect(archived.door_refusals_total, `${run} door_refusals`).toBe(want.door_refusals_total);
      expect(archived.unreachable_final, `${run} unreachable`).toBe(want.unreachable_final);
    }
  });

  it("the PORT reproduces the published clause-3 numbers", () => {
    for (const [run, want] of Object.entries(HEADLINE)) {
      const { port } = resultFor(run);
      expect(port.sheltered, `${run} sheltered`).toBe(want.sheltered);
      expect(port.policy_refusals, `${run} policy_refusals`).toBe(want.policy_refusals);
      expect(port.door_refusals_total, `${run} door_refusals`).toBe(want.door_refusals_total);
      expect(port.unreachable_final, `${run} unreachable`).toBe(want.unreachable_final);
    }
  });

  for (const c of ARCHIVE_REPLAY_CASES) {
    it(
      `${c.run}: the port matches the archive on all ${REPLAY_METRIC_FIELDS.length} metrics`,
      () => {
        const { port, archived } = resultFor(c.run);
        const deltas = metricDeltas(port, archived);
        expect(deltas, `${c.run}\n  ${deltas.join("\n  ")}`).toEqual([]);
        // Not vacuous: the run really happened at the archived size.
        expect(port.n).toBe(6842);
        // The out-of-range gate the smoke-slice gotcha exists for.
        expect(port.out_of_range_lookups, `${c.run} out_of_range_lookups`).toBe(0);
      },
      CASE_TIMEOUT_MS,
    );
  }

  it(
    `bit-stable: ${REPEAT_RUN} run twice in one process is byte-identical`,
    () => {
      expect(repeatFirst).not.toBeNull();
      expect(repeatSecond).not.toBeNull();
      expect(repeatSecond?.agentsCsv).toBe(repeatFirst?.agentsCsv);
      expect(repeatSecond?.sheltersCsv).toBe(repeatFirst?.sheltersCsv);
      expect(repeatSecond?.simulationJson).toBe(repeatFirst?.simulationJson);
    },
    CASE_TIMEOUT_MS,
  );

  // --- the comparison must be able to fail on this data --------------------

  it("goes red when ONE expected count is perturbed by one", () => {
    // The falsifiability proof, kept in CI rather than performed once by hand.
    // Every "the port matches the archive" case above is an assertion that a
    // list is empty; this is the assertion that the list is not empty by
    // construction.
    const { port, archived } = resultFor("ER-A-n6842-seed42");
    expect(metricDeltas(port, archived)).toEqual([]);

    const nudged: RunMetrics = { ...archived, sheltered: archived.sheltered + 1 };
    const deltas = metricDeltas(port, nudged);
    expect(deltas.length).toBe(1);
    expect(deltas[0]).toBe(`sheltered: port 1215 vs archive 1216`);
  });

  it("goes red when a metric leaves the compared census", () => {
    // The other way the comparison could quietly stop meaning anything: a
    // metric that exists in the data but not in REPLAY_METRIC_FIELDS would
    // never be compared, forever, silently.
    const { port, archived } = resultFor("ER-A-n6842-seed42");
    const { sheltered: _dropped, ...short } = archived;
    expect(() => metricDeltas(port, short as RunMetrics)).toThrow(/never be compared/u);
  });
});
