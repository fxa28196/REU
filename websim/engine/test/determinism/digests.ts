/**
 * The committed cross-engine determinism digests.
 *
 * <p>GENERATED — regenerate with `npx tsx engine/test/determinism/emit-digests.ts --write`,
 * but read that file's header first. These constants are a *tripwire*, not a snapshot: they
 * are asserted by the Node suite on every push and by the Chromium / Firefox / WebKit suite
 * in `npm run test:browser`. A value that changes without a deliberate corpus edit means an
 * engine plane moved under the port.
 *
 * <p>One section is deliberately absent from {@link EXPECTED_SECTION_DIGESTS}:
 * `host-math.sentinel`. ECMA-262 does not promise `Math.log/exp/pow/sin/cos/atan2` across
 * engines, so asserting it would assert a non-guarantee. It is measured per engine and
 * recorded in `docs/DR-WP3-cross-engine.md` §4.
 *
 * <p>`geo.geodesic` was the second absentee until WP7 task C1. DR-WP3 §5 measured
 * `geographiclib-geodesic@2.2.0` producing a different digest on each of four engines
 * because it calls the host transcendentals directly; the section could then only be
 * magnitude-bounded. The solver is now vendored onto `mathx` (`engine/src/geo/vendor/`,
 * `tools/vendor-geodesic.ts`) and the section is byte-gated like every other engine-owned
 * plane. See `docs/DR-C1-geodesic-fdlibm.md`.
 *
 * Reference engine: Node 24.18.0 / V8, 2026-07-31.
 */

export const EXPECTED_SECTION_DIGESTS = Object.freeze({
  "rng.java-random": "012db1ef3052ce7179c4cad141bb2d15949b6676d5d14e9dce3437dcc32a2df8",
  "rng.colt-mt19937": "256900e27d2dc009e9adaaa782355aa90612bec99259dcd8ee699ac066ede4ec",
  "mathx.fdlibm": "c6bba1c7c0673d727aae756ea6af37d1d553798200fb7f9cebf5112c4933317c",
  "mathx.format": "9a8002f8554e4293a885fba1168d646361a84bddb7f5eaf4e484aa69401be7e7",
  "scenario.world": "cd67ff78e007a06caec8bf7b6d4976313b0e863e9e70732026c7b3d50dcbcef8",
  "scenario.routing": "140e1d5d8f4ff44e098c5b14fe3213b698a7b1a757a1c5379474e4221296f069",
  "geo.geodesic": "dd8e167e79034631aeb4bf60a7e76f70aaf03d54e8b29a23a11dd1410270a0fb",
});

/** SHA-256 over every gated section digest, in corpus order. */
export const EXPECTED_JOINT_DIGEST =
  "56300eb318085c8d3ec8d239def09271b183523322f34c4515cca529042a98a1";

/**
 * The `geo.geodesic` digest again, under its own name.
 *
 * <p>Before task C1 this was a *Node-only* pin, because the section was not cross-engine
 * gated. It now equals `EXPECTED_SECTION_DIGESTS["geo.geodesic"]` by construction, and a
 * test asserts that equality — the name is kept so the browser suite's divergence report
 * still reads as "this engine versus the Node reference", which is what it measures.
 */
export const NODE_GEODESIC_DIGEST =
  "dd8e167e79034631aeb4bf60a7e76f70aaf03d54e8b29a23a11dd1410270a0fb";

/**
 * SHA-256 over the `Direct`-only slice of the geodesic section (`lat2`/`lon2` of all 720
 * samples). Plan Q12 names `Geodesic.Direct` specifically — it is the call every agent makes
 * every tick (DR-S3 §5) — so it gets a digest that can fail under its own name rather than
 * inside the combined Direct+Inverse section hash.
 */
export const EXPECTED_GEODESIC_DIRECT_DIGEST =
  "16586bf2e7a73c458da8854457250398ed4aa7df7587bbb2432f08729c0f92c1";

/**
 * The digest of the geodesic section's **first 1,200 tokens** — block A, whose inputs and
 * RNG draw order are unchanged from the WP3 corpus.
 *
 * <p>This constant is the continuity proof for task C1: it is the value DR-WP3 §5 published
 * as `NODE_GEODESIC_DIGEST` before the vendoring landed. Its survival means the vendored,
 * fdlibm-routed solver reproduces on Node, bit for bit, the exact 1,200 doubles on which
 * Chromium / Firefox / WebKit were measured to disagree. Had the vendoring changed any value
 * on the reference engine, this would have moved — so the fix is provably a *cross-engine*
 * change and not a silent re-baselining of the reference engine.
 */
export const WP3_GEODESIC_BLOCK_A_DIGEST =
  "1b45bd1748a71503f68936aed2051ac85273c8de75358342b9d8a2cc82799ab4";

/**
 * Divergence budget for `geo.geodesic` across JS engines, taken from plan Q12 verbatim:
 * "expected agreement ≲ 1e-9 m … Contingency if > 1e-6 m: port Java's `Geodesic.Direct`
 * verbatim (~600 lines of pure double math)".
 *
 * <p>Retained after task C1 made the section byte-gated. The gate is now
 * `differingDoubles === 0`; these bounds run alongside it so a future regression is reported
 * as a *magnitude* as well as a digest mismatch, and so the Q12 contingency threshold stays
 * wired to a live assertion instead of becoming prose.
 */
export const GEODESIC_MAX_POSITION_M = 1e-6;
export const GEODESIC_MAX_LENGTH_M = 1e-6;
/** 1e-6 m of arc, expressed in degrees — the same budget applied to the azimuth fields. */
export const GEODESIC_MAX_AZIMUTH_DEG = 1e-6 / 111319.49079327358;

/**
 * Token counts guard against the corpus silently shrinking — a digest over an empty
 * section is a perfectly stable digest.
 */
export const EXPECTED_TOKEN_COUNTS = Object.freeze({
  "rng.java-random": 13895,
  "rng.colt-mt19937": 7685,
  "mathx.fdlibm": 3278,
  "mathx.format": 120,
  "scenario.world": 3087,
  "scenario.routing": 3204,
  "geo.geodesic": 3600,
  "host-math.sentinel": 2209,
});
