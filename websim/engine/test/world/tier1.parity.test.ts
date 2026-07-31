/**
 * WP6 acceptance — **Tier-1 initial-world identity** (plan §5.1).
 *
 * The oracle is the F1 export: 13 configs × seeds 42/43/44 = 39 per-resident
 * dumps (6,842 rows each), 13 shelter tables, and 2 parsed closure schedules,
 * every floating value written as the raw `%016x` of `doubleToRawLongBits` by a
 * harness that invoked the certified `PopulationSampler`, `ELayerSampler`,
 * `Shelter`, `CsvLoader` and `StreetNetwork` for every value it emitted.
 *
 * What "identity" means here, precisely:
 *
 *  - **camp assignment** — `camp_idx` and `inc_id`, the one build-time draw on
 *    the Repast default stream, per resident in creation order;
 *  - **demographics** — band, age, sex, mobility (+category), asthma, COPD,
 *    chronic-physical, and the speed **bit for bit** (the truncated-normal
 *    rejection loop and `nextGaussian`'s cached deviate are both in scope);
 *  - **E attributes** — aware/heavy/pet/dependents, raw θ_z bit for bit, the
 *    derived group delta, and the per-agent **decision seed** as a Java `long`;
 *  - **shelter tables** — capacity (incl. blank = unlimited), operating flag,
 *    open/close ticks (incl. the +1-day close offset and ±∞ when the gate is
 *    off), the `floor()` triage reserve, the tri-state pet policy, adults-only,
 *    and the snapped graph node;
 *  - **closure schedules** — wave hours, wave ticks, within-wave edge order and
 *    the phantom-match count.
 *
 * Two quantities are compared with a tolerance rather than by bits, and both are
 * geodesics: `snap_gap_m` here and in the shelter table. DR-S1 measured the
 * agreement ceiling between GeographicLib-Java 1.49 (the certified model) and
 * geographiclib-js 2.x (this port) at 3.159e-9 m and adopted a 1e-8 m budget.
 * Claiming bit-identity for those would be false. The node **choice**, which is
 * what routing depends on, is exact and is asserted as such.
 *
 * Skipped without `pipeline/out/` — the packed graph asset and the 45 MB world
 * dumps are both git-ignored. `world.committed.test.ts` runs the same comparison
 * against the committed stride sample and needs only the asset.
 */

import { readFileSync } from "node:fs";

import { expect, it } from "vitest";

import { unpackTopology } from "@websim/shared/graph-asset";

import { artifactGate, describeGated } from "../../../tools/artifact-gate.js";
import { buildRoutingGraph } from "../../src/graph/csr.js";
import { computeTree, makeScratch } from "../../src/graph/dijkstra.js";
import { DegreeSpaceNodeIndex } from "../../src/graph/strtreeSnap.js";
import { javaFormatFixed } from "../../src/mathx/format.js";
import { buildWorld, type WorldBuildResult } from "../../src/world/build.js";
import { ARCHIVED_MARGINALS, FIXTURE_CONFIGS, FIXTURE_SEEDS } from "./configs.js";
import {
  ASSET_DIR,
  GEOGRAPHY_SHELTERS_REF,
  GRAPH_TOPOLOGY_REF,
  WORLD_DUMP_REF,
  assetsPresent,
  bitsToDouble,
  dataLines,
  doubleToBits,
  geographyDataSource,
  headerFields,
  readVerifiedFixture,
  worldFixturesPresent,
  worldManifest,
} from "./helpers.js";

/** DR-S1's adopted budget for geodesic agreement between the two libraries. */
const GEODESIC_BUDGET_M = 1e-8;

const ready = assetsPresent() && worldFixturesPresent();

const tier1Gate = artifactGate({
  gate: "engine:world-tier1-parity",
  suite: "Tier-1 initial-world identity vs the certified Java dumps",
  evidence:
    "Tier-1 initial-world identity (plan §5.1): 39 per-resident dumps of 6,842 rows each " +
    "(266,838 residents) bit-for-bit — camp assignment, start node, demographics, E attributes " +
    "and decision seeds — plus 13 shelter tables and both parsed closure schedules. The one " +
    "field NOT bit-compared is the geodesic snap_gap_m (tolerance 1e-8 m; README §6 divergence 9)",
  artifacts: [GRAPH_TOPOLOGY_REF, WORLD_DUMP_REF, GEOGRAPHY_SHELTERS_REF],
});

