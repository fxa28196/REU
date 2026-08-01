/**
 * Fixture plumbing for the WP8 decision-layer oracle
 * (`pipeline/out/decision-fixtures/`, DR-WP8-decision-oracle.md §4).
 *
 * Same two-tier arrangement WP5/WP6 established: the bulk oracle lives under the
 * git-ignored `pipeline/out/`, and every suite that reads it goes through the
 * shared skip-vs-fail policy in `tools/artifact-gate.ts`, so an absent oracle is
 * announced and attributed rather than silently dropped.
 *
 * The catalogue in `tools/artifact-policy.ts` carries a `decision-fixtures`
 * source, so the banner's `produce:` line names `dump-decision-trace.ps1`. It
 * previously borrowed `world-fixtures` and printed that source's command, which
 * defeated the point of the banner — its whole job is to tell a reader how to
 * materialise the artifact that is missing.
 *
 * ## Reading the dumps
 *
 * Every file is LF, UTF-8, tab-separated, with **four** leading `#` comment
 * lines (three provenance, one header). Every floating value is the `%016x` of
 * `Double.doubleToRawLongBits`, never decimal text — DR-S1/DR-C1's rule, and the
 * reason a comparison here is a *bit* comparison and not a tolerance.
 *
 * `hour.tsv` is 274 MB / 3.78 M rows, so it is consumed with a chunked reader
 * that never materialises the file (or a line array) in memory. The reader is
 * synchronous on purpose: vitest's worker isolation plus a 274 MB async pipeline
 * is a lot of moving parts to put underneath a bit-identity claim.
 */

import { closeSync, existsSync, openSync, readSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { ArtifactRef } from "../../../tools/artifact-gate.js";

const here = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url));

export const DECISION_FIXTURE_DIR = here("../../../pipeline/out/decision-fixtures");
/** The second JVM's dump — the only one in which a closure wave was ever scanned. */
export const DECISION_COV_CLOSURES_DIR = `${DECISION_FIXTURE_DIR}/cov-closures`;

export function decisionRef(name: string): ArtifactRef {
  return {
    source: "decision-fixtures",
    label: name,
    path: `${DECISION_FIXTURE_DIR}/${name}`,
  };
}

export function decisionFixturePresent(name: string): boolean {
  return existsSync(`${DECISION_FIXTURE_DIR}/${name}`);
}

// --- the sampling rule (DR-WP8-decision-oracle.md §5, NORMATIVE) -------------

/** `COHORT_MOD` from `DecisionTrace.java`, echoed into `manifest.json`. */
export const COHORT_MOD = 64;
/** `EARLY_HOURS` from `DecisionTrace.java`, echoed into `manifest.json`. */
export const EARLY_HOURS = 12;

/**
 * `COHORT(i) := ((i * 2654435761) mod 2^32) mod 64 == 0`.
 *
 * `2654435761 · i` stays exact in an IEEE double for every `i < 2^21`, so no
 * BigInt is needed at n = 6,842. The cohort is a **hash, not a stride**:
 * consecutive indices scatter, so the subset is not aligned with camp
 * assignment, with the sampler draw order, or with anything else that runs in
 * index order.
 */
export function inCohort(index: number): boolean {
  return ((index * 2654435761) % 4294967296) % COHORT_MOD === 0;
}

/** A row is in `hour.tsv` iff `COHORT(i) OR h < EARLY_HOURS`, on a new-hour tick. */
export function hourRowDumped(index: number, hour: number): boolean {
  return inCohort(index) || hour < EARLY_HOURS;
}

// --- the reader ---------------------------------------------------------------

/**
 * Stream a decision dump line by line, skipping the four `#` header lines.
 *
 * `visit` receives the tab-split fields of one data row. Returning `false` stops
 * the walk early (used by the smoke checks, never by a parity assertion).
 * Returns the number of data rows visited.
 */
