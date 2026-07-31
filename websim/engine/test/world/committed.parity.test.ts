/**
 * The committed half of the WP6 oracle.
 *
 * `tier1.parity.test.ts` compares against 45 MB of git-ignored dumps and is
 * therefore skipped in a clean checkout. This file compares the **same builds**
 * against `engine/test/fixtures/world/residents-sample.tsv`, which IS committed:
 * 32 stride-sampled residents per config-seed, 1,248 rows over all 39
 * config-seed pairs, every value produced by the certified samplers.
 *
 * It still needs the packed graph asset (for the snapped start node), so it is
 * skipped when `pipeline/out/assets` is absent — the same trade-off WP2-S5 made
 * for the RNG fixtures and WP5 made for the trees. What it buys is that a
 * regression in the draw order cannot survive a checkout that lacks the bulk
 * dumps: 1,248 stride-sampled residents at stride 220 are spread across the
 * whole 6,842-resident sequence, so a single missed draw anywhere shows up.
 *
 * Also checks the engine's own scenario transcription against the shipped
 * `shelter-index.json` asset — two independent transcriptions of the same Java
 * `if/else` chain (WP4 wrote one, WP6 the other), which is a cheap and genuinely
 * cross-implementation agreement test rather than a restatement.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { unpackTopology } from "@websim/shared/graph-asset";

import { artifactGate, describeGated, itGated } from "../../../tools/artifact-gate.js";
import { buildRoutingGraph } from "../../src/graph/csr.js";
import { DegreeSpaceNodeIndex } from "../../src/graph/strtreeSnap.js";
import { SCENARIO_CHAIN, elayerFileName, resolveScenario } from "../../src/world/scenario.js";
import { buildWorld, type WorldBuildResult } from "../../src/world/build.js";
import { FIXTURE_CONFIGS } from "./configs.js";
import {
  ASSET_DIR,
  COMMITTED_FIXTURE_DIR,
  GEOGRAPHY_SHELTERS_REF,
  GRAPH_TOPOLOGY_REF,
  dataLines,
  doubleToBits,
  geographyDataSource,
} from "./helpers.js";

const GEODESIC_BUDGET_M = 1e-8;

const bitsBuf = new ArrayBuffer(8);
const bitsU64 = new BigUint64Array(bitsBuf);
const bitsF64 = new Float64Array(bitsBuf);
const toDouble = (hex: string): number => {
  bitsU64[0] = BigInt(`0x${hex}`);
  return bitsF64[0]!;
};

describeGated(
  artifactGate({
    gate: "engine:world-committed-oracle",
    suite: "committed stride-sampled resident oracle",
    evidence:
      "1,248 stride-sampled residents over all 39 config-seed pairs, compared bit-for-bit against " +
      "the committed oracle rows — the draw-order check that survives a checkout without the bulk dumps",
    artifacts: [GRAPH_TOPOLOGY_REF, GEOGRAPHY_SHELTERS_REF],
  }),
  () => {
  it("reproduces every sampled resident across all 39 config-seed pairs", () => {
    const graph = buildRoutingGraph(
      unpackTopology(new Uint8Array(readFileSync(`${ASSET_DIR}/graph-topology.bin`))),
    );
    const index = new DegreeSpaceNodeIndex(graph);
    const data = geographyDataSource();
    const worlds = new Map<string, WorldBuildResult>();

    const sample = readFileSync(`${COMMITTED_FIXTURE_DIR}/residents-sample.tsv`, "utf8");
    let rows = 0;
    let maxGapDeltaM = 0;
    const pairs = new Set<string>();

    for (const line of dataLines(sample)) {
      const f = line.split("\t");
      const configId = f[0]!;
      const seed = Number(f[1]);
      const key = `${configId}@${seed}`;
      pairs.add(key);

      let w = worlds.get(key);
      if (w === undefined) {
        const fixture = FIXTURE_CONFIGS.find((c) => c.id === configId);
        expect(fixture, `config ${configId} is declared`).toBeDefined();
        w = buildWorld(
          { ...fixture!.config, randomSeed: seed },
          {
            graph,
            data,
            smokeHours: fixture!.smokeHours,
            snapIndex: index,
            computeShelterTrees: false,
            registryValidated: true,
          },
        );
        worlds.set(key, w);
      }

      const i = Number(f[2]);
      const r = w.residents[i]!;
      const at = `${key}[${i}]`;
      expect(r.index, `${at} index`).toBe(i);
      expect(r.campIndex, `${at} camp_idx`).toBe(Number(f[3]));
      expect(r.incId, `${at} inc_id`).toBe(f[4]!);
      expect(doubleToBits(r.startLon), `${at} camp lon`).toBe(f[5]!);
      expect(doubleToBits(r.startLat), `${at} camp lat`).toBe(f[6]!);
      expect(r.startNodeId, `${at} start node`).toBe(Number(f[7]));
      maxGapDeltaM = Math.max(maxGapDeltaM, Math.abs(r.buildSnapGapM - toDouble(f[8]!)));

      const a = r.attributes!;
      expect(a.ageBand, `${at} age band`).toBe(f[9]!);
      expect(a.ageYears, `${at} age`).toBe(Number(f[10]));
      expect(a.sex, `${at} sex`).toBe(f[11]!);
      expect(a.mobilityLimited ? 1 : 0, `${at} mobility`).toBe(Number(f[12]));
      expect(a.mobilityCategory, `${at} mobility category`).toBe(f[13]!);
      expect(a.asthma ? 1 : 0, `${at} asthma`).toBe(Number(f[14]));
      expect(a.copd ? 1 : 0, `${at} copd`).toBe(Number(f[15]));
      expect(a.chronicPhysical ? 1 : 0, `${at} chronic physical`).toBe(Number(f[16]));
      expect(doubleToBits(a.walkingSpeedMps), `${at} speed`).toBe(f[17]!);

      if (w.config.enableDecisionLayer === 1) {
        const d = r.decision!;
        expect(d.awareInitial ? 1 : 0, `${at} aware`).toBe(Number(f[18]));
        expect(d.heavyBelongings ? 1 : 0, `${at} heavy`).toBe(Number(f[19]));
        expect(d.hasPet ? 1 : 0, `${at} pet`).toBe(Number(f[20]));
        expect(d.hasDependents ? 1 : 0, `${at} dependents`).toBe(Number(f[21]));
        expect(doubleToBits(d.thetaZ), `${at} theta_z`).toBe(f[22]!);
        expect(doubleToBits(d.groupSpeedDeltaMps), `${at} group delta`).toBe(f[23]!);
        expect(d.decisionSeed.toString(), `${at} decision seed`).toBe(f[24]!);
      } else {
        expect(r.decision, `${at} decision block`).toBeNull();
        expect(f.slice(18).join(""), `${at} E columns empty`).toBe("");
      }
      rows++;
    }

    // eslint-disable-next-line no-console
    console.log(
      `[WP6] committed oracle: ${rows} stride-sampled residents over ${pairs.size} ` +
        `config-seed pairs, all fields equal; max snap-gap delta ` +
        `${maxGapDeltaM.toExponential(3)} m`,
    );
    expect(pairs.size).toBe(39);
    expect(rows).toBe(1248);
    expect(maxGapDeltaM).toBeLessThanOrEqual(GEODESIC_BUDGET_M);
  }, 600_000);
  },
);

describe("scenario chain vs the shipped shelter-index asset", () => {
  const indexPath = `${ASSET_DIR}/shelter-index.json`;

  itGated(
    artifactGate({
      gate: "engine:world-scenario-vs-asset",
      suite: "scenario chain vs the shipped shelter-index asset",
      evidence:
        "the cross-implementation agreement between WP4's shelter-index asset and WP6's own " +
        "transcription of the same Java if/else scenario chain",
      artifacts: [{ source: "built-assets", label: "shelter-index.json", path: indexPath }],
    }),
    "agrees with WP4's independent transcription",
    () => {
    const asset = JSON.parse(readFileSync(indexPath, "utf8")) as {
      fallback_scenario_code: number;
      severe_label_codes: number[];
      scenarios: {
        code: number;
        scenario_name: string;
        shelters_file: string;
        elayer_file: string;
        reserve_driven: boolean;
      }[];
    };

    expect(asset.scenarios.length).toBe(SCENARIO_CHAIN.length);
    expect(asset.fallback_scenario_code).toBe(SCENARIO_CHAIN[0]!.code);
    for (const entry of asset.scenarios) {
      const mine = SCENARIO_CHAIN.find((e) => e.code === entry.code);
      expect(mine, `code ${entry.code}`).toBeDefined();
      expect(mine!.scenarioName, `code ${entry.code} name`).toBe(entry.scenario_name);
      expect(mine!.sheltersFile, `code ${entry.code} file`).toBe(entry.shelters_file);
      expect(mine!.reserveDriven, `code ${entry.code} reserve-driven`).toBe(entry.reserve_driven);
      expect(elayerFileName(entry.shelters_file), `code ${entry.code} elayer`).toBe(
        entry.elayer_file,
      );
      // …and the resolver reaches the same file through the code path the
      // engine actually uses.
      expect(
        resolveScenario(
          { scenarioCode: entry.code, shelterPolicyVariant: 0, smokeSeriesCode: 1 },
          () => true,
        ).sheltersCsv,
      ).toBe(`data/shelters/${entry.shelters_file}`);
    }
    },
  );
});
