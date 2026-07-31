/**
 * Structural gate: `toFixed` (and its two siblings) may not appear anywhere in engine
 * source.
 *
 * <p>Plan §1.2 disqualifies `toFixed` outright and PORT_MAP §5.5 says why: it rounds the
 * exact binary double, so `(0.615).toFixed(2)` is `"0.61"` where Java's `%.2f` is `"0.62"`,
 * and `(1e23).toFixed(2)` prints the double's exact value rather than its shortest decimal.
 * Every such call is a silent byte-identity failure that no output diff would attribute to
 * the formatter.
 *
 * <p>A lint rule would be the conventional home for this, but the repo has no ESLint
 * configuration (plan §1.2 pins Vitest + tsx, not a linter), so the gate lives where it
 * actually runs: in CI, on every `npm test`. It scans real files on disk rather than
 * relying on an import graph, so a new engine module is covered the moment it is written.
 *
 * <p>`toPrecision` and `toExponential` are banned by the same argument — both format from
 * the binary value and both are reachable typos for the intended `javaFormatFixed`.
 * `toLocaleString` is banned because a locale-sensitive number format inside a determinism
 * engine is a defect regardless of rounding.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ENGINE_SRC = path.resolve(fileURLToPath(new URL("../../src", import.meta.url)));

const BANNED = [
  { name: "toFixed", pattern: /\.toFixed\s*\(/gu },
  { name: "toPrecision", pattern: /\.toPrecision\s*\(/gu },
  { name: "toExponential", pattern: /\.toExponential\s*\(/gu },
  { name: "toLocaleString", pattern: /\.toLocaleString\s*\(/gu },
] as const;

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

describe("engine source may not format numbers through the host's binary formatters", () => {
  const files = collectSources(ENGINE_SRC);

  it("finds engine sources to scan (the scan itself must not be vacuous)", () => {
    expect(files.length).toBeGreaterThan(5);
    expect(files.some((f) => f.endsWith(path.join("mathx", "format.ts")))).toBe(true);
  });

  it("contains no banned formatter call", () => {
    const hits: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      const lines = text.split(/\r?\n/u);
      for (const { name, pattern } of BANNED) {
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]!;
          // Prose in doc comments names the banned APIs on purpose; only code counts.
          const isComment = /^\s*(\/\/|\*|\/\*)/u.test(line);
          if (isComment) {
            continue;
          }
          const rx = new RegExp(pattern.source, pattern.flags);
          if (rx.test(line)) {
            hits.push(
              `${path.relative(ENGINE_SRC, file).replace(/\\/gu, "/")}:${i + 1}: ${name} — ` +
                `use javaFormatFixed from engine/src/mathx/format.ts`,
            );
          }
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it("would catch a violation (mutation check on the detector itself)", () => {
    const sample = ["const s = value.toFixed(2);", "// value.toFixed(2) in prose is fine"];
    const flagged = sample.filter(
      (line) => !/^\s*(\/\/|\*|\/\*)/u.test(line) && /\.toFixed\s*\(/u.test(line),
    );
    expect(flagged).toEqual(["const s = value.toFixed(2);"]);
  });
});
