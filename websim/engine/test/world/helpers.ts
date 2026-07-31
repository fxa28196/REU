/**
 * Fixture plumbing for the WP6 world tests.
 *
 * Same two-tier arrangement WP5 established: the bulk oracle lives under the
 * git-ignored `pipeline/out/`, and a stride-sampled slice of it is committed, so
 * a clean checkout still has a real (if partial) oracle. Every parity test goes
 * through the shared skip-vs-fail policy in `tools/artifact-gate.ts` (plan
 * §5.3), so an absent oracle is announced and attributed rather than silently
 * dropped; the always-green cover is the synthetic unit suite.
 */

import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import type { ArtifactRef } from "../../../tools/artifact-gate.js";
import { decodeCsvBytes, readCsvText, type CsvRow } from "../../src/loader/csv.js";
import type { WorldDataSource } from "../../src/world/build.js";

const here = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url));

export const ASSET_DIR = here("../../../pipeline/out/assets");
export const WORLD_FIXTURE_DIR = here("../../../pipeline/out/world-fixtures");
export const COMMITTED_FIXTURE_DIR = here("../fixtures/world");
export const GEOGRAPHY_DIR = here("../../../../Geography");

/** Artifact refs the WP6 gates are declared from — probed paths, named once. */
export const GRAPH_TOPOLOGY_REF: ArtifactRef = {
  source: "graph-asset",
  label: "topology",
  path: `${ASSET_DIR}/graph-topology.bin`,
};

export const WORLD_DUMP_REF: ArtifactRef = {
  source: "world-fixtures",
  label: "world/A-seed42.tsv",
  path: `${WORLD_FIXTURE_DIR}/world/A-seed42.tsv`,
};

export const GEOGRAPHY_SHELTERS_REF: ArtifactRef = {
  source: "geography",
  label: "shelters_2026_current_placement.csv",
  path: `${GEOGRAPHY_DIR}/data/shelters/shelters_2026_current_placement.csv`,
};

export function assetsPresent(): boolean {
  return existsSync(GRAPH_TOPOLOGY_REF.path);
}

export function worldFixturesPresent(): boolean {
  return existsSync(WORLD_DUMP_REF.path);
}

/**
 * A {@link WorldDataSource} over the read-only `Geography/` tree, parsing through
 * the ported `CsvLoader` — the same parser the browser build uses, so a loader
 * quirk cannot be masked by a friendlier test-only reader.
 */
export function geographyDataSource(): WorldDataSource {
  const cache = new Map<string, readonly CsvRow[]>();
  return {
    exists(path: string): boolean {
      return existsSync(`${GEOGRAPHY_DIR}/${path}`);
    },
    readCsv(path: string): readonly CsvRow[] {
      const hit = cache.get(path);
      if (hit !== undefined) {
        return hit;
      }
      const rows = readCsvText(decodeCsvBytes(readFileSync(`${GEOGRAPHY_DIR}/${path}`)));
      cache.set(path, rows);
      return rows;
    },
  };
}

export function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

// --- IEEE-754 hex, the F1 float encoding ------------------------------------

const bitsBuf = new ArrayBuffer(8);
const bitsU64 = new BigUint64Array(bitsBuf);
const bitsF64 = new Float64Array(bitsBuf);

export function bitsToDouble(hex16: string): number {
  bitsU64[0] = BigInt(`0x${hex16}`);
  return bitsF64[0]!;
}

export function doubleToBits(v: number): string {
  bitsF64[0] = v;
  return bitsU64[0]!.toString(16).padStart(16, "0");
}

/** Iterate the non-comment, non-empty lines of a TSV dump. */
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

/** The `# key=value` header lines the exporter writes above each dump. */
export function headerFields(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of text.split("\n")) {
    if (!line.startsWith("#")) {
      break;
    }
    for (const cell of line.slice(1).split("\t")) {
      const eq = cell.indexOf("=");
      if (eq > 0) {
        out.set(cell.slice(0, eq).trim(), cell.slice(eq + 1).trim());
      }
    }
  }
  return out;
}

export interface ManifestDump {
  readonly name: string;
  readonly path: string;
  readonly lines: number;
  readonly bytes: number;
  readonly sha256: string;
}

export interface ManifestConfig {
  readonly id: string;
  readonly scenarioCode: number;
  readonly scenarioName: string;
  readonly sheltersCsv: string;
  readonly smokeCsv: string;
  readonly closuresCsv: string | null;
  readonly numAgents: number;
  readonly simulationHours: number;
  readonly smokeSlices: number;
  readonly endHours: number;
  readonly endTick: number;
  readonly triageReserveFraction: number;
  readonly enableDecisionLayer: number;
  readonly shelterPolicyVariant: number;
  readonly closureEdgesScheduled: number;
  readonly closureEdgesMatchingGraph: number;
  readonly closureWaves: number;
}

export interface WorldManifest {
  readonly graphCensus: Record<string, number>;
  readonly configs: readonly ManifestConfig[];
  readonly dumps: readonly ManifestDump[];
}

let cachedManifest: WorldManifest | null = null;

export function worldManifest(): WorldManifest {
  cachedManifest ??= JSON.parse(
    readFileSync(`${COMMITTED_FIXTURE_DIR}/manifest.json`, "utf8"),
  ) as WorldManifest;
  return cachedManifest;
}

/** Read a bulk fixture and verify its digest against the committed manifest. */
export function readVerifiedFixture(relPath: string, manifestName: string): string {
  const bytes = readFileSync(`${WORLD_FIXTURE_DIR}/${relPath}`);
  const declared = worldManifest().dumps.find((d) => d.name === manifestName);
  if (declared === undefined) {
    throw new Error(`manifest has no dump named ${manifestName}`);
  }
  const got = sha256(bytes);
  if (got !== declared.sha256) {
    throw new Error(
      `${relPath} digest ${got} != manifest ${declared.sha256} — the dump is stale or partial`,
    );
  }
  return bytes.toString("utf8");
}
