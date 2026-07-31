/**
 * Provenance gate for the vendored geodesic solver (WP7 task C1, divergence 11).
 *
 * <p>`engine/src/geo/vendor/geographiclib-geodesic.vendored.ts` is 2,700 lines of
 * third-party numerical code carrying `@ts-nocheck` and `eslint-disable`. Neither the
 * compiler nor the linter looks at it, so *this file is the only thing standing between the
 * repo and an undetected hand edit inside the solver that every agent's movement runs
 * through.* Three distinct failures have to be caught:
 *
 *  1. **A hand edit.** Someone "fixes" a line in the vendored file. Caught by re-deriving
 *     the whole module from `node_modules` and comparing bytes.
 *  2. **A dependency bump.** `geographiclib-geodesic` moves to 2.3.0 and the vendored copy
 *     silently becomes the old version's math. Caught by the same byte comparison, and
 *     named by the pinned upstream SHA-256 so the failure says *which* input moved.
 *  3. **A missed rewrite.** A future upstream release starts calling a host transcendental
 *     the substitution does not cover, so the file compiles, passes its digests on the
 *     reference engine, and diverges only in a browser. Caught by scanning the generated
 *     text for residual `Math.<approximated>` on executable lines.
 *
 * <p>The third is the one worth dwelling on: it is exactly the defect class task C1 exists
 * to close, and it is invisible to every other gate that runs in a clean clone. The
 * cross-engine matrix would catch it, but only on a machine with 400 MB of Playwright
 * browsers installed. This runs on `npm test`.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  buildVendoredModule,
  generate,
  isCommentLine,
  readUpstream,
  residualHostMath,
  rewriteHostMath,
  upstreamDigest,
  upstreamVersion,
  UPSTREAM_FILES,
  VENDOR_FILE,
} from "../../../tools/vendor-geodesic.js";
import { MX_MEMBERS } from "../../src/geo/vendor/mx.js";

/** The upstream release the vendored copy was derived from. Bumping it is a deliberate act. */
const PINNED_VERSION = "2.2.0";

/**
 * SHA-256 over the four upstream sources, LF-normalised, in bundler order. Committed here as
 * well as in the generated file's header so a regeneration cannot move both in one edit
 * without this test naming the change.
 */
const PINNED_UPSTREAM_DIGEST =
  "0522063a3e9b98694e65b1e47472370ae94a97eab28c5488f9188c8272a2aa2b";

/** ECMA-262 §21.3.2's implementation-approximated set — the members that must not survive. */
const APPROXIMATED: readonly string[] = Object.freeze([
  "acos", "acosh", "asin", "asinh", "atan", "atanh", "atan2", "cbrt", "cos", "cosh",
  "exp", "expm1", "hypot", "log", "log1p", "log2", "log10", "pow", "random", "sin",
  "sinh", "tan", "tanh",
]);

