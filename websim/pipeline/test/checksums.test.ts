import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, it } from "vitest";

import { artifactGate, describeGated } from "../../tools/artifact-gate.js";
import {
  assetsOnDisk,
  buildManifest,
  declaredAssets,
  manifestDiffIgnoringClock,
  MANIFEST_RELATIVE_PATH,
} from "../scripts/checksums.js";
import { OUT_DIR, sha256 } from "../src/asset-io.js";
import { AssetManifestSchema } from "@websim/shared/assets";

/**
 * The manifest is a load-time gate, not documentation: plan Q5 has the browser
 * verify fetched bytes against these digests and BLOCK the run on a mismatch.
 * These tests check the two properties that gate depends on — full coverage of
 * what ships, and reproducibility of everything except the timestamp.
 *
 * They are artifact-gated on the built assets, so a clean checkout does not
 * report a red it cannot fix without running the builders — but the absence is
 * announced by the shared skip-vs-fail policy (`tools/artifact-gate.ts`, plan
 * §5.3) rather than passing unremarked, and is a hard failure on a runner that
 * sets `WEBSIM_REQUIRE_ARTIFACTS`.
 *
 * ## Why the manifest is built lazily
 *
 * A skipped suite is still COLLECTED: vitest executes the `describe` callback to
 * discover the `it`s it is about to mark skipped, and that holds for
 * `describe.skip`, for `describe.runIf(false)` and for the `skip-loudly` branch
 * of `describeGated` alike. Anything that reads `pipeline/out` therefore has to
 * be deferred into the `it` bodies: a `buildManifest()` call at suite level runs
 * during collection even in the skipped case, and `buildManifest()` throws when
 * a declared asset is missing — exactly the state a clean checkout is in. That
 * made this file fail to COLLECT on a fresh clone (a red no gate can catch,
 * because the gate has already decided to skip) instead of skipping as its
 * header promises. The lazy accessor below is the fix, and the memoisation keeps
 * "reproduces byte-for-byte" comparing two builds rather than one.
 *
 * The gate itself probes every declared asset at the path the manifest builder
 * reads, and is shared by both suites so a banner names the exact file that is
 * missing rather than "the assets".
 */
const builtAssetsGate = (gate: string, suite: string, evidence: string) =>
  artifactGate({
    gate,
    suite,
    evidence,
    artifacts: declaredAssets().map((a) => ({
      source: "built-assets" as const,
      label: a.id,
      path: join(OUT_DIR, a.id),
    })),
  });

interface ManifestShape {
  schema: string;
  built_utc: string;
  build_commit: string;
  assets: Record<string, { sha256: string; bytes: number; source_file: string; source_sha256: string; build_commit: string; built_utc: string; tool_versions: Record<string, string> }>;
}

describeGated(
  builtAssetsGate(
    "pipeline:assets-manifest",
    "assets-manifest",
    "the two properties the browser's load-time digest gate rests on: that the manifest covers " +
      "every file that ships, and that a rebuild reproduces every digest byte for byte",
  ),
  () => {
  let cached: ReturnType<typeof buildManifest> | null = null;
  const build = (): ReturnType<typeof buildManifest> => (cached ??= buildManifest());
  const manifest = (): ManifestShape => build().manifest as ManifestShape;

  it("satisfies the shared contract schema", () => {
    expect(AssetManifestSchema.safeParse(manifest()).success).toBe(true);
  });

  it("carries exactly the plan's provenance fields on every asset", () => {
    for (const entry of Object.values(manifest().assets)) {
      expect(Object.keys(entry).sort()).toEqual([
        "build_commit",
        "built_utc",
        "bytes",
        "sha256",
        "source_file",
        "source_sha256",
        "tool_versions",
      ]);
      expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/u);
      expect(entry.source_sha256).toMatch(/^[0-9a-f]{64}$/u);
      expect(entry.tool_versions["node"]).toBe(process.versions.node);
    }
  });

  it("covers every file on disk under assets/, so nothing ships unverified", () => {
    expect(Object.keys(manifest().assets).sort()).toEqual(assetsOnDisk().sort());
  });

  it("records digests that match the bytes actually on disk", () => {
    for (const [id, entry] of Object.entries(manifest().assets)) {
      const bytes = readFileSync(join(OUT_DIR, id));
      expect(sha256(bytes)).toBe(entry.sha256);
      expect(bytes.length).toBe(entry.bytes);
    }
  });

  it("stamps a dirty tree as dirty rather than claiming a clean commit", () => {
    expect(manifest().build_commit).toMatch(/^(?:[0-9a-f]{40}(?:-dirty)?|unknown)$/u);
  });

  it("reproduces byte-for-byte apart from the build timestamp", () => {
    const again = buildManifest();
    expect(manifestDiffIgnoringClock(build().manifest, again.manifest)).toEqual([]);
  });

  it("reports a changed asset digest as drift rather than ignoring it", () => {
    // Mutation check: the comparison must be able to fail, or it proves nothing.
    const tampered = JSON.parse(JSON.stringify(build().manifest)) as ManifestShape;
    const first = Object.keys(tampered.assets)[0] as string;
    (tampered.assets[first] as { sha256: string }).sha256 = "0".repeat(64);
    expect(manifestDiffIgnoringClock(build().manifest, tampered)).not.toEqual([]);
  });

  it("does not list itself", () => {
    expect(Object.keys(manifest().assets)).not.toContain(MANIFEST_RELATIVE_PATH);
  });
  },
);

describeGated(
  builtAssetsGate(
    "pipeline:declared-asset-coverage",
    "declared asset coverage",
    "the check that every WP4 data asset is claimed by name and sourced from a real " +
      "Geography/-relative input",
  ),
  () => {
  it("claims every WP4 data asset by name", () => {
    const ids = declaredAssets().map((a) => a.id);
    expect(ids).toContain("assets/smoke-0.json");
    expect(ids).toContain("assets/smoke-1.json");
    expect(ids).toContain("assets/smoke-2.json");
    expect(ids).toContain("assets/registry-snapshot.json");
    expect(ids).toContain("assets/shelter-index.json");
    expect(ids.filter((id) => id.startsWith("assets/data/shelters/")).length).toBeGreaterThan(15);
    expect(ids.filter((id) => id.startsWith("assets/data/closures/"))).toHaveLength(5);
  });

  it("names a real repo-relative source file for each", () => {
    for (const a of declaredAssets()) {
      expect(a.sourceFile.startsWith("Geography/")).toBe(true);
    }
  });
  },
);