export function forEachRow(
  path: string,
  visit: (fields: string[], lineNo: number) => void | boolean,
): number {
  const fd = openSync(path, "r");
  try {
    const size = statSync(path).size;
    const CHUNK = 1 << 22; // 4 MiB
    const buf = Buffer.allocUnsafe(CHUNK);
    let carry = "";
    let offset = 0;
    let lineNo = 0;
    let rows = 0;
    for (;;) {
      const read = offset >= size ? 0 : readSync(fd, buf, 0, CHUNK, offset);
      if (read <= 0) {
        break;
      }
      offset += read;
      const text = carry + buf.toString("utf8", 0, read);
      let start = 0;
      for (;;) {
        const nl = text.indexOf("\n", start);
        if (nl < 0) {
          carry = text.slice(start);
          break;
        }
        const line = text.slice(start, nl);
        start = nl + 1;
        lineNo++;
        if (line.length === 0 || line.charCodeAt(0) === 35 /* '#' */) {
          continue;
        }
        rows++;
        if (visit(line.split("\t"), lineNo) === false) {
          return rows;
        }
      }
    }
    if (carry.length > 0 && carry.charCodeAt(0) !== 35) {
      lineNo++;
      rows++;
      visit(carry.split("\t"), lineNo);
    }
    return rows;
  } finally {
    closeSync(fd);
  }
}

// --- the transcendental frontier ---------------------------------------------

/**
 * ULP distance between two doubles, in the usual total-order sense.
 *
 * ## Why a decision-layer parity test needs one at all
 *
 * `GisAgent` calls `Math.exp`, `Math.log` and `Math.pow`. In JDK 17 those are
 * `@IntrinsicCandidate`: HotSpot replaces them with x86-64 LIBM stubs that are
 * **not** `StrictMath` (DR-S1 §3, §5.4). `mathx` is a verbatim fdlibm port and
 * therefore matches `StrictMath` bit for bit, which is the target this project
 * chose deliberately — the goal is **JS ≡ JS across engines**, not JS ≡ the
 * archived HotSpot intrinsics, which DR-S1 measured to be unreachable at any
 * budget.
 *
 * So the decision layer splits cleanly in two, and the split is stated rather
 * than smoothed over:
 *
 * - **pure IEEE arithmetic** — `thetaScaled`, `barrierCost`, `bRiskEff`, the
 *   left-to-right accumulation of `u`, `walkTimeH`, `zR` and the hour bucket —
 *   is compared **bit for bit** and must be exact;
 * - **the three transcendental results** — `p = 1/(1+exp(-u))`,
 *   `v = -βT·walkTimeH + βS·ln(max(1,cap))` and `decay = pow(2, -1/H)` — are
 *   compared with this function against a **hard ULP cap**, and the observed
 *   distribution is printed, so the size of the frontier is a measurement in the
 *   test output rather than a claim in a comment.
 *
 * A port defect shows up as a *large* or *structured* deviation; the intrinsic
 * frontier shows up as ≤ a couple of ulps on the transcendental outputs only.
 * The knife-edge exposure — a hazard Bernoulli that would flip because `p`
 * differs by an ulp — is counted separately and reported.
 */
export function ulpDistance(a: number, b: number): number {
  if (Object.is(a, b)) {
    return 0;
  }
  if (Number.isNaN(a) || Number.isNaN(b)) {
    return Number.POSITIVE_INFINITY;
  }
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return Number.POSITIVE_INFINITY;
  }
  const buf = new DataView(new ArrayBuffer(8));
  const order = (x: number): bigint => {
    buf.setFloat64(0, x);
    const bits = buf.getBigInt64(0);
    // Map the sign-magnitude layout onto a monotone two's-complement line.
    return bits < 0n ? -9223372036854775808n - bits : bits;
  };
  const d = order(a) - order(b);
  return Number(d < 0n ? -d : d);
}

/** A running ULP census, printed by the suites that own a transcendental. */
export class UlpCensus {
  private n = 0;
  private exact = 0;
  private max = 0;
  private readonly hist = new Map<number, number>();

  constructor(readonly label: string) {}

