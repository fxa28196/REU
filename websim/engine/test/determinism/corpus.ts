/**
 * The cross-engine determinism corpus (plan §3.3 "same config run twice, on
 * Chrome/Firefox/WebKit/Node → byte-identical outputs", §5.1 Tier 2).
 *
 * <p>This module is the single definition of *what* gets compared across JS engines. It is
 * deliberately not a test: it is imported by
 *
 *  - `engine/test/determinism/corpus.digest.test.ts` — the Node reference, run by
 *    `npm test` on every push, and
 *  - `engine/test-browser/cross-engine.digest.test.ts` — the same corpus executed inside
 *    real Chromium / Firefox / WebKit by `npm run test:browser`.
 *
 * Both compare against {@link EXPECTED_SECTION_DIGESTS}, so the browser job is not merely
 * "browsers agree with each other" — every engine is pinned to one committed constant.
 *
 * ## Design rules
 *
 * 1. **Tokens are raw IEEE-754 hex, never decimal text.** `doubleToHex` round-trips the
 *    exact bit pattern; a decimal rendering would silently absorb a last-ulp difference,
 *    which is precisely the failure this corpus exists to catch.
 * 2. **Sections are digested separately as well as jointly.** A single whole-corpus hash
 *    tells you "something moved"; per-section digests tell you *which plane* moved, which
 *    is the difference between a five-minute and a five-hour diagnosis.
 * 3. **No I/O, no clock, no `Math.random`, no DOM.** The corpus must be constructible in a
 *    worker, in a page, and in Node from the same source text. That rules out the packed
 *    graph asset (a 3 MB file under git-ignored `pipeline/out/`), so the routing section
 *    builds its own synthetic graph with RNG-derived weights instead.
 * 4. **The host-math section is measured, not asserted.** See {@link HOST_MATH_SECTION}.
 */

import {
  doubleToHex,
  fdlibmAtan,
  fdlibmAtan2,
  fdlibmCos,
  fdlibmExp,
  fdlibmLog,
  fdlibmPow,
  fdlibmSin,
  fdlibmSqrt,
  floatToHex,
  hexToDouble,
  intToHex,
  javaFormatFixed,
  longToHex,
} from "../../src/mathx/index.js";
import { ColtMT19937 } from "../../src/rng/ColtMT19937.js";
import { JavaRandom } from "../../src/rng/JavaRandom.js";
import {
  agentDecisionSeed,
  eLayerSamplerSeed,
  populationSamplerSeed,
  shuffleMt,
  StreamRegistry,
} from "../../src/rng/streams.js";
import { ELayerSampler } from "../../src/agents/eLayerSampler.js";
import { PopulationSampler } from "../../src/agents/populationSampler.js";
import { buildRoutingGraph } from "../../src/graph/csr.js";
import { computeTree, makeScratch } from "../../src/graph/dijkstra.js";
import { WGS84, DIRECT_MASK_JAVA_STANDARD, INVERSE_MASK_JAVA_STANDARD } from "../../src/geo/geodesic.js";

import type { GraphTopology } from "@websim/shared/graph-asset";

/** One digestible slice of the corpus. */
export interface CorpusSection {
  readonly name: string;
  /** Canonical, order-significant token stream. */
  readonly tokens: readonly string[];
}

/**
 * The section whose tokens are **recorded, not gated**.
 *
 * `Math.log/exp/pow/sin/cos/atan2` are "implementation-approximated" in ECMA-262, so their
 * last ulp is a property of the browser build. Asserting them equal across engines would
 * be asserting something the standard does not promise — the whole reason `mathx` exists.
 * Instead the browser job *reports* this section's digest per engine. Two outcomes, both
 * useful: the digests differ, which is direct evidence that shipping host transcendentals
 * would have broken cross-browser identity; or they agree, and the fdlibm module remains a
 * cheap insurance policy against the next engine version. Either way it is measured rather
 * than assumed, which is what §4.2 of DR-S5 asked for and could not deliver on Node alone.
 */
export const HOST_MATH_SECTION = "host-math.sentinel";

