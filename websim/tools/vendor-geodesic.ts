/**
 * Vendors `geographiclib-geodesic` into the engine with its host transcendentals rewritten
 * onto `mathx` (WP7 task C1; DR-WP3 §5; plan §1.2 and Q12 commitment 3).
 *
 * ## Why a vendor step and not a hand port
 *
 * The plan requires geographiclib's math to run through the fdlibm module. The obvious route
 * — re-implement `Geodesic.Direct` in TypeScript — is the one DR-S1 §5.3 already argued
 * against: it is ~2,400 lines of numerically delicate code where a single reassociated
 * expression changes the answer in the last ulp and no test would name the line. So instead
 * the upstream sources are copied **verbatim** and put through one mechanical, reproducible
 * substitution:
 *
 * > On every line that is not a comment, `Math.<m>` becomes `Mx.<m>` for each `m` in
 * > {@link MX_MEMBERS} — the ECMA-262 implementation-approximated set. Nothing else changes.
 *
 * `Math.abs/floor/round/min/max/PI/sqrt` are left alone: ECMA-262 fixes their values exactly
 * (and IEEE-754 §5.4.1 fixes `sqrt`), so rewriting them would enlarge the diff without
 * buying determinism. Comment lines are left alone so upstream's prose still says what
 * upstream wrote.
 *
 * The result is checked two ways, both of which run in `npm test` from a clean clone:
 *
 *  - `engine/test/geo/vendor.provenance.test.ts` re-derives the vendored file from
 *    `node_modules/geographiclib-geodesic/src` and asserts **byte equality**. A drifted
 *    vendor copy, a hand edit, or an unnoticed dependency bump all fail there.
 *  - `engine/test/geo/vendor.equivalence.test.ts` runs the vendored solver and the shipped
 *    package over the same inputs and reports the divergence, which must be attributable to
 *    the transcendental substitution alone.
 *
 * ## Usage
 *
 * ```
 * cd websim && npx tsx tools/vendor-geodesic.ts          # check only, exit 1 on drift
 * cd websim && npx tsx tools/vendor-geodesic.ts --write  # regenerate
 * ```
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MX_MEMBERS } from "../engine/src/geo/vendor/mx.js";

/** Repo root (`websim/`). */
const WEBSIM = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

/** Upstream source directory — the package is a normal `engine` dependency. */
export const UPSTREAM_DIR = path.join(
  WEBSIM,
  "node_modules",
  "geographiclib-geodesic",
  "src",
);

/**
 * The upstream files, in the order upstream's own bundler concatenates them
 * (`geographiclib-geodesic.js`: Math → Geodesic → GeodesicLine → PolygonArea). The order is
 * load-bearing: `Math.js` declares `var geodesic`, and each later file closes over it.
 */
export const UPSTREAM_FILES: readonly string[] = Object.freeze([
  "Math.js",
  "Geodesic.js",
  "GeodesicLine.js",
  "PolygonArea.js",
]);

/** Where the generated module lands. */
export const VENDOR_FILE = path.join(
  WEBSIM,
  "engine",
  "src",
  "geo",
  "vendor",
  "geographiclib-geodesic.vendored.ts",
);

/**
 * A line the substitution skips. Same shape as the predicate in
 * `engine/test/mathx/no-host-transcendentals.test.ts`, and deliberately so: that lint is the
 * gate, this is the producer, and if the two ever disagreed the lint would go red — which is
 * the safe direction for them to disagree in.
 */
export function isCommentLine(line: string): boolean {
  return /^\s*(\/\/|\*|\/\*)/u.test(line);
}

/** `Math.<member>` occurrences, member captured. */
const MATH_MEMBER = /\bMath\s*\.\s*([A-Za-z_$][A-Za-z0-9_$]*)/gu;

/** Applies the substitution to one upstream file's text. */
export function rewriteHostMath(source: string): string {
  const allowed = new Set(MX_MEMBERS);
  return source
    .split("\n")
    .map((line) =>
      isCommentLine(line)
        ? line
        : line.replace(MATH_MEMBER, (whole, member: string) =>
            allowed.has(member) ? `Mx.${member}` : whole,
          ),
    )
    .join("\n");
}

/** Every `Math.<member>` still present on an executable line, with its line number. */
export function residualHostMath(
  text: string,
): ReadonlyArray<{ readonly line: number; readonly member: string }> {
  const out: { line: number; member: string }[] = [];
  text.split("\n").forEach((line, i) => {
    if (isCommentLine(line)) {
      return;
    }
    for (const match of line.matchAll(MATH_MEMBER)) {
      out.push({ line: i + 1, member: match[1]! });
    }
  });
  return out;
}

/** Reads the upstream sources with line endings normalised to `\n`. */
export function readUpstream(dir: string = UPSTREAM_DIR): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const name of UPSTREAM_FILES) {
    map.set(name, readFileSync(path.join(dir, name), "utf8").replace(/\r\n/gu, "\n"));
  }
  return map;
}

