import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { artifactGate, describeGated, gatedFixturePresent } from "../../tools/artifact-gate.js";
import { buildRealRegistrySnapshot } from "../scripts/build-registry.js";
import { buildShelterAssets } from "../scripts/build-shelters.js";
import { buildSmokeAssets } from "../scripts/build-smoke.js";
import { OUT_DIR, sha256 } from "../src/asset-io.js";

/**
 * Idempotence and byte-reproducibility, asserted the way the `--check` CLIs
 * assert them: build every asset again from the read-only inputs and require the
 * fresh bytes to equal what is on disk.
 *
 * This is the property the whole load-time digest gate rests on. If a builder
 * were non-deterministic — a timestamp in a payload, an unsorted map, a
 * locale-dependent number — the manifest digest would drift on every build and
 * the browser's verify-then-run check would either never pass or have to be
 * weakened into a no-op.
 *
 * The on-disk half is artifact-gated when the assets have not been built yet, so
 * a clean checkout does not report a red that only running the builders can
 * clear. Before this went through `tools/artifact-gate.ts` the three `it`s below
 * `continue`d past every absent file and then PASSED having asserted nothing —
 * the exact silent pass plan §5.3 forbids. Now the suite is reported as skipped
 * with a banner, an individual missing file is announced by name, and either
 * state is a hard failure under `WEBSIM_REQUIRE_ARTIFACTS`.
 */
const onDiskGate = artifactGate({
  gate: "pipeline:builders-reproduce-on-disk",
  suite: "built assets on disk match a fresh build",
  evidence:
    "the byte-reproducibility the browser's verify-then-run digest gate rests on: every smoke " +
    "series, the scenario index, every verbatim CSV copy and the registry snapshot rebuilt from " +
    "the read-only inputs and compared against the bytes actually on disk",
  // Probe the actual assets, NOT `pipeline/out` itself. `pipeline/out` is a
  // scratch root that other suites re-create (graph-asset.test.ts mkdirs
  // `out/test-tmp` during its own run), so gating on the directory made this
  // file's verdict depend on test ORDER: alone it skipped, in a full clean-clone
  // run it saw the recreated directory, decided the artifacts were present, and
  // failed three `it`s that then had nothing to read.
  artifacts: [
    { source: "built-assets", label: "assets/smoke-0.json", path: join(OUT_DIR, "assets/smoke-0.json") },
    {
      source: "built-assets",
      label: "assets/shelter-index.json",
      path: join(OUT_DIR, "assets/shelter-index.json"),
    },
    {
      source: "built-assets",
      label: "assets/registry-snapshot.json",
      path: join(OUT_DIR, "assets/registry-snapshot.json"),
    },
  ],
});

function onDisk(relativePath: string): Buffer | undefined {
  const abs = join(OUT_DIR, relativePath);
  return gatedFixturePresent(onDiskGate, {
    source: "built-assets",
    label: relativePath,
    path: abs,
  })
    ? readFileSync(abs)
    : undefined;
}

describe("builders are idempotent", () => {
  it("build-smoke: two in-memory builds are byte-identical", () => {
    const a = buildSmokeAssets();
    const b = buildSmokeAssets();
    expect(b.map((x) => sha256(x.bytes))).toEqual(a.map((x) => sha256(x.bytes)));
  });

  it("build-shelters: two in-memory builds are byte-identical", () => {
    expect(sha256(buildShelterAssets().index.bytes)).toBe(sha256(buildShelterAssets().index.bytes));
  });

  it("build-registry: two in-memory builds are byte-identical", () => {
    expect(sha256(buildRealRegistrySnapshot().bytes)).toBe(
      sha256(buildRealRegistrySnapshot().bytes),
    );
  });
});

describeGated(onDiskGate, () => {
  it("reproduces every smoke series", () => {
    let compared = 0;
    for (const b of buildSmokeAssets()) {
      const disk = onDisk(b.relativePath);
      if (disk === undefined) {
        continue;
      }
      expect(sha256(disk), `${b.relativePath} drifted`).toBe(sha256(b.bytes));
      compared++;
    }
    // The gate says the assets are there, so "compared nothing" is a failure,
    // not a pass: a test that asserts zero times proves zero things.
    expect(compared, "no smoke series was on disk to compare against").toBeGreaterThan(0);
  });

  it("reproduces the scenario index and every verbatim CSV copy", () => {
    const build = buildShelterAssets();
    let compared = 0;
    for (const copy of [...build.copies, build.index]) {
      const disk = onDisk(copy.relativePath);
      if (disk === undefined) {
        continue;
      }
      expect(sha256(disk), `${copy.relativePath} drifted`).toBe(sha256(copy.bytes));
      compared++;
    }
    expect(compared, "no shelter asset was on disk to compare against").toBeGreaterThan(0);
  });

  it("reproduces the registry snapshot", () => {
    const build = buildRealRegistrySnapshot();
    const disk = onDisk(build.relativePath);
    expect(disk, `${build.relativePath} is not on disk`).toBeDefined();
    expect(sha256(disk as Buffer)).toBe(sha256(build.bytes));
  });
});

describe("no clock, no host state, no absolute paths in an asset payload", () => {
  it("keeps every payload free of timestamps and machine paths", () => {
    // built_utc and build_commit belong in assets-manifest.json, which is the
    // provenance record. A payload carrying either would change on every build
    // and make its own digest meaningless.
    const payloads = [
      ...buildSmokeAssets().map((b) => b.bytes.toString("utf8")),
      buildShelterAssets().index.bytes.toString("utf8"),
      buildRealRegistrySnapshot().bytes.toString("utf8"),
    ];
    for (const text of payloads) {
      expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/u);
      expect(text).not.toMatch(/[A-Za-z]:\\\\/u);
      expect(text).not.toContain(OUT_DIR);
    }
  });
});