/**
 * The geodesic plane — **byte-gated across engines since WP7 task C1**.
 *
 * <p>It was not always. `geographiclib-geodesic@2.2.0` calls
 * `Math.atan2/sin/cos/pow/log1p/cbrt/atanh` directly, and DR-WP3 §5 measured the
 * consequence: Chromium 141, Firefox 142 and WebKit 26 each produced a different digest for
 * this section, differing on 142 / 126 / 249 of its 1,200 doubles. The section was therefore
 * excluded from {@link gatedSections} and only magnitude-bounded in the browser.
 *
 * <p>Task C1 vendored the package into `engine/src/geo/vendor/` with exactly those call
 * sites rewritten onto the `mathx` fdlibm kernels, so the plane now depends only on IEEE-754
 * double arithmetic. It is gated like every other engine-owned section. The magnitude
 * comparison against the Node reference is *kept* in the browser suite — now asserting zero
 * differing doubles — because "identical" and "identical to within X" are different claims
 * and the second one is the diagnostic when the first fails.
 */
export const GEODESIC_SECTION = "geo.geodesic";

/** Token layout of {@link GEODESIC_SECTION}: five doubles per sample, in this order. */
export const GEODESIC_FIELDS = Object.freeze(["lat2", "lon2", "s12", "azi1", "azi2"] as const);

/**
 * Name used when digesting {@link geodesicDirectTokens} on its own. Not a corpus section —
 * it is a *slice* of one, hashed separately so the `Direct` path (plan Q12's named target,
 * and the call every agent makes every tick) can fail on its own name.
 */
export const GEODESIC_DIRECT_SUBSECTION = "geo.geodesic.direct";

/** Metres per degree of latitude on WGS84, for reporting angular deltas in metres. */
export const METRES_PER_DEGREE = 111319.49079327358;

// --------------------------------------------------------------------- inputs

/**
 * The shared transcendental input grid. Chosen for the awkward cases: values straddling
 * fdlibm's internal branch cuts, the subnormal floor, arguments where argument reduction
 * dominates, and exact powers of two where a sloppy kernel looks perfect.
 */
const MATH_GRID: readonly number[] = Object.freeze([
  1, 2, 0.5, 1.5, 1e-8, 1e-300, 5e-324, 1 - 2 ** -53, 1 + 2 ** -52,
  0.9999999999999999, 1.0000000000000002, 3.141592653589793, 6.283185307179586,
  1.5707963267948966, 0.7853981633974483, 2.718281828459045, 1e15, 1e16, 12345.6789,
  0.1, 0.2, 0.3, 0.615, 1e-17, 123456789.123456789, 1e100, 1e-100, 2 ** 52, 2 ** -52,
  1023.9999999999999, 0.30000000000000004,
]);

/** Signed companions — sin/cos/atan/exp all take negatives; log and sqrt do not. */
const SIGNED_GRID: readonly number[] = Object.freeze([
  ...MATH_GRID,
  ...MATH_GRID.map((v) => -v),
  0,
  -0,
]);

// ------------------------------------------------------------ section builders

function javaRandomSection(): CorpusSection {
  const tokens: string[] = [];
  const seeds: readonly bigint[] = [
    0n,
    42n,
    -1n,
    2147483647n,
    populationSamplerSeed(42n),
    eLayerSamplerSeed(42n),
    agentDecisionSeed(42n, 6841),
  ];
  for (const seed of seeds) {
    tokens.push(`seed=${seed.toString()}`);

    const d = new JavaRandom(seed);
    for (let i = 0; i < 256; i++) {
      tokens.push(doubleToHex(d.nextDouble()));
    }
    const g = new JavaRandom(seed);
    for (let i = 0; i < 256; i++) {
      tokens.push(doubleToHex(g.nextGaussian()));
    }
    const l = new JavaRandom(seed);
    for (let i = 0; i < 128; i++) {
      tokens.push(longToHex(l.nextLong()));
    }
    const f = new JavaRandom(seed);
    for (let i = 0; i < 128; i++) {
      tokens.push(floatToHex(f.nextFloat()));
    }
    const b = new JavaRandom(seed);
    for (let i = 0; i < 128; i++) {
      tokens.push(b.nextBoolean() ? "1" : "0");
    }
    for (const bound of [2, 3, 45, 46, 6842, 1073741824, 2147483647]) {
      const r = new JavaRandom(seed);
      for (let i = 0; i < 64; i++) {
        tokens.push(intToHex(r.nextInt(bound)));
      }
    }

    // The interleave: only a mixed stream can catch a port that drops the cached
    // Gaussian partner when a draw of another kind lands between the pair (DR-S5 §4.4).
    const m = new JavaRandom(seed);
    for (let i = 0; i < 128; i++) {
      tokens.push(doubleToHex(m.nextGaussian()));
      tokens.push(doubleToHex(m.nextDouble()));
      tokens.push(intToHex(m.nextInt(45)));
      tokens.push(longToHex(m.nextLong()));
      tokens.push(m.nextBoolean() ? "1" : "0");
    }
  }
  return { name: "rng.java-random", tokens };
}