describe("vendored geographiclib — provenance", () => {
  const sources = readUpstream();
  const vendored = readFileSync(VENDOR_FILE, "utf8");

  it("is pinned to a known upstream release, by version and by content digest", () => {
    expect(upstreamVersion()).toBe(PINNED_VERSION);
    expect(upstreamDigest(sources)).toBe(PINNED_UPSTREAM_DIGEST);
    // The generated header must carry the same digest, so a reader of the vendored file
    // alone can tell what it came from without running anything.
    expect(vendored).toContain(PINNED_UPSTREAM_DIGEST);
    expect(vendored).toContain(`geographiclib-geodesic@${PINNED_VERSION}`);
  });

  it("covers every upstream source the package's own bundler concatenates", () => {
    expect([...UPSTREAM_FILES]).toEqual([
      "Math.js",
      "Geodesic.js",
      "GeodesicLine.js",
      "PolygonArea.js",
    ]);
    for (const name of UPSTREAM_FILES) {
      expect(sources.get(name)!.length, `${name} is empty`).toBeGreaterThan(1000);
      expect(vendored).toContain(`BEGIN vendored geographiclib-geodesic src/${name}`);
    }
  });

  it("is byte-identical to a fresh re-derivation from node_modules", () => {
    // The load-bearing assertion. Any hand edit, partial regeneration, or dependency bump
    // shows up here as a byte difference.
    expect(vendored).toBe(generate());
  });

  it("leaves no host transcendental on any executable line of the generated module", () => {
    const residual = residualHostMath(vendored).filter((h) => APPROXIMATED.includes(h.member));
    expect(
      residual.map((h) => `line ${h.line}: Math.${h.member}`),
      "vendored solver still reaches host math",
    ).toEqual([]);
  });

  it("keeps only the exactly-specified Math members, and actually keeps them", () => {
    const kept = new Set(residualHostMath(vendored).map((h) => h.member));
    // Not an empty set: upstream really does call Math.abs/floor/min/max/sqrt/PI, and if the
    // transform had rewritten those too the diff against upstream would stop being auditable.
    expect(kept.size).toBeGreaterThan(0);
    for (const member of kept) {
      expect(APPROXIMATED, `Math.${member} survived the rewrite`).not.toContain(member);
    }
    // sqrt in particular: geographiclib defines its own hypot as sqrt(x*x+y*y) on purpose
    // ("Built in Math.hypot give incorrect results from GeodSolve92"), so sqrt must remain.
    expect(kept).toContain("sqrt");
  });

  it("actually rewrote something — the transform is not a no-op", () => {
    let hostCalls = 0;
    for (const name of UPSTREAM_FILES) {
      hostCalls += residualHostMath(sources.get(name)!).filter((h) =>
        MX_MEMBERS.includes(h.member),
      ).length;
    }
    // DR-WP3 §5 counted these by hand: atan2 x16, cos x14, sin x13, plus pow/log1p/log/
    // hypot/cbrt/atanh/atan. If a future upstream drops to zero, the substitution has become
    // vacuous and the vendoring no longer buys anything.
    expect(hostCalls, "upstream calls no host transcendental — vendoring is pointless").
      toBeGreaterThan(40);
    expect(vendored.split("Mx.").length - 1).toBeGreaterThanOrEqual(hostCalls);
  });

  it("rewrites executable lines and leaves comment prose alone", () => {
    // Mutation check on the transform itself, at the level the file is generated by.
    expect(rewriteHostMath("  var t = Math.atan2(y, x);")).toBe("  var t = Mx.atan2(y, x);");
    expect(rewriteHostMath("  return Math.sqrt(x);")).toBe("  return Math.sqrt(x);");
    expect(rewriteHostMath(" * Uses Math.cbrt internally.")).toBe(" * Uses Math.cbrt internally.");
    expect(rewriteHostMath("// Math.sin here is prose")).toBe("// Math.sin here is prose");
    expect(isCommentLine("   * doc")).toBe(true);
    expect(isCommentLine("var x = Math.sin(1);")).toBe(false);
  });

  it("fails the build rather than emitting a module that still reaches host math", () => {
    // The producer's own guard: if the allow-list ever stops covering what upstream calls,
    // `generate()` must throw instead of writing a file that passes on Node and diverges in
    // a browser. Proved by feeding it a source the allow-list cannot fully cover.
    const poisoned = new Map(sources);
    poisoned.set("Math.js", `${sources.get("Math.js")!}\nvar poison = Math.sinh(1);\n`);
    const text = buildVendoredModule(poisoned, PINNED_VERSION);
    const residual = residualHostMath(text).filter((h) => APPROXIMATED.includes(h.member));
    expect(residual.some((h) => h.member === "sinh")).toBe(true);
    // ...and that is precisely the condition `generate()` throws on.
    expect(MX_MEMBERS).not.toContain("sinh");
  });

  it("declares itself generated, so a reader knows not to edit it", () => {
    expect(vendored).toContain("GENERATED FILE — DO NOT EDIT BY HAND");
    expect(vendored).toContain("tools/vendor-geodesic.ts --write");
    // Upstream's MIT/X11 attribution must survive the copy.
    expect(vendored).toContain("Charles Karney");
    expect(vendored).toContain("MIT/X11");
  });
});
