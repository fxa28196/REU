/**
 * Tier-2 cross-engine byte-identity, executed in real Chromium, Firefox and WebKit.
 *
 * <p>Plan §3.3 makes "same config run twice, on Chrome/Firefox/WebKit/Node → byte-identical
 * outputs" a CI gate, and §5.3 schedules a three-browser job. Until this file existed the
 * port had **no** cross-browser evidence of any kind: DR-S5 §8.1 said so explicitly ("every
 * measurement here ran on Node 24"), and DR-S1 §5.4's target — JS ≡ JS across engines — was
 * an argument, not a measurement.
 *
 * <p>The corpus is shared verbatim with the Node suite
 * (`engine/test/determinism/corpus.digest.test.ts`), and both assert the same committed
 * constants. Browsers are therefore never compared to each other: each is compared to the
 * same pinned digest, so an agreement between two wrong engines cannot pass.
 *
 * <p>The suite deliberately asserts nothing about `host-math.sentinel`; it prints that
 * section's digest per engine so the difference (or agreement) between V8, SpiderMonkey and
 * JavaScriptCore on `Math.log/exp/pow/sin/cos/atan2` is a recorded measurement. That section
 * is also this file's **positive control**: the three engines produce three different
 * sentinel digests, which is what proves a gate on any other section could fail. A suite in
 * which everything agrees and nothing *can* disagree is not evidence.
 *
 * <p><b>WP7 task C1 — divergence 11.</b> `geo.geodesic` used to be the one gated plane this
 * file could only *bound*: `geographiclib-geodesic@2.2.0` calls the host transcendentals, and
 * DR-WP3 §5 measured 142 / 126 / 249 of block A's 1,200 doubles differing on Chromium 141 /
 * Firefox 142 / WebKit 26. The solver is now vendored onto the `mathx` fdlibm kernels
 * (`engine/src/geo/vendor/`), so this file asserts byte identity three ways — the section
 * digest, the `Direct`-only sub-digest that plan Q12 names, and the pre-vendoring block-A
 * constant on the original inputs — and the magnitude bounds stay behind them as diagnostics.
 * See `docs/DR-C1-geodesic-fdlibm.md`.
 */

import { beforeAll, describe, expect, it } from "vitest";

import {
  buildCorpus,
  compareGeodesic,
  digestCorpus,
  gatedSections,
  geodesicDirectTokens,
  sha256Hex,
  sectionText,
  GEODESIC_DIRECT_SUBSECTION,
  GEODESIC_SECTION,
  HOST_MATH_SECTION,
  type CorpusDigest,
  type CorpusSection,
} from "../test/determinism/corpus.js";
import {
  EXPECTED_GEODESIC_DIRECT_DIGEST,
  EXPECTED_JOINT_DIGEST,
  EXPECTED_SECTION_DIGESTS,
  EXPECTED_TOKEN_COUNTS,
  GEODESIC_MAX_AZIMUTH_DEG,
  GEODESIC_MAX_LENGTH_M,
  GEODESIC_MAX_POSITION_M,
  NODE_GEODESIC_DIGEST,
  WP3_GEODESIC_BLOCK_A_DIGEST,
} from "../test/determinism/digests.js";
import geodesicReference from "../test/fixtures/determinism/geodesic-node-reference.json";

/** Engine label for failure messages — a bare digest mismatch names no culprit. */
const ENGINE_LABEL: string =
  (globalThis as { navigator?: { userAgent?: string } }).navigator?.userAgent ?? "unknown-engine";

let corpus: readonly CorpusSection[];
let digest: CorpusDigest;

beforeAll(async () => {
  corpus = buildCorpus();
  digest = await digestCorpus(corpus);
});