function coltSection(): CorpusSection {
  const tokens: string[] = [];
  const seeds: readonly number[] = [0, 42, -1, 2147483647, 4357];
  const ranges: readonly (readonly [number, number])[] = [
    [0, 45],
    [1, 6],
    [-5, 5],
    [-100, -1],
    [0, 0],
    [10, 3],
    [-2147483648, 2147483647],
  ];
  for (const seed of seeds) {
    tokens.push(`seed=${seed}`);

    const a = new ColtMT19937(seed);
    for (let i = 0; i < 256; i++) {
      tokens.push(intToHex(a.nextInt()));
    }
    const r = new ColtMT19937(seed);
    for (let i = 0; i < 256; i++) {
      tokens.push(doubleToHex(r.raw()));
    }
    const d = new ColtMT19937(seed);
    for (let i = 0; i < 256; i++) {
      tokens.push(doubleToHex(d.nextDouble()));
    }
    const l = new ColtMT19937(seed);
    for (let i = 0; i < 128; i++) {
      tokens.push(longToHex(l.nextLong()));
    }
    const f = new ColtMT19937(seed);
    for (let i = 0; i < 128; i++) {
      tokens.push(floatToHex(f.nextFloat()));
    }
    for (const [from, to] of ranges) {
      const u = new ColtMT19937(seed);
      for (let i = 0; i < 64; i++) {
        tokens.push(intToHex(u.nextIntFromTo(from, to)));
      }
    }
    // Crosses at least one 624-word block boundary, so a mis-indexed reload shows up.
    const blk = new ColtMT19937(seed);
    for (let i = 0; i < 1400; i++) {
      blk.nextInt();
    }
    for (let i = 0; i < 64; i++) {
      tokens.push(intToHex(blk.nextInt()));
    }
  }
  return { name: "rng.colt-mt19937", tokens };
}

function mathxSection(): CorpusSection {
  const tokens: string[] = [];
  for (const x of MATH_GRID) {
    tokens.push(doubleToHex(fdlibmLog(x)));
    tokens.push(doubleToHex(fdlibmSqrt(x)));
  }
  for (const x of SIGNED_GRID) {
    tokens.push(doubleToHex(fdlibmExp(x)));
    tokens.push(doubleToHex(fdlibmSin(x)));
    tokens.push(doubleToHex(fdlibmCos(x)));
    tokens.push(doubleToHex(fdlibmAtan(x)));
  }
  for (const y of MATH_GRID) {
    for (const x of MATH_GRID) {
      tokens.push(doubleToHex(fdlibmAtan2(y, x)));
      tokens.push(doubleToHex(fdlibmAtan2(-y, x)));
      tokens.push(doubleToHex(fdlibmPow(x, y)));
    }
  }
  // The two production call sites, verbatim: GisAgent.java:413 logistic and :717 capacity
  // prior; GisAgent.java:378 exposure decay.
  for (const u of SIGNED_GRID) {
    tokens.push(doubleToHex(1.0 / (1.0 + fdlibmExp(-u))));
  }
  for (const cap of [0, 1, 2, 12, 45, 120, 2234, 6842]) {
    tokens.push(doubleToHex(0.35 * fdlibmLog(Math.max(1.0, cap))));
  }
  for (const halfLife of [0.5, 1, 2, 6, 24]) {
    tokens.push(doubleToHex(fdlibmPow(2.0, -1.0 / halfLife)));
  }
  return { name: "mathx.fdlibm", tokens };
}

