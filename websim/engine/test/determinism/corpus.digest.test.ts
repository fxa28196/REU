/**
 * The Node half of the cross-engine determinism gate (plan §3.3, §5.1 Tier 2).
 *
 * <p>This file and `engine/test-browser/cross-engine.digest.test.ts` assert **the same
 * constants over the same corpus**. That is the whole design: the browser job does not
 * compare browsers to each other (which would pass happily if all four were wrong together)
 * — every engine is pinned to one committed digest, so "Chrome matches Node" is a
 * transitive consequence rather than a separate claim.
 *
 * <p>Running here on every push is also the strongest *proxy* the port has when the browser
 * matrix is not available: a platform-dependent `Math` call reaching an outcome path moves
 * a section digest, and the non-vacuity test below proves a single flipped ulp is enough.
 */

import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  buildCorpus,
  compareGeodesic,
  digestCorpus,
  gatedSections,
  geodesicDirectTokens,
  sectionText,
  sha256Hex,
  GEODESIC_DIRECT_SUBSECTION,
  GEODESIC_SECTION,
  HOST_MATH_SECTION,
  type CorpusSection,
} from "./corpus.js";
import {
  EXPECTED_GEODESIC_DIRECT_DIGEST,
  EXPECTED_JOINT_DIGEST,
  EXPECTED_SECTION_DIGESTS,
  EXPECTED_TOKEN_COUNTS,
  NODE_GEODESIC_DIGEST,
  WP3_GEODESIC_BLOCK_A_DIGEST,
} from "./digests.js";

const corpus = buildCorpus();

