/**
 * WP8 acceptance, half one: **every wave of both certified Scenario-E schedules
 * reproduces the Java oracle bit-exactly.**
 *
 * The oracle is `pipeline/out/closure-fixtures/waves/` (DR-WP8-closure-oracle
 * §5), produced by handing the *certified* `ContextCreator$ClosureWave` —
 * constructed reflectively and scheduled on a real Repast `Schedule` at
 * `FIRST_PRIORITY` — the same edge lists this engine reads, then reading the
 * network afterwards. Not one line of the block→bump→recompute sequence is
 * transcribed on the Java side, so what is compared here is the port against the
 * instrument, not against a second implementation of the port.
 *
 * Five things are compared, and only the first two are the obvious ones:
 *
 *  1. **The ordered set of edges each wave blocks** (`edges.tsv`) — CSV file
 *     order inside the wave, with the `hasEdge` guard outcome per row. Both the
 *     dump's row numbering and the parser's grouping are re-derived from the CSV
 *     here, so a reordering, a dropped guard (QUIRK 5) or a mis-grouped hour
 *     (QUIRK 36) each fail as a list difference.
 *  2. **`blockedEdgeCount()` and `getClosureVersion()` after every wave**
 *     (`waves.tsv`). The version is the gate-(k) quantity: it counts waves that
 *     FIRED, so an "inert" wave skipped at the run end shows up as an off-by-one
 *     (QUIRK 1, QUIRK 35).
 *  3. **The cumulative blocked pair set** (`blocked-pairs.tsv`), read out of the
 *     certified `blockedAdj`. This is what catches a one-sided `blockEdge`
 *     (QUIRK 8) or a canonicalisation that collides the negative synthetic node
 *     ids (QUIRK 28).
 *  4. **Every post-wave shelter tree, by SHA-256 over the FULL distance +
 *     predecessor array** (`trees.tsv`), in the WP5 row form — 324 tree states
 *     covering 9,790,041 distance+predecessor entries. The reachable *set* is
 *     part of the digest, so a tree that keeps a node alive through a closed
 *     street fails even when every shared distance matches.
 *  5. **The 128 stride-sampled raw rows per tree** (`trees-sample.tsv`), as a
 *     second, human-diffable channel: when a digest disagrees, this says *where*.
 *
 * Plus the wave-0 (pre-closure) state, whose rollup is the dumper's own pristine
 * fingerprint `8af1068a…` — the 36-tree fingerprint it re-takes after every
 * blocked-state reset. Matching it proves the port and the dumper start from the
 * same world, without which no comparison of a *post*-wave state means anything.
 *
 * Artifact-gated: the packed graph asset, the closure dumps and the read-only
 * `Geography/` tree are all outside a clean checkout of `websim/`.
 */

import { expect, it } from "vitest";

import { artifactGate, describeGated } from "../../../tools/artifact-gate.js";
import { ClosureRuntime } from "../../src/closures/runtime.js";
import { computeTree, makeScratch, retainTree } from "../../src/graph/dijkstra.js";
import { GRAPH_ASSET_REFS, loadGraph } from "../graph/helpers.js";
import {
  closureManifest,
  closureRef,
  geographyRef,
  nodeOrderByIdAscending,
  readVerifiedDump,
  rollup,
  treeDigest,
  tsvRows,
  type SampledTreeRow,
} from "./helpers.js";
import { CONFIGS, closureCsvRows, loadSchedule, loadShelters } from "./world.js";

const WAVE_ARTIFACTS = [
  ...GRAPH_ASSET_REFS,
  geographyRef("data/shelters/shelters_2026_current_placement.csv"),
  geographyRef("data/closures/closures_E_r1.csv"),
  geographyRef("data/closures/closures_E_r1_worst.csv"),
  closureRef("manifest.json"),
  closureRef("waves/SE-E18/waves.tsv"),
  closureRef("waves/SE2-E18-d1/waves.tsv"),
];

interface Census {
  config: string;
  waveStates: number;
  edgeRows: number;
  pairRows: number;
  treeDigests: number;
  sampleRows: number;
  rollups: number;
  counters: number;
  entriesDigested: number;
}

