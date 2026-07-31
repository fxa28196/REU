/**
 * Tests for the curated validation working set (plan §5.3).
 *
 * These run without the archive: they check the *definition* and the committed
 * manifest's internal consistency. The archive-backed check (do the manifest's
 * SHAs still describe the archive?) lives in `build-working-set-manifest.ts
 * --check`, which is the CI form on a machine that has the archive.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { GATE_CLASSES, uncoveredGateClasses, WORKING_SET } from "../src/archive/working-set.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_FILE = path.join(
  HERE,
  "..",
  "..",
  "validation",
  "working-set",
  "working-set.manifest.json",
);

interface ManifestEntry {
  readonly run_dir: string;
  readonly why: string;
  readonly gate_classes: readonly string[];
  readonly bytes: number;
  readonly files: readonly { file: string; bytes: number; sha256: string }[];
}
interface Manifest {
  readonly budget: {
    readonly plan_target_bytes: number;
    readonly actual_bytes: number;
    readonly run_count: number;
    readonly file_count: number;
  };
  readonly coverage: { readonly uncovered_gate_classes: readonly string[] };
  readonly entries: readonly ManifestEntry[];
}

describe("working-set definition", () => {
  it("covers every declared gate class", () => {
    expect(uncoveredGateClasses()).toEqual([]);
  });

  it("names no run twice", () => {
    const dirs = WORKING_SET.map((e) => e.runDir);
    expect(new Set(dirs).size).toBe(dirs.length);
  });

  it("gives every run a non-trivial rationale — the set is an argument, not a list", () => {
    for (const entry of WORKING_SET) {
      expect(entry.why.length, entry.runDir).toBeGreaterThan(60);
      expect(entry.gateClasses.length, entry.runDir).toBeGreaterThan(0);
    }
  });

  it("references only gate classes that exist", () => {
    const known = new Set(Object.keys(GATE_CLASSES));
    for (const entry of WORKING_SET) {
      for (const g of entry.gateClasses) {
        expect(known.has(g), `${entry.runDir} -> ${g}`).toBe(true);
      }
    }
  });

  it("detects a coverage hole when one is introduced", () => {
    // Anti-vacuity: drop the only Phase-E run and the (f)/(h) classes must open up.
    const trimmed = WORKING_SET.filter((e) => !e.runDir.startsWith("phase-e/"));
    expect(uncoveredGateClasses(trimmed)).toContain("f-wachinger-acceptance");
    expect(uncoveredGateClasses(trimmed)).toContain("h-manifest-21-e-params");
  });
});

describe("working-set manifest", () => {
  const present = existsSync(MANIFEST_FILE);
  const manifest: Manifest | null = present
    ? (JSON.parse(readFileSync(MANIFEST_FILE, "utf8")) as Manifest)
    : null;

  it("is committed", () => {
    expect(present, `expected a manifest at ${MANIFEST_FILE}`).toBe(true);
  });

  it("lists exactly the runs the definition names, with the same rationale", () => {
    const m = manifest as Manifest;
    expect(m.entries.map((e) => e.run_dir)).toEqual(WORKING_SET.map((e) => e.runDir));
    for (const [i, entry] of m.entries.entries()) {
      expect(entry.why).toBe(WORKING_SET[i]?.why);
      expect(entry.gate_classes).toEqual(WORKING_SET[i]?.gateClasses);
    }
  });

  it("fits the ~40 MB budget and reports no uncovered gate class", () => {
    const m = manifest as Manifest;
    expect(m.budget.actual_bytes).toBeLessThanOrEqual(m.budget.plan_target_bytes);
    expect(m.coverage.uncovered_gate_classes).toEqual([]);
  });

  it("carries a byte length and a SHA-256 for every file it claims", () => {
    const m = manifest as Manifest;
    let files = 0;
    for (const entry of m.entries) {
      const sum = entry.files.reduce((acc, f) => acc + f.bytes, 0);
      expect(sum, entry.run_dir).toBe(entry.bytes);
      for (const f of entry.files) {
        expect(f.sha256, `${entry.run_dir}/${f.file}`).toMatch(/^[0-9a-f]{64}$/u);
        expect(f.bytes).toBeGreaterThan(0);
        files += 1;
      }
    }
    expect(files).toBe(m.budget.file_count);
    expect(m.entries.length).toBe(m.budget.run_count);
    expect(m.entries.reduce((a, e) => a + e.bytes, 0)).toBe(m.budget.actual_bytes);
  });

  it("does not commit the payload it describes", () => {
    const dataDir = path.join(path.dirname(MANIFEST_FILE), "data");
    const gitignore = readFileSync(
      path.join(HERE, "..", "..", ".gitignore"),
      "utf8",
    );
    expect(gitignore).toContain("validation/working-set/data/");
    if (existsSync(dataDir)) {
      // A local copy is fine; it just must be the ignored one.
      expect(gitignore).toContain("validation/working-set/data/");
    }
  });
});