let cached: { graph: ReturnType<typeof buildRoutingGraph>; index: DegreeSpaceNodeIndex } | null =
  null;

function graphAndIndex(): NonNullable<typeof cached> {
  if (cached === null) {
    const graph = buildRoutingGraph(
      unpackTopology(new Uint8Array(readFileSync(`${ASSET_DIR}/graph-topology.bin`))),
    );
    cached = { graph, index: new DegreeSpaceNodeIndex(graph) };
  }
  return cached;
}

interface Tally {
  checked: number;
  matched: number;
}

const tally = (): Tally => ({ checked: 0, matched: 0 });

function eq<T>(t: Tally, got: T, want: T, label: string): void {
  t.checked++;
  if (Object.is(got, want)) {
    t.matched++;
  } else {
    expect(got, label).toBe(want);
  }
}

describeGated(tier1Gate, () => {
  const { graph, index } = ready
    ? graphAndIndex()
    : ({} as { graph: ReturnType<typeof buildRoutingGraph>; index: DegreeSpaceNodeIndex });
  const data = ready ? geographyDataSource() : (null as never);
  const worlds = new Map<string, WorldBuildResult>();

  function world(configId: string, seed: number): WorldBuildResult {
    const key = `${configId}@${seed}`;
    let w = worlds.get(key);
    if (w === undefined) {
      const fixture = FIXTURE_CONFIGS.find((c) => c.id === configId)!;
      w = buildWorld(
        { ...fixture.config, randomSeed: seed },
        {
          graph,
          data,
          smokeHours: fixture.smokeHours,
          snapIndex: index,
          // WP5 already proved every shelter tree bit-for-bit (118 trees, arms
          // A/B/C, distances AND predecessor edges). Re-running 508 SSSPs here
          // would re-prove that at ~4x the cost; instead one config builds with
          // trees ON (below) to exercise step 8 end to end, and every config's
          // `reachable_nodes` column is checked against a memoised tree.
          computeShelterTrees: false,
          registryValidated: true,
        },
      );
      worlds.set(key, w);
    }
    return w;
  }

  it("resolves every archived config to the shelter file the exporter used", () => {
    const manifest = worldManifest();
    let checked = 0;
    for (const fixture of FIXTURE_CONFIGS) {
      const declared = manifest.configs.find((c) => c.id === fixture.id);
      expect(declared, `manifest config ${fixture.id}`).toBeDefined();
      const w = world(fixture.id, 42);
      expect(w.scenario.sheltersCsv, `${fixture.id} shelters csv`).toBe(declared!.sheltersCsv);
      expect(w.scenario.scenarioName, `${fixture.id} scenario name`).toBe(declared!.scenarioName);
      expect(w.smokeCsv, `${fixture.id} smoke csv`).toBe(declared!.smokeCsv);
      expect(w.closures?.csvPath ?? null, `${fixture.id} closures csv`).toBe(declared!.closuresCsv);
      expect(w.endHours, `${fixture.id} endHours`).toBe(declared!.endHours);
      expect(w.endTick, `${fixture.id} endTick`).toBe(declared!.endTick);
      expect(w.residents.length, `${fixture.id} numAgents`).toBe(declared!.numAgents);
      // Gotcha 3 holds for every archived config: 312 <= 575 and 455 <= 455.
      expect(w.overrunsSmokeSeries, `${fixture.id} smoke overrun`).toBe(false);
      checked++;
    }
    expect(checked).toBe(13);
  });

  it("reproduces all 39 per-resident dumps bit for bit, except the geodesic snap gap", () => {
    const camp = tally();
    const demo = tally();
    const speed = tally();
    const elayer = tally();
    const seeds = tally();
    const snapNode = tally();
    let maxGapDeltaM = 0;
    let gapRowsCompared = 0;
    let gapRowsBitDifferent = 0;
    let residentsCompared = 0;
    let dumpsCompared = 0;

    for (const fixture of FIXTURE_CONFIGS) {
      for (const seed of FIXTURE_SEEDS) {
        const name = `${fixture.id}-seed${seed}`;
        const text = readVerifiedFixture(`world/${name}.tsv`, `world.${name}`);
        const head = headerFields(text);

        // The exporter states the E parameters it sampled with; if this port's
        // declared config disagrees, the comparison below would be measuring
        // two different experiments.
        const w = world(fixture.id, seed);
        expect(Number(head.get("numAgents")), `${name} numAgents`).toBe(w.residents.length);
        expect(Number(head.get("enableDecisionLayer")), `${name} layer`).toBe(
          w.config.enableDecisionLayer,
        );
        if (w.config.enableDecisionLayer === 1) {
          expect(Number(head.get("pAwareInit")), `${name} pAwareInit`).toBe(w.config.pAwareInit);
          expect(Number(head.get("pHasPet")), `${name} pHasPet`).toBe(w.config.pHasPet);
          expect(Number(head.get("groupSpeedDeltaMps")), `${name} group delta`).toBe(
            w.config.groupSpeedDeltaMps,
          );
        }

        let row = 0;
        for (const line of dataLines(text)) {
          const f = line.split("\t");
          const r = w.residents[row]!;
          expect(Number(f[0]), `${name} row index`).toBe(r.index);

          // --- camp assignment: the only build-time default-stream draw ---
          eq(camp, r.campIndex, Number(f[1]), `${name}[${row}] camp_idx`);
          eq(camp, r.incId, f[2]!, `${name}[${row}] inc_id`);
          eq(camp, doubleToBits(r.startLon), f[3]!, `${name}[${row}] camp lon`);
          eq(camp, doubleToBits(r.startLat), f[4]!, `${name}[${row}] camp lat`);
          eq(snapNode, r.startNodeId, Number(f[5]), `${name}[${row}] start node`);
          const gapDelta = Math.abs(r.buildSnapGapM - bitsToDouble(f[6]!));
          if (gapDelta > maxGapDeltaM) {
            maxGapDeltaM = gapDelta;
          }
          gapRowsCompared++;
          if (doubleToBits(r.buildSnapGapM) !== f[6]!) {
            gapRowsBitDifferent++;
          }

          // --- demographics ---
          const a = r.attributes!;
          eq(demo, a.ageBand, f[7]!, `${name}[${row}] age band`);
          eq(demo, a.ageYears, Number(f[8]), `${name}[${row}] age`);
          eq(demo, a.sex, f[9]!, `${name}[${row}] sex`);
          eq(demo, a.mobilityLimited ? 1 : 0, Number(f[10]), `${name}[${row}] mobility`);
          eq(demo, a.mobilityCategory, f[11]!, `${name}[${row}] mobility category`);
          eq(demo, a.asthma ? 1 : 0, Number(f[12]), `${name}[${row}] asthma`);
          eq(demo, a.copd ? 1 : 0, Number(f[13]), `${name}[${row}] copd`);
          eq(demo, a.chronicPhysical ? 1 : 0, Number(f[14]), `${name}[${row}] chronic physical`);
          eq(speed, doubleToBits(a.walkingSpeedMps), f[15]!, `${name}[${row}] walking speed`);

          // --- E layer (empty, never fabricated, when the layer is off) ---
          if (w.config.enableDecisionLayer === 1) {
            const d = r.decision!;
            eq(elayer, d.awareInitial ? 1 : 0, Number(f[16]), `${name}[${row}] aware`);
            eq(elayer, d.heavyBelongings ? 1 : 0, Number(f[17]), `${name}[${row}] heavy`);
            eq(elayer, d.hasPet ? 1 : 0, Number(f[18]), `${name}[${row}] pet`);
            eq(elayer, d.hasDependents ? 1 : 0, Number(f[19]), `${name}[${row}] dependents`);
            eq(elayer, doubleToBits(d.thetaZ), f[20]!, `${name}[${row}] theta_z`);
            eq(
              elayer,
              doubleToBits(d.groupSpeedDeltaMps),
              f[21]!,
              `${name}[${row}] group speed delta`,
            );
            eq(seeds, d.decisionSeed.toString(), f[22]!, `${name}[${row}] decision seed`);
          } else {
            expect(r.decision, `${name}[${row}] decision block absent`).toBeNull();
            expect(f.slice(16).join(""), `${name}[${row}] E columns empty`).toBe("");
          }
          row++;
        }
        expect(row, `${name} row count`).toBe(w.residents.length);
        residentsCompared += row;
        dumpsCompared++;
      }
    }

    // eslint-disable-next-line no-console
    console.log(
      `[WP6] residents: ${dumpsCompared}/39 dumps, ${residentsCompared} residents; ` +
        `camp ${camp.matched}/${camp.checked}, start node ${snapNode.matched}/${snapNode.checked}, ` +
        `demographics ${demo.matched}/${demo.checked}, speed(bits) ${speed.matched}/${speed.checked}, ` +
        `E attrs ${elayer.matched}/${elayer.checked}, decision seeds ${seeds.matched}/${seeds.checked}; ` +
        `max snap-gap delta ${maxGapDeltaM.toExponential(3)} m (budget ${GEODESIC_BUDGET_M}), ` +
        `${gapRowsBitDifferent}/${gapRowsCompared} snap-gap rows differ in bits`,
    );
    expect(dumpsCompared).toBe(39);
    expect(residentsCompared).toBe(39 * 6842);
    expect(camp.matched).toBe(camp.checked);
    expect(snapNode.matched).toBe(snapNode.checked);
    expect(demo.matched).toBe(demo.checked);
    expect(speed.matched).toBe(speed.checked);
    expect(elayer.matched).toBe(elayer.checked);
    expect(seeds.matched).toBe(seeds.checked);
    expect(maxGapDeltaM).toBeLessThanOrEqual(GEODESIC_BUDGET_M);

    // README §6 divergence 9. `snap_gap_m` is the one Tier-1 field compared with a
    // tolerance rather than by bits, so the census is asserted rather than merely
    // logged — twice over, in both directions:
    //
    //  - It really is NOT bit-equal. If this ever hit zero, the tolerance above
    //    would have silently become a bit comparison and the divergence register
    //    would be carrying an entry that no longer describes reality. The register
    //    says removing an entry requires a test proving the divergence is gone;
    //    this is the test that would have to fail first.
    //  - It really is tiny. The rows that differ, differ in the last few ulp, not
    //    in a way any consumer could see.
    expect(gapRowsCompared).toBe(39 * 6842);
    expect(gapRowsBitDifferent).toBeGreaterThan(0);
    // Measured at 6,390/6,842 per dump (93.4%) for the A/B/C families. Pinned as a
    // floor, not an equality, so a legitimate geodesic-library change can narrow it
    // without a spurious failure — but cannot narrow it to nothing unnoticed.
    expect(gapRowsBitDifferent).toBeGreaterThanOrEqual(39 * 6000);
    expect(maxGapDeltaM).toBeGreaterThan(0);
  }, 900_000);

  it("reproduces all 13 shelter tables: windows, reserves, policy, snap", () => {
    const scratch = makeScratch(graph);
    const reachableByNode = new Map<number, number>();
    const t = tally();
    let maxGapDeltaM = 0;
    let sheltersCompared = 0;

    for (const fixture of FIXTURE_CONFIGS) {
      const text = readVerifiedFixture(`shelters/${fixture.id}.tsv`, `shelters.${fixture.id}`);
      const head = headerFields(text);
      const w = world(fixture.id, 42);
      expect(Number(head.get("triageReserveFraction")), `${fixture.id} reserve fraction`).toBe(
        w.config.triageReserveFraction,
      );
      expect(Number(head.get("ticksPerHour")), `${fixture.id} ticksPerHour`).toBe(w.ticksPerHour);

      let i = 0;
      for (const line of dataLines(text)) {
        const f = line.split("\t");
        const s = w.shelters[i]!;
        const at = `${fixture.id}[${i}] ${f[1]!}`;
        eq(t, s.id, f[1]!, `${at} id`);
        eq(t, s.name, f[2]!, `${at} name`);
        eq(t, s.capacity === null ? "" : String(s.capacity), f[3]!, `${at} capacity`);
        eq(t, s.operating ? 1 : 0, Number(f[4]), `${at} operating`);
        eq(t, doubleToBits(s.lon), f[5]!, `${at} lon`);
        eq(t, doubleToBits(s.lat), f[6]!, `${at} lat`);
        eq(t, doubleToBits(s.openTick), f[7]!, `${at} open tick`);
        eq(t, doubleToBits(s.closeTick), f[8]!, `${at} close tick`);
        eq(t, s.reservedForPriority, Number(f[9]), `${at} triage reserve`);
        eq(
          t,
          s.petIntake === null ? "unrecorded" : s.petIntake ? "admit" : "refuse",
          f[10]!,
          `${at} pet intake`,
        );
        eq(t, s.adultsOnly ? 1 : 0, Number(f[11]), `${at} adults only`);
        eq(t, s.graphNodeId, Number(f[12]), `${at} graph node`);
        eq(t, doubleToBits(graph.nodeLon[s.graphNode]!), f[13]!, `${at} node lon`);
        eq(t, doubleToBits(graph.nodeLat[s.graphNode]!), f[14]!, `${at} node lat`);
        const gapDelta = Math.abs(s.snapGapM - bitsToDouble(f[15]!));
        if (gapDelta > maxGapDeltaM) {
          maxGapDeltaM = gapDelta;
        }
        let reachable = reachableByNode.get(s.graphNode);
        if (reachable === undefined) {
          reachable = computeTree(graph, s.graphNode, scratch).reachableCount;
          reachableByNode.set(s.graphNode, reachable);
        }
        eq(t, reachable, Number(f[16]), `${at} reachable nodes`);
        i++;
        sheltersCompared++;
      }
      expect(i, `${fixture.id} shelter count`).toBe(w.shelters.length);
    }

    // eslint-disable-next-line no-console
    console.log(
      `[WP6] shelters: 13/13 tables, ${sheltersCompared} sites, ${t.matched}/${t.checked} fields ` +
        `equal (${reachableByNode.size} distinct snap nodes routed); ` +
        `max snap-gap delta ${maxGapDeltaM.toExponential(3)} m`,
    );
    expect(sheltersCompared).toBe(508);
    expect(t.matched).toBe(t.checked);
    expect(maxGapDeltaM).toBeLessThanOrEqual(GEODESIC_BUDGET_M);
  }, 600_000);

  it("reproduces the per-arm capacity sums the archive records", () => {
    // PORT_MAP §6.2 (`verify_2026_runs.py`): A 2,234 beds, B and C 6,842 each
    // — 6,842 being the 2025 Tri-County PIT unsheltered count the arms are
    // sized against. The `_elayer` variants must carry the same beds: they add
    // a recorded pet policy, nothing else.
    const sum = (id: string): number =>
      world(id, 42).shelters.reduce((a, s) => a + (s.capacity ?? 0), 0);
    expect(sum("A")).toBe(2234);
    expect(sum("B")).toBe(6842);
    expect(sum("C")).toBe(6842);
    expect(sum("ER-A")).toBe(2234);
    expect(sum("ER-C")).toBe(6842);
    expect(sum("ER-D")).toBe(6842);
    expect(sum("SE-E18")).toBe(2234);
    expect(sum("SE-E20")).toBe(6842);
    // Arm D holds back floor(10%) per site, so its reserve total is strictly
    // below 684 (the floor loses a fraction of a bed at most sites).
    const reserve = world("ER-D", 42).shelters.reduce((a, s) => a + s.reservedForPriority, 0);
    expect(reserve).toBeGreaterThan(0);
    expect(reserve).toBeLessThan(684);
    expect(world("A", 42).shelters.every((s) => s.reservedForPriority === 0)).toBe(true);
    // eslint-disable-next-line no-console
    console.log(
      `[WP6] capacity: A 2234 / B 6842 / C 6842 beds; arm-D triage reserve ${reserve} beds ` +
        `over ${world("ER-D", 42).operatingShelters} operating sites`,
    );
  });

  it("builds one config with step 8's Dijkstra pass switched on", () => {
    // The comparison above memoises trees outside the build; this one runs the
    // real step-8 loop so the build path itself is exercised end to end.
    const fixture = FIXTURE_CONFIGS.find((c) => c.id === "SE2-E18-d1")!;
    const w = buildWorld(
      { ...fixture.config, randomSeed: 42 },
      { graph, data, smokeHours: fixture.smokeHours, snapIndex: index, registryValidated: true },
    );
    const text = readVerifiedFixture(`shelters/${fixture.id}.tsv`, `shelters.${fixture.id}`);
    let i = 0;
    for (const line of dataLines(text)) {
      const f = line.split("\t");
      const s = w.shelters[i]!;
      expect(s.routeTree, `${fixture.id}[${i}] tree present`).not.toBeNull();
      expect(s.routeTree!.sourceNode, `${fixture.id}[${i}] tree source`).toBe(s.graphNode);
      expect(s.routeTree!.reachableCount, `${fixture.id}[${i}] reachable`).toBe(Number(f[16]));
      i++;
    }
    expect(i).toBe(36);
  }, 300_000);

  it("reproduces the parsed closure schedules", () => {
    const manifest = worldManifest();
    let wavesCompared = 0;
    let edgesCompared = 0;

    for (const fixture of FIXTURE_CONFIGS) {
      if (fixture.closureFixture === null) {
        expect(world(fixture.id, 42).closures, `${fixture.id} has no schedule`).toBeNull();
        continue;
      }
      const manifestName = `closures.${fixture.closureFixture.replace("schedule-", "")}`;
      const text = readVerifiedFixture(
        `closures/${fixture.closureFixture}.tsv`,
        manifestName,
      );
      const head = headerFields(text);
      const w = world(fixture.id, 42);
      const sched = w.closures!;

      expect(sched.scheduledEdges, `${fixture.id} scheduled`).toBe(
        Number(head.get("scheduled_edges")),
      );
      expect(sched.matchingGraphEdges, `${fixture.id} matching`).toBe(
        Number(head.get("matching_graph_edges")),
      );
      expect(sched.waves.length, `${fixture.id} waves`).toBe(Number(head.get("waves")));
      expect(sched.inertRows, `${fixture.id} inert rows`).toBe(
        Number(head.get("inert_rows_at_or_after_end")),
      );

      const declared = manifest.configs.find((c) => c.id === fixture.id)!;
      expect(sched.scheduledEdges).toBe(declared.closureEdgesScheduled);
      expect(sched.matchingGraphEdges).toBe(declared.closureEdgesMatchingGraph);
      expect(sched.waves.length).toBe(declared.closureWaves);

      // Row order in the dump is wave-major (ascending hour), then within-wave
      // file order — exactly the order the port must reproduce.
      let w1 = 0;
      let e = 0;
      for (const line of dataLines(text)) {
        const f = line.split("\t");
        const hour = Number(f[0]);
        const edgeIndex = Number(f[2]);
        if (edgeIndex === 0 && (w1 > 0 || e > 0)) {
          w1++;
          e = 0;
        }
        const wave = sched.waves[w1]!;
        expect(wave.hour, `${fixture.id} wave ${w1} hour`).toBe(hour);
        expect(wave.tick, `${fixture.id} wave ${w1} tick`).toBe(Number(f[1]));
        const edge = wave.edges[e]!;
        expect(edge.nodeA, `${fixture.id} wave ${w1} edge ${e} a`).toBe(Number(f[3]));
        expect(edge.nodeB, `${fixture.id} wave ${w1} edge ${e} b`).toBe(Number(f[4]));
        expect(edge.matchesGraphEdge ? 1 : 0, `${fixture.id} wave ${w1} edge ${e} match`).toBe(
          Number(f[5]),
        );
        e++;
        edgesCompared++;
      }
      wavesCompared += sched.waves.length;
    }
    // eslint-disable-next-line no-console
    console.log(`[WP6] closures: ${wavesCompared} waves, ${edgesCompared} scheduled edges equal`);
    expect(edgesCompared).toBeGreaterThan(0);
  });

  it("realises the archived population marginals exactly, at every seed", () => {
    const rows: string[] = [];
    for (const seed of FIXTURE_SEEDS) {
      const m = world("A", seed).populationMarginals!;
      const got = [
        javaFormatFixed(m.mobilityLimitedShare, 4),
        javaFormatFixed(m.asthmaShare, 4),
        javaFormatFixed(m.copdShare, 4),
        javaFormatFixed(m.anyRespiratoryShare, 4),
        javaFormatFixed(m.age55PlusShare, 4),
        javaFormatFixed(m.meanWalkingSpeedMps, 4),
      ];
      rows.push(`seed ${seed}: ${got.join(" / ")}`);
      expect(m.sampled, `seed ${seed} sampled`).toBe(6842);
      expect(got, `seed ${seed} realised marginals`).toEqual(ARCHIVED_MARGINALS.get(seed));

      // The population is a property of the seed alone, never of the arm or the
      // E parameters — the three-streams rule, asserted rather than assumed.
      for (const fixture of FIXTURE_CONFIGS) {
        const other = world(fixture.id, seed).populationMarginals!;
        expect(other, `${fixture.id} seed ${seed} marginals`).toEqual(m);
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[WP6] realised marginals (%.4f, mobility/asthma/COPD/any-resp/55+/speed)`);
    for (const r of rows) {
      // eslint-disable-next-line no-console
      console.log(`[WP6]   ${r}`);
    }
  }, 300_000);

  it("keeps the three streams disjoint across all 13 configs (F1 §3 invariants)", () => {
    for (const seed of FIXTURE_SEEDS) {
      const base = world("A", seed);
      const campKey = base.residents.map((r) => r.campIndex).join(",");
      const demoKey = base.residents
        .map((r) => `${r.attributes!.ageYears}:${doubleToBits(r.attributes!.walkingSpeedMps)}`)
        .join(",");

      const eFamilies = new Map<string, string>();
      for (const fixture of FIXTURE_CONFIGS) {
        const w = world(fixture.id, seed);
        expect(w.residents.map((r) => r.campIndex).join(","), `${fixture.id} camps`).toBe(campKey);
        expect(
          w.residents
            .map((r) => `${r.attributes!.ageYears}:${doubleToBits(r.attributes!.walkingSpeedMps)}`)
            .join(","),
          `${fixture.id} demographics`,
        ).toBe(demoKey);

        if (w.config.enableDecisionLayer === 1) {
          // Belongings / pet / dependents / theta are invariant to pAwareInit,
          // which differs between the E0 and E_REAL families — so this is the
          // non-vacuous half of the claim.
          const barrierKey = w.residents
            .map(
              (r) =>
                `${r.decision!.heavyBelongings ? 1 : 0}${r.decision!.hasPet ? 1 : 0}` +
                `${r.decision!.hasDependents ? 1 : 0}:${doubleToBits(r.decision!.thetaZ)}`,
            )
            .join(",");
          const family = w.config.pAwareInit === 1 ? "E0" : "EREAL";
          const seen = eFamilies.get("barriers");
          if (seen === undefined) {
            eFamilies.set("barriers", barrierKey);
          } else {
            expect(barrierKey, `${fixture.id} barrier attributes`).toBe(seen);
          }
          const awareKey = w.residents.map((r) => (r.decision!.awareInitial ? 1 : 0)).join("");
          const prior = eFamilies.get(family);
          if (prior === undefined) {
            eFamilies.set(family, awareKey);
          } else {
            expect(awareKey, `${fixture.id} awareness within family ${family}`).toBe(prior);
          }
        }
      }
      // The two E families must actually DIFFER, or the check above is vacuous.
      expect(eFamilies.get("E0")).not.toBe(eFamilies.get("EREAL"));
    }
    // eslint-disable-next-line no-console
    console.log(
      "[WP6] three-streams rule: camp vector + demographics identical across all 13 configs " +
        "at each seed; barrier attributes identical across all 10 layer configs despite " +
        "pAwareInit differing; awareness differs between the E0 and E_REAL families",
    );
  }, 300_000);
});