describeGated(
  artifactGate({
    gate: "engine:closures-wave-oracle",
    suite: "ClosureWave.apply() vs the certified Java wave oracle",
    evidence:
      "every wave of closures_E_r1 (1 wave, 18 edges) and closures_E_r1_worst (6 waves, 72 " +
      "edges) reproduced bit-exactly: the ordered blocked-edge sets, the cumulative pair sets, " +
      "blockedEdgeCount/closureVersion after each wave, and 324 post-wave shelter-tree states " +
      "digested over their FULL distance+predecessor arrays",
    artifacts: WAVE_ARTIFACTS,
  }),
  () => {
    it("the dumper reported 0 self-check failures", () => {
      // A dump produced by a run that failed its own 1,024 assertions is not an
      // oracle, and every comparison below would be measuring the wrong thing.
      const m = closureManifest();
      expect(m.selfCheckFailures).toBe(0);
      expect(m.selfChecks.filter((c) => !c.ok)).toEqual([]);
      expect(m.seeds).toEqual([42, 43, 44]);
    });

    it("the pre-closure rollup is the dumper's own pristine fingerprint", () => {
      const se = tsvRows(readVerifiedDump("waves.SE-E18.waves", "waves/SE-E18/waves.tsv"));
      const se2 = tsvRows(readVerifiedDump("waves.SE2-E18-d1.waves", "waves/SE2-E18-d1/waves.tsv"));
      expect(se[0]![8]).toBe(closureManifest().pristineFingerprint);
      expect(se2[0]![8]).toBe(closureManifest().pristineFingerprint);
    });

    it("every wave rollup is identical across seeds 42/43/44 (apply() draws no RNG)", () => {
      // Spec §14.1 says the wave consumes no randomness; the dumper asserted it
      // by running all three seeds. Re-assert it from the shipped table rather
      // than restating the claim: this is the one place the port can check that
      // the oracle it is comparing against is itself seed-free.
      const rows = tsvRows(readVerifiedDump("waves.seed-invariance", "waves/seed-invariance.tsv"));
      const byKey = new Map<string, Set<string>>();
      for (const row of rows) {
        const k = `${row[0]!}/${row[2]!}`;
        let shas = byKey.get(k);
        if (shas === undefined) {
          shas = new Set<string>();
          byKey.set(k, shas);
        }
        shas.add(row[3]!);
      }
      expect(rows.length).toBe(27); // (2 + 7) wave states x 3 seeds
      expect(byKey.size).toBe(9);
      for (const [k, shas] of byKey) {
        expect(shas.size, `${k} rollups across seeds`).toBe(1);
      }
    });

    it(
      "reproduces every wave of SE-E18 and SE2-E18-d1 bit-exactly",
      () => {
        const { graph } = loadGraph();
        const order = nodeOrderByIdAscending(graph);
        const scratch = makeScratch(graph);
        const census: Census[] = [];

        for (const cfg of CONFIGS) {
          const dir = `waves/${cfg.name}`;
          const wavesTsv = tsvRows(readVerifiedDump(`waves.${cfg.name}.waves`, `${dir}/waves.tsv`));
          const edgesTsv = tsvRows(readVerifiedDump(`waves.${cfg.name}.edges`, `${dir}/edges.tsv`));
          const pairsTsv = tsvRows(
            readVerifiedDump(`waves.${cfg.name}.pairs`, `${dir}/blocked-pairs.tsv`),
          );
          const treesTsv = tsvRows(readVerifiedDump(`waves.${cfg.name}.trees`, `${dir}/trees.tsv`));
          const sampleTsv = tsvRows(
            readVerifiedDump(`waves.${cfg.name}.treesample`, `${dir}/trees-sample.tsv`),
          );

          const c: Census = {
            config: cfg.name,
            waveStates: 0,
            edgeRows: 0,
            pairRows: 0,
            treeDigests: 0,
            sampleRows: 0,
            rollups: 0,
            counters: 0,
            entriesDigested: 0,
          };

          const shelters = loadShelters(graph, cfg.sheltersCsv);
          const schedule = loadSchedule(graph, cfg.closuresCsv);
          const csvRows = closureCsvRows(cfg.closuresCsv);
          const runtime = new ClosureRuntime({ graph, shelters, schedule, scratch });

          expect(wavesTsv.length, `${cfg.name} wave states`).toBe(cfg.waveStates);

          // --- wave state 0: the pre-closure world -------------------------
          for (const s of shelters) {
            s.routeTree = retainTree(computeTree(graph, s.graphNode, scratch));
          }

          for (let state = 0; state < wavesTsv.length; state++) {
            const w = wavesTsv[state]!;
            expect(Number(w[0]), `${cfg.name} wave column`).toBe(state);

            if (state > 0) {
              const wave = schedule.waves[state - 1]!;
              expect(wave.hour, `${cfg.name} wave ${state} hour`).toBe(Number(w[1]));
              expect(wave.tick, `${cfg.name} wave ${state} tick`).toBe(Number(w[2]));

              // --- A. the ordered blocked-edge set, re-derived from the CSV --
              //
              // Both sides are built here: `mine` from the parser's wave (node
              // pairs, order, guard) joined to the CSV's own row numbering and
              // labels, `theirs` from the dump. Nothing is copied across.
              const theirs = edgesTsv
                .filter((r) => Number(r[0]) === state)
                .map((r) => r.slice(0, 9).join("\t"));
              const inHour = csvRows.filter((r) => r.hour === wave.hour);
              expect(inHour.length, `${cfg.name} wave ${state} CSV rows at hour`).toBe(
                wave.edges.length,
              );
              const mine = wave.edges.map((e, i) => {
                const src = inHour[i]!;
                // The parser must have kept file order inside the hour, so the
                // i-th parsed edge is the i-th CSV row at that hour.
                expect([e.nodeA, e.nodeB], `${cfg.name} wave ${state} edge ${i} pair`).toEqual([
                  src.nodeA,
                  src.nodeB,
                ]);
                return [
                  state,
                  wave.hour,
                  i,
                  src.rowNo,
                  e.nodeA,
                  e.nodeB,
                  e.matchesGraphEdge ? 1 : 0,
                  src.label,
                  src.kind,
                ].join("\t");
              });
              expect(mine, `${cfg.name} wave ${state} edges.tsv`).toEqual(theirs);
              c.edgeRows += mine.length;

              // --- B/C/D: fire it -------------------------------------------
              const report = runtime.apply(wave);
              c.counters += 4;
              expect(
                [
                  report.rowsInWave,
                  report.matchingInWave,
                  report.blockedEdgeCount,
                  report.closureVersion,
                ],
                `${cfg.name} wave ${state} census`,
              ).toEqual([Number(w[3]), Number(w[4]), Number(w[5]), Number(w[6])]);
              expect(report.sheltersRecomputed, `${cfg.name} wave ${state} trees`).toBe(
                Number(w[7]),
              );

              // --- the cumulative blocked pair set ---------------------------
              const wantPairs = pairsTsv
                .filter((r) => Number(r[0]) === state)
                .map((r) => `${r[2]}\t${r[3]}`);
              const gotPairs = runtime.blocked
                .blockedPairs()
                .map(([a, b]): [number, number] => {
                  const idA = graph.nodeId[a]!;
                  const idB = graph.nodeId[b]!;
                  return idA <= idB ? [idA, idB] : [idB, idA];
                })
                .sort((x, y) => x[0] - y[0] || x[1] - y[1])
                .map(([a, b]) => `${a}\t${b}`);
              expect(gotPairs, `${cfg.name} wave ${state} cumulative blocked pairs`).toEqual(
                wantPairs,
              );
              c.pairRows += wantPairs.length;
            }

            // --- the 36 shelter trees at this wave state --------------------
            const wantTrees = treesTsv.filter((r) => Number(r[0]) === state);
            expect(wantTrees.length, `${cfg.name} state ${state} tree rows`).toBe(shelters.length);
            const perTree: string[] = [];
            for (let i = 0; i < shelters.length; i++) {
              const s = shelters[i]!;
              const want = wantTrees[i]!;
              const sample: SampledTreeRow[] = [];
              const d = treeDigest(graph, s.routeTree!, order, sample);
              c.treeDigests++;
              // One digested ROW per reachable node, carrying one distance and
              // one predecessor. The DR reports the total as 9,790,041.
              c.entriesDigested += d.reachable;
              expect(
                [
                  Number(want[2]),
                  want[3],
                  want[4],
                  want[5],
                  want[6],
                  want[7],
                ],
                `${cfg.name} state ${state} shelter ${i}`,
              ).toEqual([
                i,
                s.id,
                s.operating ? "1" : "0",
                String(d.sourceNodeId),
                String(d.reachable),
                d.sha256,
              ]);
              perTree.push(d.sha256);

              const wantSample = sampleTsv.filter(
                (r) => Number(r[0]) === state && Number(r[1]) === i,
              );
              expect(
                sample.map((r) => `${r.nodeId}\t${r.distHex}\t${r.predDirectedEdge}`),
                `${cfg.name} state ${state} shelter ${i} sample rows`,
              ).toEqual(wantSample.map((r) => r.slice(2, 5).join("\t")));
              c.sampleRows += sample.length;
            }
            expect(rollup(perTree), `${cfg.name} state ${state} tree rollup`).toBe(w[8]!);
            c.rollups++;
            c.waveStates++;
          }

          census.push(c);
        }

        // Reported so a green run says what it proved, not merely that it passed.
        // eslint-disable-next-line no-console -- the census IS the evidence
        console.log(`[WP8 wave oracle] ${JSON.stringify(census)}`);

        expect(census.reduce((n, c) => n + c.treeDigests, 0)).toBe(36 * (2 + 7));
        expect(census.reduce((n, c) => n + c.edgeRows, 0)).toBe(18 + 72);
        // DR-WP8-closure-oracle §1: 324 tree states, 9,790,041 rows.
        expect(census.reduce((n, c) => n + c.entriesDigested, 0)).toBe(9_790_041);
      },
      900_000,
    );
  },
);
