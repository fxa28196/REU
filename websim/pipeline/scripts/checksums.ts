/**
 * checksums.ts — WP4(d). Emit `assets-manifest.json`: one row per built asset
 * carrying `{sha256, bytes, source_file, source_sha256, build_commit,
 * built_utc, tool_versions}` (plan §4 header).
 *
 *   npx tsx pipeline/scripts/checksums.ts          # write
 *   npx tsx pipeline/scripts/checksums.ts --check  # verify, exit 1 on drift
 *
 * The manifest is the load-time gate, not documentation: plan Q5 has the browser
 * verify fetched bytes against these digests with SubtleCrypto and BLOCK the run
 * on a mismatch. That only works if two properties hold, and this script asserts
 * both rather than assuming them:
 *
 *   1. **Every shipped asset is accounted for.** The expected id set comes from
 *      the builders themselves, so an asset on disk that no builder claims — a
 *      leftover from a renamed output, say — fails the build instead of shipping
 *      unverified. A claimed asset that is missing fails too.
 *   2. **The manifest is reproducible.** Asset digests are pure functions of the
 *      read-only inputs. The only clock-derived field in the file is `built_utc`,
 *      pinnable with `SOURCE_DATE_EPOCH`; `--check` compares everything else
 *      exactly and reports a digest change as drift.
 *
 * The result is validated against `AssetManifestSchema` from the contract plane
 * before it is written, so the pipeline and the browser cannot disagree about
 * the shape of the thing the run depends on.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { AssetManifestSchema, ASSET_MANIFEST_SCHEMA } from "@websim/shared/assets";

import {
  buildCommit,
  builtUtc,
  checkMode,
  failBuild,
  geographyPath,
  OUT_DIR,
  sha256,
  sha256File,
  toJsonBytes,
  toolVersions,
  writeAsset,
} from "../src/asset-io.js";
import { registryManifestInputs } from "./build-registry.js";
import { shelterManifestInputs } from "./build-shelters.js";
import { smokeManifestInputs } from "./build-smoke.js";

/** Manifest lives beside the assets it describes and is never listed in itself. */
export const MANIFEST_RELATIVE_PATH = "assets/assets-manifest.json";

/** Root under `pipeline/out` that holds published assets. */
const ASSETS_ROOT = "assets";

export interface ManifestInput {
  /** Asset id = path under `pipeline/out`, POSIX-separated. */
  readonly id: string;
  /** Repo-relative path of the input this asset derives from. */
  readonly sourceFile: string;
  /** Builder that produced it, recorded in `tool_versions.builder`. */
  readonly builder: string;
}

/** The union of every WP4 data builder's declared outputs, sorted by id. */
export function declaredAssets(): ManifestInput[] {
  const inputs: ManifestInput[] = [
    ...smokeManifestInputs().map((i) => ({ ...i, builder: "build-smoke" })),
    ...shelterManifestInputs().map((i) => ({ ...i, builder: "build-shelters" })),
    ...registryManifestInputs().map((i) => ({ ...i, builder: "build-registry" })),
  ];
  inputs.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return inputs;
}

/**
 * Assets built by a sibling package rather than by the three data builders
 * above. The graph family comes out of the read-only Java exporter →
 * `pack-graph.ts` chain (plan Q8), whose certified input is the RLIS shapefile;
 * it is registered by pattern so this script neither imports that builder nor
 * silently ships its output unverified. Anything under `assets/` matching no
 * declared id and no rule fails the build with instructions.
 */
const EXTERNAL_ASSET_RULES: readonly {
  readonly match: RegExp;
  readonly sourceFile: string;
  readonly builder: string;
}[] = [
  {
    match: /^assets\/graph-/u,
    sourceFile: "Geography/data/Streets.shp",
    builder: "java-exporter+pack-graph",
  },
  {
    match: /^assets\/encampments/u,
    sourceFile: "Geography/data/encampments/irp_campsite_reports_sample.csv",
    builder: "build-encampments",
  },
  {
    match: /^assets\/presets\//u,
    sourceFile: "websim/shared/src/presets/definitions.ts",
    builder: "build-presets",
  },
];

/** Asset ids actually present under `pipeline/out/assets`, excluding the manifest. */
export function assetsOnDisk(): string[] {
  const root = join(OUT_DIR, ASSETS_ROOT);
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir).sort()) {
      const abs = join(dir, name);
      if (statSync(abs).isDirectory()) {
        walk(abs);
      } else {
        found.push(relative(OUT_DIR, abs).split(sep).join("/"));
      }
    }
  };
  try {
    walk(root);
  } catch {
    return [];
  }
  return found.filter((id) => id !== MANIFEST_RELATIVE_PATH);
}

export interface ManifestBuild {
  readonly bytes: Buffer;
  readonly assetCount: number;
  readonly manifest: unknown;
}