function hostMathSection(): CorpusSection {
  const tokens: string[] = [];
  const M = Math;
  for (const x of MATH_GRID) {
    tokens.push(doubleToHex(M.log(x)));
  }
  for (const x of SIGNED_GRID) {
    tokens.push(doubleToHex(M.exp(x)));
    tokens.push(doubleToHex(M.sin(x)));
    tokens.push(doubleToHex(M.cos(x)));
    tokens.push(doubleToHex(M.atan(x)));
  }
  for (const y of MATH_GRID) {
    for (const x of MATH_GRID) {
      tokens.push(doubleToHex(M.atan2(y, x)));
      tokens.push(doubleToHex(M.pow(x, y)));
    }
  }
  return { name: HOST_MATH_SECTION, tokens };
}

function formatSection(): CorpusSection {
  const tokens: string[] = [];
  const values = [
    // Stays under 2^53: `javaFormatFixed` refuses larger values by design (format.ts:94,
    // JDK-4511638), and a corpus that provoked the guard would be testing the guard.
    0, -0, 0.615, 0.625, 1.005, 2.675, -0.615, 1234567.891, 0.5, 1.5, 2.5, -2.5, 99.995,
    1 / 3, 2 / 3, 54002.8, 1.2805, 0.1988, 9007199254740991, -9007199254740991,
  ];
  for (const v of values) {
    for (const p of [0, 1, 2, 3, 4, 6]) {
      tokens.push(javaFormatFixed(v, p));
    }
  }
  return { name: "mathx.format", tokens };
}

/** 512 residents through the whole build-time draw order, both layers on. */
function worldScenarioSection(): CorpusSection {
  const tokens: string[] = [];
  const N = 512;
  const N_CAMPS = 39;

  const registry = new StreamRegistry({
    runSeed: 42n,
    enableHeterogeneity: true,
    enableDecisionLayer: true,
  });

  // (a) the ONLY build-time default-stream draw: one camp per resident.
  const camp = new Int32Array(N);
  for (let i = 0; i < N; i++) {
    camp[i] = registry.defaultStream.nextIntFromTo(0, N_CAMPS - 1);
    tokens.push(intToHex(camp[i]!));
  }

  // (b) placement pass — PopulationSampler, one sample() per resident.
  const pop = new PopulationSampler(registry.populationSampler!);
  for (let i = 0; i < N; i++) {
    const a = pop.sample();
    tokens.push(
      `${a.ageYears}|${a.ageBand}|${a.sex}|${a.mobilityLimited ? 1 : 0}|${a.mobilityCategory}|` +
        `${a.asthma ? 1 : 0}|${a.copd ? 1 : 0}|${a.chronicPhysical ? 1 : 0}|` +
        doubleToHex(a.walkingSpeedMps),
    );
  }
  const pm = pop.marginals();
  tokens.push(
    `marginals|${pm.sampled}|` +
      [
        pm.mobilityLimitedShare,
        pm.asthmaShare,
        pm.copdShare,
        pm.anyRespiratoryShare,
        pm.chronicPhysicalShare,
        pm.age55PlusShare,
        pm.meanWalkingSpeedMps,
      ]
        .map(doubleToHex)
        .join("|"),
  );

  // (c) second pass — ELayerSampler, five unconditional draws per resident.
  const el = new ELayerSampler(registry.eLayerSampler!, {
    runSeed: 42n,
    pAware: 0.356,
    pHeavy: 0.284,
    pPet: 0.117,
    pDependents: 0.0044,
    groupSpeedDeltaMps: 0.06,
  });
  for (let i = 0; i < N; i++) {
    const d = el.sample();
    tokens.push(
      `${d.awareInitial ? 1 : 0}|${d.heavyBelongings ? 1 : 0}|${d.hasPet ? 1 : 0}|` +
        `${d.hasDependents ? 1 : 0}|${doubleToHex(d.thetaZ)}|` +
        `${doubleToHex(d.groupSpeedDeltaMps)}|${longToHex(d.decisionSeed)}`,
    );
  }
  const em = el.marginals();
  tokens.push(
    `e-marginals|${em.sampled}|` +
      [
        em.awareShare,
        em.heavyBelongingsShare,
        em.petShare,
        em.dependentsShare,
        em.anyBarrierShare,
        em.compoundBarrierShare,
      ]
        .map(doubleToHex)
        .join("|"),
  );

  // (d) per-agent decision streams — invariant to the tick shuffle by construction, so a
  //     port that accidentally shares one stream shows up here and nowhere else.
  for (let i = 0; i < N; i++) {
    const s = registry.agentStream(i);
    tokens.push(doubleToHex(s.nextDouble()));
    tokens.push(doubleToHex(s.nextGaussian()));
    tokens.push(s.nextBoolean() ? "1" : "0");
  }

  // (e) the within-tick order itself, over eight consecutive ticks.
  const order = Int32Array.from({ length: N }, (_, i) => i);
  for (let tick = 0; tick < 8; tick++) {
    shuffleMt(order, registry.defaultStream);
    tokens.push(order.join(","));
  }

  // (f) the full stream state afterwards — catches a divergence that has not yet reached
  //     an output value.
  const state = registry.getState();
  tokens.push(state.runSeed);
  tokens.push(state.defaultStream.mt.join(","));
  tokens.push(String(state.defaultStream.mti));
  for (const s of [state.populationSampler, state.eLayerSampler]) {
    tokens.push(
      s === null
        ? "null"
        : `${s.hi}|${s.lo}|${s.haveNextNextGaussian ? 1 : 0}|${doubleToHex(s.nextNextGaussian)}`,
    );
  }

  return { name: "scenario.world", tokens };
}