  add(port: number, java: number): number {
    const d = ulpDistance(port, java);
    this.n++;
    if (d === 0) {
      this.exact++;
    }
    if (d > this.max) {
      this.max = d;
    }
    const bucket = d > 8 ? 9 : d;
    this.hist.set(bucket, (this.hist.get(bucket) ?? 0) + 1);
    return d;
  }

  get count(): number {
    return this.n;
  }

  get maxUlp(): number {
    return this.max;
  }

  get exactShare(): number {
    return this.n === 0 ? Number.NaN : this.exact / this.n;
  }

  report(): string {
    const parts = [...this.hist.entries()]
      .sort((x, y) => x[0] - y[0])
      .map(([d, c]) => `${d === 9 ? ">8" : String(d)}ulp=${c}`);
    return (
      `[WP8] ${this.label}: ${this.n} values, ${this.exact} bit-exact ` +
      `(${(100 * this.exactShare).toFixed(3)}%), max ${this.max} ulp — ${parts.join(" ")}`
    );
  }
}

/**
 * {@link forEachRow}, yielding to the event loop between 4 MiB chunks.
 *
 * `hour.tsv` is 274 MB and takes ~90 s to walk. A single synchronous `it` body
 * that long starves vitest's worker RPC and the run ends with an
 * `[vitest-worker]: Timeout calling "onTaskUpdate"` unhandled error — a green
 * suite reported alongside a red error line, which is precisely the ambiguous
 * signal this project's harness rules exist to remove. Awaiting a macrotask per
 * chunk costs nothing measurable and keeps the reporter alive.
 */
export async function forEachRowAsync(
  path: string,
  visit: (fields: string[], lineNo: number) => void | boolean,
): Promise<number> {
  const fd = openSync(path, "r");
  try {
    const size = statSync(path).size;
    const CHUNK = 1 << 22; // 4 MiB
    const buf = Buffer.allocUnsafe(CHUNK);
    let carry = "";
    let offset = 0;
    let lineNo = 0;
    let rows = 0;
    for (;;) {
      const read = offset >= size ? 0 : readSync(fd, buf, 0, CHUNK, offset);
      if (read <= 0) {
        break;
      }
      offset += read;
      const text = carry + buf.toString("utf8", 0, read);
      let start = 0;
      for (;;) {
        const nl = text.indexOf("\n", start);
        if (nl < 0) {
          carry = text.slice(start);
          break;
        }
        const line = text.slice(start, nl);
        start = nl + 1;
        lineNo++;
        if (line.length === 0 || line.charCodeAt(0) === 35 /* '#' */) {
          continue;
        }
        rows++;
        if (visit(line.split("\t"), lineNo) === false) {
          return rows;
        }
      }
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    }
    if (carry.length > 0 && carry.charCodeAt(0) !== 35) {
      lineNo++;
      rows++;
      visit(carry.split("\t"), lineNo);
    }
    return rows;
  } finally {
    closeSync(fd);
  }
}

/** `manifest.json`, parsed. Used only to CROSS-CHECK declared configs. */
export interface DecisionManifestRun {
  readonly config: string;
  readonly seed: number;
  readonly informationRegime: number;
  readonly enableHazardDeparture: number;
  readonly pAwareInit: number;
  readonly sigmaTheta: number;
  readonly gammaVuln: number;
  readonly barrier: number;
  readonly petPolicyDefault: number;
  readonly betaCapacityPrior: number;
  readonly pushThetaThresholdExecuted: number;
  readonly simulationHours: number;
  readonly sheltered: number;
  readonly refusedAllFull: number;
  readonly unreachable: number;
  readonly unaware: number;
  readonly decisionDraws: number;
}

export interface DecisionManifest {
  readonly numAgents: number;
  readonly minutesPerTick: number;
  readonly evacuationThresholdUgM3: number;
  readonly samplingRule: {
    readonly earlyHours: number;
    readonly cohortMod: number;
    readonly agentOrder: string;
  };
  readonly runs: readonly DecisionManifestRun[];
}
