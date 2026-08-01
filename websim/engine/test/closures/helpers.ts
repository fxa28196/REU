/**
 * Fixture plumbing for the WP8 **closure-wave** oracle
 * (`pipeline/out/closure-fixtures/`, DR-WP8-closure-oracle.md).
 *
 * Two tiers, same arrangement WP5/WP6/the decision suites use: the bulk oracle
 * lives under the git-ignored `pipeline/out/`, and every suite that reads it
 * goes through the shared skip-vs-fail policy in `tools/artifact-gate.ts`, so an
 * absent oracle is announced and attributed rather than silently dropped.
 *
 * The catalogue in `tools/artifact-policy.ts` carries a `closure-fixtures`
 * source, so the banner's `produce:` line names `dump-closure-fixtures.ps1`. It
 * previously borrowed `world-fixtures` and printed that source's command, which
 * defeated the point of the banner — its whole job is to tell a reader how to
 * materialise the artifact that is missing. (The decision suites carried the
 * same borrow, and were corrected alongside this one.)
 *
 * ## The tree wire format, which is the whole reason a digest is enough
 *
 * `TreeCodec.java` reuses WP5's row form verbatim:
 *
 * ```
 * <node_id> \t <dist_m_hex> \t <predecessor_directed_edge> \n
 * ```
 *
 * ascending by **node id** (Java `TreeMap<Long, …>`, numeric, negatives first),
 * over exactly the nodes present in `ShortestPathTree.distM` — so the reachable
 * *set* is part of the oracle, not an afterthought. `dist_m_hex` is `%016x` of
 * `Double.doubleToRawLongBits`; `predecessor_directed_edge` is
 * `featureIndex * 2 + dir`, `-1` at the source. UTF-8, LF, no header, no
 * trailing blank line.
 *
 * The dump ships a SHA-256 over those bytes for the **whole** array plus 128
 * stride-sampled raw rows. {@link treeDigest} recomputes that digest over the
 * port's own tree, so the comparison is over all 9,790,041 distance+predecessor
 * entries and not over the 41,472 rows that happened to be shipped.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { ArtifactRef } from "../../../tools/artifact-gate.js";
import type { RoutingGraph } from "../../src/graph/csr.js";
import type { ShortestPathTree } from "../../src/graph/dijkstra.js";

const here = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url));

export const CLOSURE_FIXTURE_DIR = here("../../../pipeline/out/closure-fixtures");
export const GEOGRAPHY_DIR = here("../../../../Geography");
export const ARCHIVED_REPORT_DIR = `${GEOGRAPHY_DIR}/../docs/runs/scenario-e-closures`;

export function closureRef(name: string): ArtifactRef {
  return {
    source: "closure-fixtures",
    label: name,
    path: `${CLOSURE_FIXTURE_DIR}/${name}`,
  };
}

export function geographyRef(rel: string): ArtifactRef {
  return { source: "geography", label: rel, path: `${GEOGRAPHY_DIR}/${rel}` };
}

export function archivedReportRef(name: string): ArtifactRef {
  return { source: "archive", label: `scenario-e-closures/${name}`, path: `${ARCHIVED_REPORT_DIR}/${name}` };
}

export function closureFixturePresent(name: string): boolean {
  return existsSync(`${CLOSURE_FIXTURE_DIR}/${name}`);
}

// --- the dumper's own manifest ----------------------------------------------

export interface ClosureDumpEntry {
  readonly name: string;
  readonly path: string;
  readonly lines: number;
  readonly bytes: number;
  readonly sha256: string;
}

export interface ClosureManifest {
  readonly pristineFingerprint: string;
  readonly seeds: readonly number[];
  readonly selfChecks: readonly { name: string; ok: boolean; detail: string }[];
  readonly selfCheckFailures: number;
  readonly dumps: readonly ClosureDumpEntry[];
}

let cachedManifest: ClosureManifest | null = null;

export function closureManifest(): ClosureManifest {
  cachedManifest ??= JSON.parse(
    readFileSync(`${CLOSURE_FIXTURE_DIR}/manifest.json`, "utf8"),
  ) as ClosureManifest;
  return cachedManifest;
}

/**
 * Read a dump and verify it against the manifest digest before believing a byte
 * of it. A half-written or stale dump then fails loudly instead of quietly
 * weakening the comparison.
 */
export function readVerifiedDump(name: string, relPath: string): string {
  const bytes = readFileSync(`${CLOSURE_FIXTURE_DIR}/${relPath}`);
  const declared = closureManifest().dumps.find((d) => d.name === name);
  if (declared === undefined) {
    throw new Error(`closure-fixtures/manifest.json declares no dump named ${name}`);
  }
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== declared.sha256) {
    throw new Error(
      `closure-fixtures/${relPath} digest ${actual} != manifest ${declared.sha256}: the dump is ` +
        "stale or half-written",
    );
  }
  return bytes.toString("utf8");
}

// --- TSV reading -------------------------------------------------------------

/** Non-comment, non-empty lines of a `#`-commented TSV dump. */
export function* dataLines(text: string): Generator<string> {
  let start = 0;
  const n = text.length;
  while (start < n) {
    let end = text.indexOf("\n", start);
    if (end === -1) {
      end = n;
    }
    let stop = end;
    if (stop > start && text.charCodeAt(stop - 1) === 13) {
      stop -= 1;
    }
    if (stop > start && text.charCodeAt(start) !== 35 /* # */) {
      yield text.slice(start, stop);
    }
    start = end + 1;
  }
}