/**
 * A synthetic street graph with RNG-derived weights, then real SSSP over it.
 *
 * The certified 109,434-edge asset lives under git-ignored `pipeline/out/`, so it cannot be
 * the cross-engine corpus without making the browser job depend on a local build. The
 * substitute exercises the same code path — the same CSR walker, the same inlined
 * `java.util.PriorityQueue` sift, the same strict-`<` tie policy — on weights that are
 * themselves bit-reproducible from a Java-cloned generator.
 */
function routingScenarioSection(): CorpusSection {
  const tokens: string[] = [];
  const NODES = 400;
  const rng = new JavaRandom(20260731n);

  const edges: { from: number; to: number; len: number }[] = [];
  // A ring guarantees connectivity; the chords make the tie structure non-trivial.
  for (let n = 0; n < NODES; n++) {
    edges.push({ from: n, to: (n + 1) % NODES, len: 10 + rng.nextDouble() * 990 });
  }
  for (let k = 0; k < 800; k++) {
    const a = rng.nextInt(NODES);
    const b = rng.nextInt(NODES);
    if (a !== b) {
      edges.push({ from: a, to: b, len: 10 + rng.nextDouble() * 990 });
    }
  }
  // Exact ties: duplicated weights on parallel routes make predecessor choice depend on
  // pop order rather than on arithmetic, which is the fragile half of Dijkstra parity.
  for (let k = 0; k < 60; k++) {
    edges.push({ from: k, to: (k + 200) % NODES, len: 500 });
    edges.push({ from: k, to: (k + 201) % NODES, len: 500 });
  }

  const graph = buildRoutingGraph(topologyFrom(NODES, edges));
  const scratch = makeScratch(graph);
  for (const source of [0, 7, 199, 399]) {
    const tree = computeTree(graph, source, scratch);
    for (let n = 0; n < NODES; n++) {
      tokens.push(doubleToHex(tree.dist[n]!));
      tokens.push(intToHex(tree.predEdge[n]!));
    }
    tokens.push(
      `stats|${tree.stats.pushes}|${tree.stats.pops}|${tree.stats.stalePops}|` +
        `${tree.stats.relaxations}|${tree.stats.settled}|${tree.reachableCount}`,
    );
  }
  return { name: "scenario.routing", tokens };
}

