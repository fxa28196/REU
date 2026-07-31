import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** One dumped Java draw sequence: a verbatim head plus a digest over all draws. */
export interface FixtureSequence {
  readonly id: string;
  readonly kind: string;
  readonly params: string;
  /** Java `long` seed as a decimal string -- may exceed Number.MAX_SAFE_INTEGER. */
  readonly seed: string;
  readonly seedNote: string;
  readonly count: number;
  readonly sha256: string;
  readonly head: readonly string[];
}

export interface FixtureFile {
  readonly generator: string;
  readonly javaVersion: string;
  readonly drawsPerSequence: number;
  readonly headLength: number;
  readonly coltJar?: string;
  readonly randomHelperCrossCheck?: string;
  readonly sequences: readonly FixtureSequence[];
}

function load(name: string): FixtureFile {
  const path = fileURLToPath(new URL(`../fixtures/rng/${name}`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as FixtureFile;
}

export const javaRandomFixtures = load("java-random.json");
export const coltFixtures = load("colt-mt19937.json");

/**
 * Reproduces the dumper's digest: SHA-256 over the UTF-8 bytes of `token + "\n"` for
 * every draw, in order. Matching this is a bit-exact comparison of all 10 000 draws --
 * the verbatim head only exists so a failure can be localised.
 */
export function digestTokens(tokens: readonly string[]): string {
  const h = createHash("sha256");
  for (const t of tokens) {
    h.update(`${t}\n`, "utf8");
  }
  return h.digest("hex");
}

/** First index at which two token arrays differ, or -1. */
export function firstDivergence(a: readonly string[], b: readonly string[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) {
      return i;
    }
  }
  return a.length === b.length ? -1 : n;
}