describe(`cross-engine determinism in-browser [${ENGINE_LABEL}]`, () => {
  it("runs in a real browser, not a Node shim", () => {
    // Guard against the config silently falling back to the Node environment, which would
    // make this whole file a duplicate of the Node suite wearing a browser's name.
    const g = globalThis as { window?: unknown; document?: unknown; process?: unknown };
    expect(g.window, "no window: this did not run in a browser").toBeDefined();
    expect(g.document, "no document: this did not run in a browser").toBeDefined();
    expect(typeof globalThis.crypto.subtle.digest).toBe("function");
  });

  it("builds the corpus at full size (no section silently truncated by the bundler)", () => {
    for (const section of corpus) {
      expect(
        section.tokens.length,
        `${ENGINE_LABEL}: section ${section.name}`,
      ).toBe(EXPECTED_TOKEN_COUNTS[section.name as keyof typeof EXPECTED_TOKEN_COUNTS]);
    }
  });

  for (const [name, expected] of Object.entries(EXPECTED_SECTION_DIGESTS)) {
    it(`reproduces the committed digest for '${name}'`, () => {
      expect(digest.sections[name], `${ENGINE_LABEL} diverged on section '${name}'`).toBe(
        expected,
      );
    });
  }

  it("reproduces the joint digest over every gated section", () => {
    expect(gatedSections(corpus).length).toBe(Object.keys(EXPECTED_SECTION_DIGESTS).length);
    expect(digest.joint, `${ENGINE_LABEL} joint digest`).toBe(EXPECTED_JOINT_DIGEST);
  });

  it("is byte-identical to the Node geodesic reference, double for double", () => {
    const observed = corpus.find((s) => s.name === GEODESIC_SECTION)!;
    const d = compareGeodesic(geodesicReference.tokens, observed.tokens);
    const byteIdentical = digest.sections[GEODESIC_SECTION] === NODE_GEODESIC_DIGEST;
    // eslint-disable-next-line no-console -- the measurement IS the deliverable here.
    console.log(
      `[cross-engine] ${GEODESIC_SECTION} vs node: byteIdentical=${byteIdentical} ` +
        `differingDoubles=${d.differingDoubles}/${d.samples * 5} ` +
        `maxPositionM=${d.maxPositionM} maxLengthM=${d.maxLengthM} ` +
        `maxAzimuthDeg=${d.maxAzimuthDeg}  engine=${ENGINE_LABEL}`,
    );
    // The corpus carries three blocks (short/mid/near-antipodal); a stale count here would
    // silently shrink the comparison, which is the failure mode this file exists to catch.
    expect(d.samples).toBe(720);

    // ---- The task C1 gate. Before the solver was vendored onto mathx, this was
    // `toBeLessThan(GEODESIC_MAX_POSITION_M)` and DR-WP3 §5 measured 142 / 126 / 249 of
    // block A's 1,200 doubles differing on Chromium / Firefox / WebKit. It is now an
    // equality on zero.
    expect(
      d.differingDoubles,
      `${ENGINE_LABEL}: geodesic is no longer cross-engine byte-identical`,
    ).toBe(0);
    expect(byteIdentical, `${ENGINE_LABEL}: geo.geodesic digest != Node reference`).toBe(true);

    // The magnitude bounds are KEPT, deliberately. They are plan Q12's own contingency
    // threshold ("> 1e-6 m ⇒ port Geodesic.Direct verbatim"), and if the equality above
    // ever regresses these turn the failure from "some bits moved" into a number that says
    // whether the contingency has been reached. Redundant while green, diagnostic when red.
    expect(d.maxPositionM, `${ENGINE_LABEL} geodesic position drift`).toBeLessThan(
      GEODESIC_MAX_POSITION_M,
    );
    expect(d.maxLengthM, `${ENGINE_LABEL} geodesic length drift`).toBeLessThan(
      GEODESIC_MAX_LENGTH_M,
    );
    expect(d.maxAzimuthDeg, `${ENGINE_LABEL} geodesic azimuth drift`).toBeLessThan(
      GEODESIC_MAX_AZIMUTH_DEG,
    );
  });

  it("reproduces the Direct-only digest — plan Q12's named target — in this engine", async () => {
    // `Geodesic.Direct` is the call plan Q12 names and the one every agent makes every tick
    // (DR-S3 §5). Digesting its 1,440 outputs under their own name means a regression in the
    // movement path fails with "Direct moved", not "the geodesic plane moved".
    const section = corpus.find((s) => s.name === GEODESIC_SECTION)!;
    const direct = geodesicDirectTokens(section);
    expect(direct.length).toBe(1440);
    const observed = await sha256Hex(
      sectionText({ name: GEODESIC_DIRECT_SUBSECTION, tokens: direct }),
    );
    // eslint-disable-next-line no-console -- the measurement IS the deliverable here.
    console.log(
      `[cross-engine] ${GEODESIC_DIRECT_SUBSECTION} ${observed}  engine=${ENGINE_LABEL}`,
    );
    expect(observed, `${ENGINE_LABEL} diverged on Geodesic.Direct`).toBe(
      EXPECTED_GEODESIC_DIRECT_DIGEST,
    );
  });

  it("reproduces the pre-vendoring WP3 block-A digest in this engine", async () => {
    // The honest form of the C1 claim. Block A is the *same* 240 samples, drawn in the same
    // RNG order, that DR-WP3 §5 measured this engine disagreeing with Node on. Asserting the
    // pre-vendoring Node constant here — in Chromium, Firefox and WebKit — is what makes
    // "the divergence is gone" a measurement on the original inputs rather than a claim
    // about a freshly chosen corpus.
    const section = corpus.find((s) => s.name === GEODESIC_SECTION)!;
    const blockA = { name: GEODESIC_SECTION, tokens: section.tokens.slice(0, 1200) };
    expect(await sha256Hex(sectionText(blockA)), `${ENGINE_LABEL} block A`).toBe(
      WP3_GEODESIC_BLOCK_A_DIGEST,
    );
  });

  it("would report a geodesic divergence if one existed (comparator non-vacuity)", () => {
    // Guards the zero above from being zero because the comparator is broken. One flipped
    // ulp in lat2 must surface as exactly one differing double, in the position channel.
    const section = corpus.find((s) => s.name === GEODESIC_SECTION)!;
    const perturbed = [...section.tokens];
    perturbed[0] = (BigInt(`0x${perturbed[0]!}`) + 1n).toString(16).padStart(16, "0");
    const d = compareGeodesic(section.tokens, perturbed);
    expect(d.differingDoubles).toBe(1);
    expect(d.maxPositionM).toBeGreaterThan(0);
  });

  it("is byte-stable when the same corpus is rebuilt in the same page", async () => {
    const again = await digestCorpus(buildCorpus());
    expect(again.joint).toBe(digest.joint);
    expect(again.sections).toEqual(digest.sections);
  });

  it("would fail if a digest moved (mutation check on the assertion itself)", async () => {
    const target = corpus.find((s) => s.name === "mathx.fdlibm")!;
    const tokens = [...target.tokens];
    tokens[0] = (BigInt(`0x${tokens[0]!}`) + 1n).toString(16).padStart(16, "0");
    const mutated = await sha256Hex(sectionText({ name: target.name, tokens }));
    expect(mutated).not.toBe(EXPECTED_SECTION_DIGESTS["mathx.fdlibm"]);
  });

  it("records this engine's host-math sentinel (measured, never gated)", () => {
    const sentinel = digest.sections[HOST_MATH_SECTION]!;
    expect(sentinel).toMatch(/^[0-9a-f]{64}$/u);
    // eslint-disable-next-line no-console -- the measurement IS the deliverable here.
    console.log(`[cross-engine] ${HOST_MATH_SECTION} ${sentinel}  engine=${ENGINE_LABEL}`);
  });
});