function topologyFrom(
  nodeCount: number,
  edges: readonly { from: number; to: number; len: number }[],
): GraphTopology {
  const rows: number[][] = Array.from({ length: nodeCount }, () => []);
  edges.forEach((e, i) => {
    rows[e.from]!.push(i + 1);
    rows[e.to]!.push(-(i + 1));
  });
  const csrOffset = new Int32Array(nodeCount + 1);
  for (let n = 0; n < nodeCount; n++) {
    csrOffset[n + 1] = csrOffset[n]! + rows[n]!.length;
  }
  const csrEntry = new Int32Array(csrOffset[nodeCount]!);
  for (let n = 0; n < nodeCount; n++) {
    csrEntry.set(rows[n]!, csrOffset[n]!);
  }
  return {
    nodeCount,
    edgeCount: edges.length,
    nodeId: Int32Array.from({ length: nodeCount }, (_, i) => i * 10),
    nodeLon: new Float64Array(nodeCount),
    nodeLat: new Float64Array(nodeCount),
    edgeFrom: Int32Array.from(edges.map((e) => e.from)),
    edgeTo: Int32Array.from(edges.map((e) => e.to)),
    edgeLengthM: Float64Array.from(edges.map((e) => e.len)),
    csrOffset,
    csrEntry,
    census: {} as GraphTopology["census"],
    corrections: [],
  };
}

/**
 * The vendored `geographiclib-geodesic`, over three deliberately different input regimes.
 *
 * <p>Block A (Canberra scale) is unchanged from the WP3 corpus, RNG draw for RNG draw, so
 * the first 1,200 tokens of this section are the same values DR-WP3 §5 measured the
 * three-engine divergence on. That continuity is the point: the same tokens that used to
 * differ across engines are the ones now asserted equal.
 *
 * <p>Blocks B and C were added by WP7 task C1, because block A alone does not reach the
 * code the vendoring had to fix:
 *
 * <ul>
 *   <li><b>B — Portland bbox, production shape.</b> The azimuth is the `azi1` *output of an
 *       Inverse solve* to a nearby point and the distance is a sub-100 m residual, which is
 *       exactly how `GisAgent.java:536-537` obtains its `Direct` arguments (DR-S1 §1.2). A
 *       gate on synthetic azimuths would not cover the movement path the port actually
 *       runs.</li>
 *   <li><b>C — near-antipodal Inverse.</b> `Inverse` only enters `astroid()` — the sole
 *       `cbrt` call site in the whole library — when the two points are nearly antipodal and
 *       Newton needs a starting estimate. Without this block the `cbrt` kernel would be dead
 *       code under the cross-engine gate and the claim "the geodesic plane is byte-identical
 *       across engines" would be true only of the paths that happen to be sampled. A test
 *       asserts the block really does drive the astroid branch.</li>
 * </ul>
 */