/** Split every data line into its tab-separated fields. */
export function tsvRows(text: string): string[][] {
  const rows: string[][] = [];
  for (const line of dataLines(text)) {
    rows.push(line.split("\t"));
  }
  return rows;
}

// --- the F1/WP8 float encoding ----------------------------------------------

const scratch = new DataView(new ArrayBuffer(8));

/** `%016x` of `Double.doubleToRawLongBits`, big-endian, so no host endianness. */
export function hexD(v: number): string {
  scratch.setFloat64(0, v);
  return (
    scratch.getUint32(0).toString(16).padStart(8, "0") +
    scratch.getUint32(4).toString(16).padStart(8, "0")
  );
}

/** Inverse of {@link hexD} — the exact double Java held, with no arithmetic. */
export function bitsToDouble(hex16: string): number {
  scratch.setUint32(0, Number.parseInt(hex16.slice(0, 8), 16));
  scratch.setUint32(4, Number.parseInt(hex16.slice(8, 16), 16));
  return scratch.getFloat64(0);
}

// --- the tree digest ---------------------------------------------------------

/**
 * Node **indices** ordered ascending by certified node **id** — Java's
 * `TreeMap<Long, Double>` iteration order over `distM`. Built once per graph;
 * ids are sparse and include the 22 synthetic negatives, so this is a real sort
 * and not the identity.
 */
export function nodeOrderByIdAscending(graph: RoutingGraph): Int32Array {
  const order = new Int32Array(graph.nodeCount);
  for (let i = 0; i < graph.nodeCount; i++) {
    order[i] = i;
  }
  const ids = graph.nodeId;
  const sorted = Array.from(order).sort((a, b) => ids[a]! - ids[b]!);
  return Int32Array.from(sorted);
}

export interface TreeDigest {
  readonly sha256: string;
  readonly reachable: number;
  readonly sourceNodeId: number;
}

/** One sampled row, as `trees-sample.tsv` writes it. */
export interface SampledTreeRow {
  readonly nodeId: number;
  readonly distHex: string;
  readonly predDirectedEdge: number;
}

/**
 * `Io.stride(n, k)` — the dumper's deterministic sample index set. Transcribed
 * because the sample rows are compared positionally; `n <= k` yields every row.
 */
export function stride(n: number, k: number): Int32Array {
  if (n <= 0) {
    return new Int32Array(0);
  }
  if (n <= k) {
    const all = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      all[i] = i;
    }
    return all;
  }
  const out = new Int32Array(k);
  for (let i = 0; i < k; i++) {
    out[i] = Math.floor((i * (n - 1)) / (k - 1));
  }
  return out;
}

/** How many stride rows `TreeCodec` writes per tree per wave state. */
export const SAMPLE_ROWS = 128;

/**
 * SHA-256 over the FULL distance+predecessor array in the canonical row form,
 * optionally collecting the same stride sample the dump ships.
 *
 * Rows are accumulated into batched strings rather than one giant buffer: at
 * 59,725 reachable nodes a tree is ~2 MB of text and there are 288 of them, so
 * the batching is what keeps the suite inside a normal heap.
 */
export function treeDigest(
  graph: RoutingGraph,
  tree: ShortestPathTree,
  order: Int32Array,
  sample?: SampledTreeRow[],
): TreeDigest {
  const hash = createHash("sha256");
  const { dist, predEdge } = tree;
  const ids = graph.nodeId;

  let reachable = 0;
  for (let i = 0; i < order.length; i++) {
    if (Number.isFinite(dist[order[i]!]!)) {
      reachable++;
    }
  }
  const pick = sample === undefined ? new Int32Array(0) : stride(reachable, SAMPLE_ROWS);

  const batch: string[] = [];
  let k = 0;
  let pi = 0;
  for (let i = 0; i < order.length; i++) {
    const node = order[i]!;
    const d = dist[node]!;
    if (!Number.isFinite(d)) {
      continue; // absent from `distM`, i.e. unreachable
    }
    const line = `${ids[node]!}\t${hexD(d)}\t${predEdge[node]!}\n`;
    batch.push(line);
    if (sample !== undefined && pi < pick.length && pick[pi] === k) {
      sample.push({ nodeId: ids[node]!, distHex: hexD(d), predDirectedEdge: predEdge[node]! });
      pi++;
    }
    k++;
    if (batch.length >= 8192) {
      hash.update(batch.join(""), "utf8");
      batch.length = 0;
    }
  }
  if (batch.length > 0) {
    hash.update(batch.join(""), "utf8");
  }
  return {
    sha256: hash.digest("hex"),
    reachable,
    sourceNodeId: ids[tree.sourceNode]!,
  };
}

/** `TreeCodec.rollup` — SHA-256 over the per-tree digests, each LF-terminated. */
export function rollup(perTreeSha: readonly string[]): string {
  const hash = createHash("sha256");
  for (const s of perTreeSha) {
    hash.update(`${s}\n`, "utf8");
  }
  return hash.digest("hex");
}
