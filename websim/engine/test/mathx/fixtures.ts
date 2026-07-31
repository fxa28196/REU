/**
 * Loaders for the WP3 `mathx` fixtures produced by
 * `pipeline/java-exporter/src/websim/exporter/MathxFixtureDumper.java`.
 *
 * The fixtures are **required, never optional**: a missing file must fail the suite loudly
 * rather than skip it (plan risk W18 — a silently skipped parity gate is worse than no
 * gate, because the badge still says green).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** One unary case: `[argBits, strictMathResultBits]`. */
export type UnaryCase = readonly [string, string];
/** One binary case: `[arg0Bits, arg1Bits, strictMathResultBits]`. */
export type BinaryCase = readonly [string, string, string];

export interface FunctionBlock {
  readonly arity: 1 | 2;
  readonly cases: ReadonlyArray<UnaryCase | BinaryCase>;
  readonly nCases: number;
  /** How many of those cases `java.lang.Math` answered differently from `StrictMath`. */
  readonly nIntrinsicDivergences: number;
  /** `[caseIndex, javaLangMathResultBits]` for exactly those cases. */
  readonly intrinsicDivergences: ReadonlyArray<readonly [number, string]>;
}

export interface StrictMathFixture {
  readonly javaVersion: string;
  readonly javaVmName: string;
  readonly osArch: string;
  readonly functions: Readonly<Record<string, FunctionBlock>>;
}

export interface FormatCase {
  readonly bits: string;
  /** `String.format(Locale.US, "%.Nf", v)` for N = 0..6. */
  readonly formatted: readonly string[];
  /** The same rounding applied to the *exact binary* value — i.e. `toFixed` semantics. */
  readonly exactBinary: readonly string[];
}

export interface FormatFixture {
  readonly javaVersion: string;
  readonly precisions: readonly number[];
  readonly cases: readonly FormatCase[];
  readonly nCases: number;
  readonly nCasesWhereToFixedWouldDiffer: number;
}

export interface TruncCastFixture {
  readonly javaVersion: string;
  readonly doubleCases: ReadonlyArray<{
    readonly bits: string;
    /** Java `(long) d` as a decimal string — may exceed `Number.MAX_SAFE_INTEGER`. */
    readonly toLong: string;
    /** Java `(int) d`. */
    readonly toInt: number;
  }>;
  readonly longCases: ReadonlyArray<{
    readonly value: string;
    /** Java `(int) l`. */
    readonly toInt: number;
  }>;
}

function load<T>(name: string): T {
  const path = fileURLToPath(new URL(`../fixtures/mathx/${name}`, import.meta.url));
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (cause) {
    throw new Error(
      `mathx fixture '${name}' is missing. Regenerate it with ` +
        `pwsh websim/pipeline/java-exporter/dump-mathx-fixtures.ps1 — this suite must not ` +
        `be skipped.`,
      { cause },
    );
  }
  return JSON.parse(text) as T;
}

export const strictMathFixture = load<StrictMathFixture>("mathx-strictmath.json");
export const formatFixture = load<FormatFixture>("mathx-format.json");
export const truncCastFixture = load<TruncCastFixture>("mathx-trunccast.json");