function geodesicSection(): CorpusSection {
  const tokens: string[] = [];
  const rng = new JavaRandom(4357n);

  // --- Block A: Canberra scale. Byte-identical draw sequence to the WP3 corpus. ---
  for (let i = 0; i < 240; i++) {
    const lat1 = -35.5 + rng.nextDouble() * 1.0;
    const lon1 = 148.9 + rng.nextDouble() * 1.0;
    const azi = -180 + rng.nextDouble() * 360;
    const s12 = rng.nextDouble() * 5000;
    const d = WGS84.Direct(lat1, lon1, azi, s12, DIRECT_MASK_JAVA_STANDARD);
    tokens.push(doubleToHex(d.lat2));
    tokens.push(doubleToHex(d.lon2));

    const lat2 = -35.5 + rng.nextDouble() * 1.0;
    const lon2 = 148.9 + rng.nextDouble() * 1.0;
    const inv = WGS84.Inverse(lat1, lon1, lat2, lon2, INVERSE_MASK_JAVA_STANDARD);
    tokens.push(doubleToHex(inv.s12));
    tokens.push(doubleToHex(inv.azi1));
    tokens.push(doubleToHex(inv.azi2));
  }

  // --- Block B: Portland bbox, GisAgent.java:536-537 shape. ---
  for (let i = 0; i < 240; i++) {
    const lat1 = 45.2 + rng.nextDouble() * 0.6;
    const lon1 = -123.0 + rng.nextDouble() * 0.7;
    // A neighbour 5-400 m away, then walk toward it: azi1 is an Inverse output, never
    // an arbitrary angle, and s12 is a within-edge residual.
    const bearing = -180 + rng.nextDouble() * 360;
    const near = WGS84.Direct(
      lat1,
      lon1,
      bearing,
      5 + rng.nextDouble() * 395,
      DIRECT_MASK_JAVA_STANDARD,
    );
    const leg = WGS84.Inverse(lat1, lon1, near.lat2, near.lon2, INVERSE_MASK_JAVA_STANDARD);
    const step = WGS84.Direct(
      lat1,
      lon1,
      leg.azi1,
      rng.nextDouble() * 100,
      DIRECT_MASK_JAVA_STANDARD,
    );
    tokens.push(doubleToHex(step.lat2));
    tokens.push(doubleToHex(step.lon2));
    tokens.push(doubleToHex(leg.s12));
    tokens.push(doubleToHex(leg.azi1));
    tokens.push(doubleToHex(leg.azi2));
  }

  // --- Block C: near-antipodal, which is what drives astroid() -> cbrt. ---
  for (let i = 0; i < 240; i++) {
    const lat1 = -80 + rng.nextDouble() * 160;
    const lon1 = -180 + rng.nextDouble() * 360;
    // Reflect through the centre, then perturb by up to ~0.5 deg in each coordinate.
    const lat2 = -lat1 + (rng.nextDouble() - 0.5);
    const lon2 = lon1 + 180 + (rng.nextDouble() - 0.5);
    const inv = WGS84.Inverse(lat1, lon1, lat2, lon2, INVERSE_MASK_JAVA_STANDARD);
    // Half-way back along the solved azimuth: a ~10,000 km Direct, which the short-line
    // blocks above never exercise. Emitted in the canonical field order below.
    const half = WGS84.Direct(lat1, lon1, inv.azi1, inv.s12 / 2, DIRECT_MASK_JAVA_STANDARD);
    tokens.push(doubleToHex(half.lat2));
    tokens.push(doubleToHex(half.lon2));
    tokens.push(doubleToHex(inv.s12));
    tokens.push(doubleToHex(inv.azi1));
    tokens.push(doubleToHex(inv.azi2));
  }

  return { name: GEODESIC_SECTION, tokens };
}

/**
 * The `Direct`-only slice of {@link GEODESIC_SECTION}: the `lat2`/`lon2` pair of every
 * sample, in corpus order — offsets 0 and 1 of the {@link GEODESIC_FIELDS} stride.
 *
 * <p>Digested separately so a failure can say "the `Direct` path moved" rather than "the
 * geodesic plane moved". `Direct` is the call that runs per agent per tick (DR-S3 §5) and
 * the one plan Q12 names; `Inverse` is a build-time precompute (`cumLen.ts`).
 */
export function geodesicDirectTokens(section: CorpusSection): readonly string[] {
  const stride = GEODESIC_FIELDS.length;
  if (section.tokens.length % stride !== 0) {
    throw new Error(`geodesic token count ${section.tokens.length} is not a multiple of ${stride}`);
  }
  const out: string[] = [];
  for (let base = 0; base < section.tokens.length; base += stride) {
    out.push(section.tokens[base]!, section.tokens[base + 1]!);
  }
  return out;
}

// -------------------------------------------------------------------- corpus

/** Builds every section, in the fixed order the joint digest depends on. */
export function buildCorpus(): readonly CorpusSection[] {
  return [
    javaRandomSection(),
    coltSection(),
    mathxSection(),
    formatSection(),
    worldScenarioSection(),
    routingScenarioSection(),
    geodesicSection(),
    hostMathSection(),
  ];
}