/** SHA-256 over the upstream sources, in {@link UPSTREAM_FILES} order. */
export function upstreamDigest(sources: ReadonlyMap<string, string>): string {
  const h = createHash("sha256");
  for (const name of UPSTREAM_FILES) {
    h.update(`${name}\n`);
    h.update(sources.get(name)!);
  }
  return h.digest("hex");
}

/**
 * Builds the vendored module text.
 *
 * @param sources upstream file text, keyed by file name
 * @param version the `version` field of the upstream `package.json`
 */
export function buildVendoredModule(
  sources: ReadonlyMap<string, string>,
  version: string,
): string {
  const digest = upstreamDigest(sources);
  const parts: string[] = [];
  parts.push(`// @ts-nocheck -- vendored third-party source; see the provenance note below.
/* eslint-disable -- vendored third-party source. */
/*
 * GENERATED FILE — DO NOT EDIT BY HAND.
 *
 * Regenerate:  cd websim && npx tsx tools/vendor-geodesic.ts --write
 * Verify:      cd websim && npx vitest run --project engine engine/test/geo
 *
 * Source:      geographiclib-geodesic@${version}, files src/{${UPSTREAM_FILES.join(", ")}}
 * SHA-256:     ${digest}   (over those files, in that order, LF-normalised)
 *
 * The ONLY change from upstream: on every line that is not a comment, \`Math.<m>\` was
 * replaced by \`Mx.<m>\` for each m in
 *   ${MX_MEMBERS.join(", ")}
 * — the ECMA-262 §21.3.2 implementation-approximated set — where \`Mx\` is the fdlibm
 * namespace in ./mx.ts. \`Math.abs/floor/round/min/max/PI/sqrt\` are untouched because
 * ECMA-262 (and IEEE-754 §5.4.1 for sqrt) fixes their values exactly.
 *
 * Why: DR-WP3 §5 measured this package producing four different digests on four engines,
 * because it calls the host transcendentals directly. Plan §1.2 / Q12 commitment 3 requires
 * that math to route through mathx so cross-engine byte identity is a CI gate. WP7 task C1.
 *
 * \`@ts-nocheck\` is honest here: this file is not authored in this repo and is not typed by
 * this repo. Its correctness is established by
 * engine/test/geo/vendor.provenance.test.ts (byte-equality against a fresh re-derivation
 * from node_modules) and engine/test/geo/vendor.equivalence.test.ts (differential run
 * against the shipped package), not by tsc.
 *
 * geographiclib-geodesic is MIT/X11 licensed, Copyright (c) Charles Karney (2011-2022).
 * The upstream LICENSE.txt travels with the dependency in node_modules.
 */

import { Mx } from "./mx.js";
`);
  for (const name of UPSTREAM_FILES) {
    parts.push(`
// ===========================================================================================
// ==== BEGIN vendored geographiclib-geodesic src/${name}
// ===========================================================================================
${rewriteHostMath(sources.get(name)!)}
// ==== END vendored geographiclib-geodesic src/${name}
`);
  }
  parts.push(`
/** The upstream \`geodesic\` namespace: \`{ Constants, Math, Accumulator, Geodesic, GeodesicLine, PolygonArea }\`. */
export default geodesic;
`);
  return parts.join("");
}

/** Reads the pinned upstream version from the dependency's own manifest. */
export function upstreamVersion(dir: string = UPSTREAM_DIR): string {
  const manifest = JSON.parse(
    readFileSync(path.join(dir, "..", "package.json"), "utf8"),
  ) as { version: string };
  return manifest.version;
}

/** Regenerates {@link VENDOR_FILE} from source and returns its text. */
export function generate(): string {
  const sources = readUpstream();
  const text = buildVendoredModule(sources, upstreamVersion());
  const residual = residualHostMath(text).filter((h) => MX_MEMBERS.includes(h.member));
  if (residual.length > 0) {
    throw new Error(
      `vendoring left ${residual.length} host transcendental call(s) in place: ` +
        residual.map((h) => `line ${h.line}: Math.${h.member}`).join(", "),
    );
  }
  return text;
}

function main(): void {
  const write = process.argv.includes("--write");
  const generated = generate();
  let current: string | null = null;
  try {
    current = readFileSync(VENDOR_FILE, "utf8");
  } catch {
    current = null;
  }
  if (write) {
    writeFileSync(VENDOR_FILE, generated, "utf8");
    // eslint-disable-next-line no-console -- CLI
    console.log(`wrote ${path.relative(WEBSIM, VENDOR_FILE)} (${generated.length} bytes)`);
    return;
  }
  if (current === generated) {
    // eslint-disable-next-line no-console -- CLI
    console.log(`${path.relative(WEBSIM, VENDOR_FILE)} is up to date`);
    return;
  }
  // eslint-disable-next-line no-console -- CLI
  console.error(
    `${path.relative(WEBSIM, VENDOR_FILE)} is STALE or missing — re-run with --write`,
  );
  process.exitCode = 1;
}

/**
 * Run as a CLI only when this file is the process entry point. The test suite imports the
 * same module for its byte-equality check, and must not trip `process.exitCode` doing so.
 */
if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
