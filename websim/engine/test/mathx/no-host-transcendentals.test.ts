/**
 * Structural gate: engine source may only touch `Math` members whose result is fixed by a
 * specification, never a host-approximated one.
 *
 * <p>ECMA-262 §21.3.2 declares `acos acosh asin asinh atan atanh atan2 cbrt cos cosh exp
 * expm1 hypot log log1p log2 log10 pow random sin sinh sqrt tan tanh` **implementation-
 * approximated**: the last ulp is a property of the engine build, not of the language. A
 * simulation whose agents take Bernoulli decisions against those values produces a different
 * population on Chrome and on Firefox. Plan §3.3 therefore requires every transcendental to
 * go through `mathx` (a verbatim fdlibm port, so the answer depends only on IEEE-754 double
 * arithmetic, which *is* specified), and plan §3.3 bans `Math.random` outright.
 *
 * <p>Two reasons this file exists even though the cross-engine digest suite would also catch
 * a regression:
 *
 *  1. **It runs everywhere.** `npm run test:browser` needs ~400 MB of Playwright browsers;
 *     this needs `readFileSync`. It is the gate that survives a clean clone.
 *  2. **It localises.** A moved digest says "the engine changed"; this names the file, the
 *     line and the replacement.
 *
 * <p>Allow-list, not deny-list: a `Math` member added to the language in some future edition
 * is banned until someone deliberately classifies it, which is the safe default here.
 * `no-tofixed.test.ts` is the sibling gate for decimal formatting and explains why a lint
 * rule lives in the test suite rather than in an ESLint config (the repo pins Vitest + tsx,
 * not a linter).
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ENGINE_SRC = path.resolve(fileURLToPath(new URL("../../src", import.meta.url)));

/**
 * `Math` members whose value ECMA-262 fixes exactly, so every engine must agree.
 *
 * `sqrt` is here on a specific, checkable argument rather than by category: IEEE-754 §5.4.1
 * *requires* `sqrt` to be correctly rounded, `StrictMath.sqrt` is specified the same way,
 * and every JS engine lowers it to the hardware instruction. `engine/src/mathx/sqrt.ts`
 * states the argument; `mathx.parity.test.ts` checks it against Java fixtures; and the
 * cross-engine corpus now *measures* it byte-identical on V8, SpiderMonkey and
 * JavaScriptCore. If any of those three ever disagrees, this entry is the thing to revisit.
 */
const ALLOWED = new Set([
  // Exactly-specified operations.
  "abs",
  "ceil",
  "floor",
  "round",
  "sign",
  "trunc",
  "min",
  "max",
  "fround",
  "clz32",
  "imul",
  "sqrt",
  // Exactly-specified constants.
  "PI",
  "E",
  "LN2",
  "LN10",
  "LOG2E",
  "LOG10E",
  "SQRT2",
  "SQRT1_2",
]);

/** What to use instead, when there is a `mathx` equivalent. */
const REPLACEMENT: Readonly<Record<string, string>> = {
  log: "fdlibmLog",
  exp: "fdlibmExp",
  pow: "fdlibmPow",
  sin: "fdlibmSin",
  cos: "fdlibmCos",
  atan: "fdlibmAtan",
  atan2: "fdlibmAtan2",
  random: "a StreamRegistry stream (JavaRandom / ColtMT19937) — Math.random is banned outright",
};

function collectSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const abs = path.join(dir, entry);
    if (statSync(abs).isDirectory()) {
      out.push(...collectSources(abs));
    } else if (entry.endsWith(".ts")) {
      out.push(abs);
    }
  }
  return out;
}

const MATH_MEMBER = /\bMath\s*\.\s*([A-Za-z_$][A-Za-z0-9_$]*)/gu;

/** Doc comments name the banned APIs on purpose; only executable lines count. */
function isCommentLine(line: string): boolean {
  return /^\s*(\/\/|\*|\/\*)/u.test(line);
}

interface Hit {
  readonly file: string;
  readonly line: number;
  readonly member: string;
}

function scan(files: readonly string[]): Hit[] {
  const hits: Hit[] = [];
  for (const file of files) {
    const lines = readFileSync(file, "utf8").split(/\r?\n/u);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (isCommentLine(line)) {
        continue;
      }
      for (const m of line.matchAll(MATH_MEMBER)) {
        const member = m[1]!;
        if (!ALLOWED.has(member)) {
          hits.push({
            file: path.relative(ENGINE_SRC, file).replace(/\\/gu, "/"),
            line: i + 1,
            member,
          });
        }
      }
    }
  }
  return hits;
}

describe("engine source may not call host-approximated Math routines", () => {
  const files = collectSources(ENGINE_SRC);

  it("finds engine sources to scan (the scan itself must not be vacuous)", () => {
    expect(files.length).toBeGreaterThan(20);
    for (const expected of [
      path.join("mathx", "log.ts"),
      path.join("mathx", "sqrt.ts"),
      path.join("rng", "JavaRandom.ts"),
      path.join("graph", "dijkstra.ts"),
    ]) {
      expect(files.some((f) => f.endsWith(expected)), `expected to scan ${expected}`).toBe(true);
    }
  });

  it("contains no non-fdlibm transcendental and no Math.random", () => {
    const hits = scan(files).map(
      (h) =>
        `${h.file}:${h.line}: Math.${h.member} — use ` +
        `${REPLACEMENT[h.member] ?? "the mathx equivalent (engine/src/mathx/index.ts)"}`,
    );
    expect(hits).toEqual([]);
  });

  it("would catch each banned routine (mutation check on the detector itself)", () => {
    const banned = [
      "log",
      "log2",
      "log10",
      "log1p",
      "exp",
      "expm1",
      "pow",
      "sin",
      "cos",
      "tan",
      "asin",
      "acos",
      "atan",
      "atan2",
      "sinh",
      "cosh",
      "tanh",
      "asinh",
      "acosh",
      "atanh",
      "cbrt",
      "hypot",
      "random",
    ];
    for (const member of banned) {
      expect(ALLOWED.has(member), `Math.${member} must not be allow-listed`).toBe(false);
      const line = `  const v = Math.${member}(x);`;
      const found = [...line.matchAll(MATH_MEMBER)].map((m) => m[1]!);
      expect(found).toEqual([member]);
    }
    // Whitespace and comment handling, both directions.
    expect([...`const a = Math . pow (2, 3);`.matchAll(MATH_MEMBER)].map((m) => m[1])).toEqual([
      "pow",
    ]);
    expect(isCommentLine(" * Math.log is banned in prose too, but prose is fine")).toBe(true);
    expect(isCommentLine("const x = Math.log(2);")).toBe(false);
  });

  it("allows only members whose value the spec fixes", () => {
    // Guards the allow-list against future well-meaning additions: every entry must be a
    // real `Math` member, and no entry may be one ECMA-262 calls implementation-approximated.
    const approximated = new Set([
      "acos", "acosh", "asin", "asinh", "atan", "atanh", "atan2", "cbrt", "cos", "cosh",
      "exp", "expm1", "hypot", "log", "log1p", "log2", "log10", "pow", "random", "sin",
      "sinh", "tan", "tanh",
    ]);
    for (const name of ALLOWED) {
      expect(name in Math, `Math.${name} does not exist`).toBe(true);
      if (name === "sqrt") {
        continue; // Justified by IEEE-754 §5.4.1 — see the ALLOWED doc comment.
      }
      expect(approximated.has(name), `Math.${name} is implementation-approximated`).toBe(false);
    }
  });
});
