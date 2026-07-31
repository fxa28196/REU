/**
 * assets.ts — the offline-built asset manifest.
 *
 * Plan Q5: asset SHA-256s are embedded at build time and verified at load — a
 * mismatch blocks the run rather than producing numbers from an unknown input.
 * Q8: the corrected street graph is produced by the read-only Java exporter, so
 * every asset records the source file it came from and the toolchain that built
 * it. Those provenance fields are what make `sim_id` a real replay token instead
 * of a hash of whatever happened to be in the browser cache.
 *
 * `source_file` is a repo-relative path into the read-only `Geography/` tree (or
 * a pipeline script's own output for derived assets); `source_sha256` is that
 * input's digest, so the chain input → tool → asset is auditable end to end.
 */

import { z } from "zod";

/** Schema id stamped into every generated asset manifest. */
export const ASSET_MANIFEST_SCHEMA = "reu-wildfire-shelter-abm/assets/v1" as const;

/** Lowercase hex SHA-256. Uppercase is rejected so digests compare as strings. */
export const SHA256_HEX = /^[0-9a-f]{64}$/;

const sha256 = z
  .string()
  .regex(SHA256_HEX, "expected a lowercase hex SHA-256 digest")
  .describe("Lowercase hex SHA-256 digest.");

/**
 * Versions of every tool that touched the asset, e.g.
 * `{ "node": "24.18.0", "java": "17.0.19+10", "repast": "2.11.0" }`.
 * Free-form so a new pipeline stage can record itself without a schema bump.
 */
export const ToolVersionsSchema = z
  .record(z.string(), z.string())
  .describe("Tool name → version string for every tool in this asset's build chain.");

export type ToolVersions = z.infer<typeof ToolVersionsSchema>;

export const AssetEntrySchema = z
  .strictObject({
    sha256: sha256.describe("Digest of the built asset as served."),
    bytes: z.int().min(0).describe("Byte length of the built asset as served."),
    source_file: z
      .string()
      .min(1)
      .describe("Repo-relative path of the input this asset was derived from."),
    source_sha256: sha256.describe("Digest of `source_file` at build time."),
    build_commit: z
      .string()
      .min(1)
      .describe("websim git commit that built the asset; suffix '-dirty' if the tree was dirty."),
    built_utc: z
      .string()
      .min(1)
      .describe("True UTC ISO-8601 timestamp of the build (never local time)."),
    tool_versions: ToolVersionsSchema,
  })
  .describe("One built asset and its full provenance chain.");

export type AssetEntry = z.infer<typeof AssetEntrySchema>;

export const AssetManifestSchema = z
  .strictObject({
    schema: z.literal(ASSET_MANIFEST_SCHEMA),
    built_utc: z.string().min(1).describe("True UTC timestamp of the manifest build."),
    build_commit: z.string().min(1).describe("websim git commit of the manifest build."),
    assets: z
      .record(z.string(), AssetEntrySchema)
      .describe("Asset id (stable, e.g. 'graph.bin', 'smoke.series1.bin') → entry."),
  })
  .describe("The generated asset manifest shipped alongside the build.");

export type AssetManifest = z.infer<typeof AssetManifestSchema>;

/** Validate a loaded asset manifest. Never throws. */
export function safeParseAssetManifest(
  value: unknown,
): { readonly ok: true; readonly manifest: AssetManifest } | { readonly ok: false; readonly message: string } {
  const parsed = AssetManifestSchema.safeParse(value);
  if (parsed.success) {
    return { ok: true, manifest: parsed.data };
  }
  return {
    ok: false,
    message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
  };
}

/** Asset ids in a stable order — sorted, so hashing is order-independent. */
export function assetIds(manifest: AssetManifest): readonly string[] {
  return Object.keys(manifest.assets).sort();
}

/**
 * The asset digests that feed `sim_id`, as `"<id>:<sha256>"` pairs in sorted-id
 * order. Sorting rather than trusting object key order is deliberate: two builds
 * that produced the same assets must produce the same `sim_id` regardless of the
 * order the pipeline happened to write them in.
 */
export function assetDigestList(manifest: AssetManifest): readonly string[] {
  return assetIds(manifest).map((id) => {
    const entry = manifest.assets[id];
    return `${id}:${entry === undefined ? "missing" : entry.sha256}`;
  });
}

/**
 * Verify loaded bytes against the manifest. Returns the ids that failed, which
 * the caller must treat as run-blocking (plan Q5).
 */
export function verifyAssetDigests(
  manifest: AssetManifest,
  observed: Readonly<Record<string, string>>,
): readonly string[] {
  const failures: string[] = [];
  for (const id of assetIds(manifest)) {
    const expected = manifest.assets[id]?.sha256;
    if (expected === undefined || observed[id] !== expected) {
      failures.push(id);
    }
  }
  return failures;
}