describe("cross-engine determinism corpus (Node reference)", () => {
  it("is not vacuous: every declared section is present and populated", () => {
    const names = corpus.map((s) => s.name);
    expect(names).toEqual([
      "rng.java-random",
      "rng.colt-mt19937",
      "mathx.fdlibm",
      "mathx.format",
      "scenario.world",
      "scenario.routing",
      "geo.geodesic",
      HOST_MATH_SECTION,
    ]);
    for (const section of corpus) {
      expect(
        section.tokens.length,
        `section ${section.name} has ${section.tokens.length} tokens`,
      ).toBe(EXPECTED_TOKEN_COUNTS[section.name as keyof typeof EXPECTED_TOKEN_COUNTS]);
      expect(section.tokens.every((t) => t.length > 0)).toBe(true);
    }
  });

  it("reproduces every committed section digest", async () => {
    const digest = await digestCorpus(corpus);
    for (const [name, expected] of Object.entries(EXPECTED_SECTION_DIGESTS)) {
      expect(digest.sections[name], `section ${name}`).toBe(expected);
    }
    expect(digest.joint).toBe(EXPECTED_JOINT_DIGEST);
  });

  it("cross-engine byte gate covers everything the port owns, and only that", () => {
    const gated = gatedSections(corpus).map((s) => s.name);
    // `host-math.sentinel` is the ONLY exclusion, and it is excluded because ECMA-262
    // declines to specify it — not because the port finds it inconvenient.
    expect(gated).not.toContain(HOST_MATH_SECTION);
    // WP7 task C1: geo.geodesic joined the gate when the solver was vendored onto mathx.
    expect(gated).toContain(GEODESIC_SECTION);
    expect(gated.length).toBe(corpus.length - 1);
    expect(Object.keys(EXPECTED_SECTION_DIGESTS).sort()).toEqual([...gated].sort());
  });

  it("pins geo.geodesic on the reference engine (dependency + V8 tripwire)", async () => {
    const digest = await digestCorpus(corpus);
    expect(digest.sections[GEODESIC_SECTION]).toBe(NODE_GEODESIC_DIGEST);
    // Since C1 the Node pin and the cross-engine gate are the same number. Asserting the
    // identity keeps a future edit from quietly re-splitting them.
    expect(NODE_GEODESIC_DIGEST).toBe(EXPECTED_SECTION_DIGESTS["geo.geodesic"]);
  });

  it("reproduces the Direct-only digest (plan Q12's named target)", async () => {
    const section = corpus.find((s) => s.name === GEODESIC_SECTION)!;
    const direct = geodesicDirectTokens(section);
    expect(direct.length).toBe(section.tokens.length / 5 * 2);
    expect(direct.length).toBe(1440);
    expect(
      await sha256Hex(sectionText({ name: GEODESIC_DIRECT_SUBSECTION, tokens: direct })),
    ).toBe(EXPECTED_GEODESIC_DIRECT_DIGEST);
  });

  it("reproduces the pre-vendoring WP3 block-A digest bit for bit", async () => {
    // Continuity, and the honest form of the C1 claim. Block A's 240 samples are the same
    // inputs, in the same RNG draw order, that DR-WP3 §5 measured Chromium / Firefox /
    // WebKit disagreeing on. If routing geographiclib through mathx had changed any value
    // on the reference engine, this digest would have moved and the "fix" would have been a
    // re-baselining. It did not move.
    const section = corpus.find((s) => s.name === GEODESIC_SECTION)!;
    const blockA = { name: GEODESIC_SECTION, tokens: section.tokens.slice(0, 1200) };
    expect(await sha256Hex(sectionText(blockA))).toBe(WP3_GEODESIC_BLOCK_A_DIGEST);
  });

  it("keeps the committed geodesic reference fixture in step with the corpus", () => {
    const file = fileURLToPath(
      new URL("../fixtures/determinism/geodesic-node-reference.json", import.meta.url),
    );
    const fixture = JSON.parse(readFileSync(file, "utf8")) as {
      section: string;
      digest: string;
      tokens: string[];
    };
    const section = corpus.find((s) => s.name === GEODESIC_SECTION)!;
    expect(fixture.section).toBe(GEODESIC_SECTION);
    expect(fixture.digest).toBe(NODE_GEODESIC_DIGEST);
    // The browser suite bounds itself against these exact values, so a stale fixture would
    // silently turn the cross-engine tolerance gate into a comparison with history.
    expect(fixture.tokens).toEqual([...section.tokens]);
    expect(compareGeodesic(fixture.tokens, section.tokens)).toEqual({
      samples: 720,
      maxPositionM: 0,
      maxLengthM: 0,
      maxAzimuthDeg: 0,
      differingDoubles: 0,
    });
  });

  it("is deterministic within one process (same corpus twice → same bytes)", async () => {
    const again = buildCorpus();
    for (let i = 0; i < corpus.length; i++) {
      expect(sectionText(again[i]!)).toBe(sectionText(corpus[i]!));
    }
  });

  it("would catch a single flipped ulp anywhere in a gated section", async () => {
    // The detector's own mutation test. `mathx.fdlibm` is picked because it is the section
    // a host-transcendental regression would land in; perturbing one token by one ulp is
    // the smallest possible defect of that class.
    const target = corpus.find((s) => s.name === "mathx.fdlibm")!;
    const mutatedTokens = [...target.tokens];
    const hex = mutatedTokens[0]!;
    const bumped = (BigInt(`0x${hex}`) + 1n).toString(16).padStart(16, "0");
    mutatedTokens[0] = bumped;
    const mutated: CorpusSection = { name: target.name, tokens: mutatedTokens };

    expect(bumped).not.toBe(hex);
    expect(await sha256Hex(sectionText(mutated))).not.toBe(
      EXPECTED_SECTION_DIGESTS["mathx.fdlibm"],
    );
  });

  it("the geodesic comparator is non-vacuous (it reports a one-ulp lat2 shift)", () => {
    const section = corpus.find((s) => s.name === GEODESIC_SECTION)!;
    const perturbed = [...section.tokens];
    perturbed[0] = (BigInt(`0x${perturbed[0]!}`) + 1n).toString(16).padStart(16, "0");
    const d = compareGeodesic(section.tokens, perturbed);
    expect(d.differingDoubles).toBe(1);
    expect(d.maxPositionM).toBeGreaterThan(0);
    expect(d.maxLengthM).toBe(0);
    expect(d.maxAzimuthDeg).toBe(0);
  });

  it("records — but does not gate — the host's own transcendentals", async () => {
    const sentinel = corpus.find((s) => s.name === HOST_MATH_SECTION)!;
    const digest = await sha256Hex(sectionText(sentinel));
    expect(digest).toMatch(/^[0-9a-f]{64}$/u);
    // Documented, checkable claim rather than a silent skip: on V8 the host's fdlibm-derived
    // `Math.log` agrees with the ported kernel, which is exactly why Node alone cannot
    // certify the mathx module (DR-S5 §4.2) and why the browser matrix exists.
    expect(Object.keys(EXPECTED_SECTION_DIGESTS)).not.toContain(HOST_MATH_SECTION);
  });
});