/**
 * Sections every JS engine must reproduce **bit for bit** — everything the port itself owns.
 *
 * <p>`host-math.sentinel` is the only exclusion, and it is excluded on principle rather than
 * on convenience: ECMA-262 leaves `Math.log/exp/pow/sin/cos/atan2` implementation-
 * approximated, so asserting them equal across engines would assert a non-guarantee. It is
 * measured and recorded instead (DR-WP3 §4).
 *
 * <p>`geo.geodesic` used to be excluded too. WP7 task C1 moved it in — see
 * {@link GEODESIC_SECTION}.
 */
export function gatedSections(corpus: readonly CorpusSection[]): readonly CorpusSection[] {
  return corpus.filter((s) => s.name !== HOST_MATH_SECTION);
}

/**
 * Largest absolute divergence between two runs of {@link GEODESIC_SECTION}, split by field
 * so a positional error is never masked by an azimuth one.
 */
export interface GeodesicDivergence {
  readonly samples: number;
  /** Worst |Δ| of `lat2`/`lon2`, expressed in metres along the meridian. */
  readonly maxPositionM: number;
  /** Worst |Δ| of the `s12` length, in metres. */
  readonly maxLengthM: number;
  /** Worst |Δ| of `azi1`/`azi2`, in degrees. */
  readonly maxAzimuthDeg: number;
  /** Count of the 5N doubles whose bits differ at all. */
  readonly differingDoubles: number;
}

export function compareGeodesic(
  reference: readonly string[],
  observed: readonly string[],
): GeodesicDivergence {
  if (reference.length !== observed.length) {
    throw new Error(
      `geodesic token counts differ: reference ${reference.length}, observed ${observed.length}`,
    );
  }
  const stride = GEODESIC_FIELDS.length;
  if (reference.length % stride !== 0) {
    throw new Error(`geodesic token count ${reference.length} is not a multiple of ${stride}`);
  }
  let maxPositionM = 0;
  let maxLengthM = 0;
  let maxAzimuthDeg = 0;
  let differingDoubles = 0;
  for (let i = 0; i < reference.length; i++) {
    const a = reference[i]!;
    const b = observed[i]!;
    if (a === b) {
      continue;
    }
    differingDoubles++;
    const delta = Math.abs(hexToDouble(a) - hexToDouble(b));
    switch (GEODESIC_FIELDS[i % stride]!) {
      case "lat2":
      case "lon2":
        maxPositionM = Math.max(maxPositionM, delta * METRES_PER_DEGREE);
        break;
      case "s12":
        maxLengthM = Math.max(maxLengthM, delta);
        break;
      default:
        maxAzimuthDeg = Math.max(maxAzimuthDeg, delta);
        break;
    }
  }
  return {
    samples: reference.length / stride,
    maxPositionM,
    maxLengthM,
    maxAzimuthDeg,
    differingDoubles,
  };
}

/** The canonical byte stream of one section — this, and only this, is what is hashed. */
export function sectionText(section: CorpusSection): string {
  return `${section.name}\n${section.tokens.join("\n")}\n`;
}

const utf8 = new TextEncoder();

/** SHA-256 through WebCrypto, which Node ≥ 18 and every target browser expose alike. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", utf8.encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface CorpusDigest {
  readonly sections: Readonly<Record<string, string>>;
  readonly tokenCounts: Readonly<Record<string, number>>;
  /** SHA-256 over every *gated* section digest, in corpus order. */
  readonly joint: string;
}

export async function digestCorpus(corpus: readonly CorpusSection[]): Promise<CorpusDigest> {
  const sections: Record<string, string> = {};
  const tokenCounts: Record<string, number> = {};
  for (const section of corpus) {
    sections[section.name] = await sha256Hex(sectionText(section));
    tokenCounts[section.name] = section.tokens.length;
  }
  const joint = await sha256Hex(
    gatedSections(corpus)
      .map((s) => `${s.name}=${sections[s.name]!}`)
      .join("\n") + "\n",
  );
  return { sections, tokenCounts, joint };
}