/**
 * Source digests are memoised per build: the graph family all derives from the
 * 51.7 MB shapefile, and hashing it once per asset would dominate the run for no
 * information gain.
 */
function memoisedSourceDigest(): (repoRelative: string) => string {
  const cache = new Map<string, string>();
  return (repoRelative: string): string => {
    const hit = cache.get(repoRelative);
    if (hit !== undefined) {
      return hit;
    }
    const digest = sha256File(geographyPath(repoRelative));
    cache.set(repoRelative, digest);
    return digest;
  };
}

/**
 * Build the manifest from what is on disk, cross-checked against what the
 * builders claim. Throws on any mismatch — an unexplained asset is a defect, not
 * something to hash and forget.
 */
export function buildManifest(): ManifestBuild {
  const declared = declaredAssets();
  const declaredById = new Map(declared.map((e) => [e.id, e]));
  const present = assetsOnDisk();
  const presentSet = new Set(present);

  const missing = declared.map((e) => e.id).filter((id) => !presentSet.has(id));
  if (missing.length > 0) {
    throw new Error(
      `${missing.length} claimed asset(s) missing from pipeline/out — run the builders first: ${missing.join(", ")}`,
    );
  }

  const entries: ManifestInput[] = [];
  const unregistered: string[] = [];
  for (const id of present) {
    const own = declaredById.get(id);
    if (own !== undefined) {
      entries.push(own);
      continue;
    }
    const rule = EXTERNAL_ASSET_RULES.find((r) => r.match.test(id));
    if (rule === undefined) {
      unregistered.push(id);
      continue;
    }
    entries.push({ id, sourceFile: rule.sourceFile, builder: rule.builder });
  }
  if (unregistered.length > 0) {
    throw new Error(
      `${unregistered.length} asset(s) under pipeline/out/assets that no builder claims — they ` +
        `would ship unverified. Register them in checksums.ts or remove them: ${unregistered.join(", ")}`,
    );
  }
  entries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const commit = buildCommit();
  const stamp = builtUtc();
  const sourceDigest = memoisedSourceDigest();
  const assets: Record<string, unknown> = {};
  for (const entry of entries) {
    const bytes = readFileSync(join(OUT_DIR, entry.id));
    assets[entry.id] = {
      sha256: sha256(bytes),
      bytes: bytes.length,
      source_file: entry.sourceFile,
      source_sha256: sourceDigest(entry.sourceFile),
      build_commit: commit,
      built_utc: stamp,
      tool_versions: toolVersions(entry.builder),
    };
  }

  const manifest = {
    schema: ASSET_MANIFEST_SCHEMA,
    built_utc: stamp,
    build_commit: commit,
    assets,
  };

  const parsed = AssetManifestSchema.safeParse(manifest);
  if (!parsed.success) {
    throw new Error(
      `manifest fails the shared contract schema: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }

  return { bytes: toJsonBytes(manifest), assetCount: entries.length, manifest };
}

/**
 * Compare two manifests ignoring the clock. `built_utc` moves on every build by
 * design; a digest that moves is the finding.
 */
export function manifestDiffIgnoringClock(a: unknown, b: unknown): string[] {
  const strip = (m: unknown): unknown => {
    const o = JSON.parse(JSON.stringify(m)) as {
      built_utc?: unknown;
      assets?: Record<string, Record<string, unknown>>;
    };
    delete o.built_utc;
    for (const entry of Object.values(o.assets ?? {})) {
      delete entry["built_utc"];
    }
    return o;
  };
  const left = JSON.stringify(strip(a));
  const right = JSON.stringify(strip(b));
  return left === right ? [] : ["manifest differs beyond built_utc"];
}

function main(): void {
  const check = checkMode();
  let build: ManifestBuild;
  try {
    build = buildManifest();
  } catch (e) {
    return failBuild(`checksums: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (check) {
    let onDisk: unknown;
    try {
      onDisk = JSON.parse(readFileSync(join(OUT_DIR, MANIFEST_RELATIVE_PATH), "utf8"));
    } catch {
      return failBuild(`checksums: ${MANIFEST_RELATIVE_PATH} is missing — run without --check.`);
    }
    const diff = manifestDiffIgnoringClock(onDisk, build.manifest);
    if (diff.length > 0) {
      return failBuild(`checksums: ${diff.join("; ")} — an asset digest changed.`);
    }
    process.stdout.write(`ok       ${MANIFEST_RELATIVE_PATH}  ${build.assetCount} asset(s)\n`);
    return;
  }

  const r = writeAsset(MANIFEST_RELATIVE_PATH, build.bytes, false);
  process.stdout.write(`wrote    ${r.id}  ${build.assetCount} asset(s), ${r.bytes} bytes\n`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
