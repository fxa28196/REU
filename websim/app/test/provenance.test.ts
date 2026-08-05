/**
 * Tests for `src/provenance/registry.ts` (WP12b) — pure, Node-only, no DOM.
 *
 * Two layers:
 *
 *  1. **Synthetic fixtures** exercise every pure function: the registry
 *     snapshot parse and its row-vs-summary cross-checks (a snapshot whose
 *     embedded census disagrees with its own rows is REFUSED), the verified
 *     load path (absent from the manifest → honest "not-built"; digest
 *     mismatch → throw naming the asset id and both digests), evidence-class
 *     grouping, the blocking filter, archive grouping/lineage, the
 *     replay-preset exact-run_dir match, and the red gates-failed line.
 *
 *  2. **The real shipped assets** (artifact-gated through the shared
 *     skip-vs-fail policy — `pipeline/out/` is git-ignored and absent on a
 *     clean clone): the shipped registry snapshot must pass the display
 *     cross-checks with its known censuses, and every bundle offered a
 *     "Replay in browser" preset must be reproduced by that preset at the
 *     bundle's own seed.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { AssetManifest } from "@websim/shared/assets";
import type { GraphCensus, GraphCorrection } from "@websim/shared/graph-asset";
import { PRESET_DEFINITIONS, materialisePreset } from "@websim/shared/presets/definitions";

import { artifactGate, describeGated } from "../../tools/artifact-gate.js";
import { parseArchiveIndex, sha256Hex } from "../src/assets/loader.js";
import type { ArchiveBundleEntry } from "../src/assets/loader.js";
import {
  EVIDENCE_CLASS_ORDER,
  REGISTRY_NOT_BUILT_MESSAGE,
  REGISTRY_SNAPSHOT_ID,
  blockingAssumptions,
  bundleGatesFailedLine,
  bundleLineage,
  formatBytes,
  gateRows,
  graphCorrectionsView,
  groupBundlesByFamily,
  groupVariablesByEvidenceClass,
  loadRegistrySnapshot,
  manifestRows,
  parseRegistrySnapshot,
  replayPresetFor,
} from "../src/provenance/registry.js";

const encoder = new TextEncoder();

// ---------------------------------------------------------------------------
// synthetic registry snapshot fixture (mirrors the real asset's shape)
// ---------------------------------------------------------------------------

const SNAPSHOT_FIXTURE = {
  schema: "reu-wildfire-shelter-abm/registry-snapshot/v1",
  gate: "validation ran at build time and PASSED",
  gate_scope: "vocabularies and id checks; DOI resolvability is NOT checked.",
  variables_path: "Geography/data/registry/variables.csv",
  variables_sha256: "a".repeat(64),
  assumptions_path: "Geography/data/registry/assumptions.csv",
  assumptions_sha256: "b".repeat(64),
  variable_count: 3,
  assumption_count: 2,
  evidence_class_census: { M: 1, L: 1, C: 0, A: 1, F: 0 },
  assumption_class_census: { measured: 0, literature: 0, calibrated: 0, assumption: 2, future_work: 0 },
  placeholder_variable_ids: ["V2"],
  placeholder_note: "placeholder variables are present but inert",
  blocking_assumption_ids: ["A-02"],
  summary_line: "[ScienceRegistry] 3 variables {M=1, L=1, C=0, A=1, F=0}, 2 assumptions; 1 placeholder variable(s), 1 blocking assumption(s)",
  variables: [
    { variable_id: "V1", name: "alpha", evidence_class: "M", status: "implemented", doi_or_dataset: "dataset:x", uncertainty: "none" },
    { variable_id: "V2", name: "beta", evidence_class: "L", status: "placeholder", doi_or_dataset: "dataset:y", uncertainty: "0.1-0.3" },
    { variable_id: "V3", name: "gamma", evidence_class: "A", status: "implemented", doi_or_dataset: "none", uncertainty: "none" },
  ],
  assumptions: [
    { assumption_id: "A-01", statement: "first statement", classification: "assumption", status: "active" },
    { assumption_id: "A-02", statement: "second statement", classification: "assumption", status: "blocking" },
  ],
};

/** A deep, mutable copy for the mutation cases. */
function mutableSnapshot(): Record<string, unknown> {
  return structuredClone(SNAPSHOT_FIXTURE) as unknown as Record<string, unknown>;
}

describe("parseRegistrySnapshot", () => {
  it("accepts the well-formed fixture and returns its rows verbatim", () => {
    const snapshot = parseRegistrySnapshot(SNAPSHOT_FIXTURE);
    expect(snapshot.variable_count).toBe(3);
    expect(snapshot.assumption_count).toBe(2);
    expect(snapshot.variables.map((v) => v.variable_id)).toEqual(["V1", "V2", "V3"]);
    expect(snapshot.assumptions.map((a) => a.assumption_id)).toEqual(["A-01", "A-02"]);
    expect(snapshot.summary_line).toContain("3 variables");
  });

  it("rejects a non-object and a wrong schema", () => {
    expect(() => parseRegistrySnapshot(null)).toThrow(/not a JSON object/);
    const wrong = mutableSnapshot();
    wrong["schema"] = "something/else";
    expect(() => parseRegistrySnapshot(wrong)).toThrow(/schema 'something\/else'/);
  });

  it("rejects a variable_count that disagrees with the rows", () => {
    const bad = mutableSnapshot();
    bad["variable_count"] = 4;
    expect(() => parseRegistrySnapshot(bad)).toThrow(/variable_count 4 != 3/);
  });

  it("rejects an evidence-class census that disagrees with the rows", () => {
    const bad = mutableSnapshot();
    bad["evidence_class_census"] = { M: 2, L: 0, C: 0, A: 1, F: 0 };
    expect(() => parseRegistrySnapshot(bad)).toThrow(/evidence_class_census\.M is 2 but 1 row/);
  });

  it("rejects placeholder/blocking id lists that disagree with the rows", () => {
    const badPlaceholder = mutableSnapshot();
    badPlaceholder["placeholder_variable_ids"] = [];
    expect(() => parseRegistrySnapshot(badPlaceholder)).toThrow(/placeholder_variable_ids disagrees/);

    const badBlocking = mutableSnapshot();
    badBlocking["blocking_assumption_ids"] = ["A-01", "A-02"];
    expect(() => parseRegistrySnapshot(badBlocking)).toThrow(/blocking_assumption_ids disagrees/);
  });

  it("rejects a malformed variable row", () => {
    const bad = mutableSnapshot();
    (bad["variables"] as Record<string, unknown>[])[1]!["doi_or_dataset"] = 7;
    expect(() => parseRegistrySnapshot(bad)).toThrow(/variables\[1\].*doi_or_dataset/);
  });
});

// ---------------------------------------------------------------------------
// verified load path
// ---------------------------------------------------------------------------

function manifestEntry(sha256: string, bytes: number): AssetManifest["assets"][string] {
  return {
    sha256,
    bytes,
    source_file: "Geography/data/registry/variables.csv",
    source_sha256: "0".repeat(64),
    build_commit: "fixture",
    built_utc: "2026-01-01T00:00:00Z",
    tool_versions: { node: "fixture" },
  };
}

function manifestWith(assets: AssetManifest["assets"]): AssetManifest {
  return {
    schema: "reu-wildfire-shelter-abm/assets/v1",
    built_utc: "2026-01-01T00:00:00Z",
    build_commit: "fixture",
    assets,
  };
}

describe("loadRegistrySnapshot", () => {
  const snapshotBytes = encoder.encode(JSON.stringify(SNAPSHOT_FIXTURE));

  it("returns the honest not-built state when the manifest has no entry", async () => {
    const result = await loadRegistrySnapshot(manifestWith({}), () => {
      throw new Error("must not fetch when the asset is not in the manifest");
    });
    expect(result.state).toBe("not-built");
    if (result.state === "not-built") {
      expect(result.message).toBe(REGISTRY_NOT_BUILT_MESSAGE);
      expect(result.message).toContain("no registry contents are invented");
    }
  });

  it("loads and cross-checks a digest-verified snapshot", async () => {
    const digest = await sha256Hex(snapshotBytes);
    const manifest = manifestWith({ [REGISTRY_SNAPSHOT_ID]: manifestEntry(digest, snapshotBytes.length) });
    const fetched: string[] = [];
    const result = await loadRegistrySnapshot(manifest, (id) => {
      fetched.push(id);
      return Promise.resolve(snapshotBytes.buffer.slice(0) as ArrayBuffer);
    });
    expect(fetched).toEqual([REGISTRY_SNAPSHOT_ID]);
    expect(result.state).toBe("loaded");
    if (result.state === "loaded") {
      expect(result.snapshot.variable_count).toBe(3);
    }
  });

  it("throws on a digest mismatch, naming the asset id and both digests", async () => {
    const digest = await sha256Hex(snapshotBytes);
    const manifest = manifestWith({ [REGISTRY_SNAPSHOT_ID]: manifestEntry(digest, snapshotBytes.length) });
    const corrupted = encoder.encode(JSON.stringify({ ...SNAPSHOT_FIXTURE, gate: "tampered" }));
    await expect(
      loadRegistrySnapshot(manifest, () => Promise.resolve(corrupted.buffer.slice(0) as ArrayBuffer)),
    ).rejects.toThrow(new RegExp(`${REGISTRY_SNAPSHOT_ID}.*${digest}`));
  });
});

// ---------------------------------------------------------------------------
// registry grouping
// ---------------------------------------------------------------------------

describe("groupVariablesByEvidenceClass", () => {
  const snapshot = parseRegistrySnapshot(SNAPSHOT_FIXTURE);

  it("returns the five classes in fixed M, L, C, A, F order, empties included", () => {
    const groups = groupVariablesByEvidenceClass(snapshot.variables);
    expect(groups.map((g) => g.evidenceClass)).toEqual([...EVIDENCE_CLASS_ORDER]);
    expect(groups.map((g) => g.variables.length)).toEqual([1, 1, 0, 1, 0]);
  });

  it("preserves row order within a class and labels every class", () => {
    const groups = groupVariablesByEvidenceClass(snapshot.variables);
    expect(groups[0]!.variables[0]!.variable_id).toBe("V1");
    for (const g of groups) {
      expect(g.label).toContain(g.evidenceClass);
    }
  });
});

describe("blockingAssumptions", () => {
  it("filters to status 'blocking' in row order", () => {
    const snapshot = parseRegistrySnapshot(SNAPSHOT_FIXTURE);
    expect(blockingAssumptions(snapshot.assumptions).map((a) => a.assumption_id)).toEqual(["A-02"]);
  });
});

// ---------------------------------------------------------------------------
// manifest rows
// ---------------------------------------------------------------------------

describe("manifestRows", () => {
  it("renders every entry in sorted-id order with digest, size and source", () => {
    const manifest = manifestWith({
      "assets/zzz.bin": manifestEntry("f".repeat(64), 10),
      "assets/aaa.json": manifestEntry("e".repeat(64), 20),
    });
    const rows = manifestRows(manifest);
    expect(rows.map((r) => r.id)).toEqual(["assets/aaa.json", "assets/zzz.bin"]);
    expect(rows[0]!.sha256).toBe("e".repeat(64));
    expect(rows[0]!.bytes).toBe(20);
    expect(rows[0]!.sourceFile).toBe("Geography/data/registry/variables.csv");
  });
});

// ---------------------------------------------------------------------------
// graph correction census
// ---------------------------------------------------------------------------

const CENSUS_FIXTURE: GraphCensus = {
  features: 10,
  attr_node_ids: 8,
  final_graph_nodes: 9,
  affected_attr_node_ids: 2,
  sites_reattached: 1,
  sites_split_synthetic: 1,
  impossible_edges_after_fix: 0,
  components: 2,
  largest_component_nodes: 7,
  undirected_street_edges: 12,
  directed_edge_records: 24,
  node_ids_negative: 1,
  max_degree: 4,
  polyline_vertices_total: 30,
};

const CORRECTIONS_FIXTURE: readonly GraphCorrection[] = [
  {
    kind: "REATTACHED",
    attr_node_id: 5001,
    graph_node_id: 42,
    dist_from_primary_m: 11.9,
    lon: -122.6,
    lat: 45.5,
    claims: 3,
    first_feature: "f-1",
  },
  {
    kind: "SPLIT",
    attr_node_id: 5002,
    graph_node_id: -1001,
    dist_from_primary_m: 3.2,
    lon: -122.7,
    lat: 45.6,
    claims: 2,
    first_feature: "f-2",
  },
];

describe("graphCorrectionsView", () => {
  it("splits records by kind and reports the max post-correction distance", () => {
    const view = graphCorrectionsView(CENSUS_FIXTURE, CORRECTIONS_FIXTURE);
    expect(view.reattached).toHaveLength(1);
    expect(view.split).toHaveLength(1);
    expect(view.maxDistFromPrimaryM).toBe(11.9);
    const byLabel = new Map(view.facts.map((f) => [f.label, f.value]));
    expect(byLabel.get("Corrupt-ID sites reattached")).toBe("1");
    expect(byLabel.get("Corrupt-ID sites split (synthetic nodes)")).toBe("1");
    expect(byLabel.get("Impossible edges after correction")).toBe("0");
    expect(byLabel.get("Max distance from primary node after correction (m)")).toBe("11.9");
  });

  it("refuses a census that disagrees with the correction records", () => {
    expect(() =>
      graphCorrectionsView({ ...CENSUS_FIXTURE, sites_reattached: 2 }, CORRECTIONS_FIXTURE),
    ).toThrow(/sites_reattached 2 != 1/);
    expect(() =>
      graphCorrectionsView({ ...CENSUS_FIXTURE, sites_split_synthetic: 0 }, CORRECTIONS_FIXTURE),
    ).toThrow(/sites_split_synthetic 0 != 1/);
  });
});

// ---------------------------------------------------------------------------
// archive helpers
// ---------------------------------------------------------------------------

function entry(overrides: Partial<ArchiveBundleEntry>): ArchiveBundleEntry {
  return {
    bundle_id: "x",
    run_dir: "x",
    preset_family: "A",
    seed: 42,
    file: "x.json",
    bytes: 100,
    sha256: "c".repeat(64),
    has_per_agent: true,
    gates_failed: [],
    ...overrides,
  };
}

describe("groupBundlesByFamily", () => {
  it("groups in first-appearance family order, bundles in index order", () => {
    const groups = groupBundlesByFamily([
      entry({ bundle_id: "b1", preset_family: "B" }),
      entry({ bundle_id: "a1", preset_family: "A" }),
      entry({ bundle_id: "b2", preset_family: "B" }),
    ]);
    expect(groups.map((g) => g.family)).toEqual(["B", "A"]);
    expect(groups[0]!.bundles.map((b) => b.bundle_id)).toEqual(["b1", "b2"]);
  });
});

describe("replayPresetFor", () => {
  it("matches the exact archived run_dir a preset diffs clean against", () => {
    expect(replayPresetFor("present-day-three-arm/A-seed42")?.id).toBe("A_present_day");
    expect(replayPresetFor("scenario-e/E0null-B-seed42")?.id).toBe("E0_null_B");
  });

  it("never offers a preset for a sibling seed or an unknown run", () => {
    // The arm-A preset reproduces A-seed42 only; the seed-43 bundle is a
    // different configuration and MUST NOT get a replay button.
    expect(replayPresetFor("present-day-three-arm/A-seed43")).toBeNull();
    expect(replayPresetFor("no-such-run-dir")).toBeNull();
  });
});

describe("bundleLineage", () => {
  it("extracts the provenance block of a real-shaped bundle", () => {
    const lineage = bundleLineage({
      scenario: "A_present_day_reality",
      archive: { run_dir: "present-day-three-arm/A-seed42" },
      provenance: {
        manifest_schema: "reu-wildfire-shelter-abm/simulation/v1",
        sim_id: "sim-20260728-205250-seed42",
        git_commit: "deddfcad568321490c5bfe254a783d448cb3e1a8",
        data_version_tag: "bdce237a6a6a",
        generated_utc: "2026-07-28T20:53:47",
        generated_utc_note: "Local time, not UTC, in the v1 Java writer",
        java_version: "17.0.19",
        repast_version: "2.11.0",
        git_working_tree_dirty: false,
      },
    });
    expect(lineage.gitCommit).toBe("deddfcad568321490c5bfe254a783d448cb3e1a8");
    expect(lineage.dataVersionTag).toBe("bdce237a6a6a");
    expect(lineage.workingTreeDirty).toBe(false);
    expect(lineage.runDir).toBe("present-day-three-arm/A-seed42");
    expect(lineage.scenario).toBe("A_present_day_reality");
  });

  it("returns nulls — never fabricated values — for missing or malformed fields", () => {
    const empty = bundleLineage(null);
    expect(empty.gitCommit).toBeNull();
    expect(empty.dataVersionTag).toBeNull();
    expect(empty.workingTreeDirty).toBeNull();
    const partial = bundleLineage({ provenance: { git_commit: 123 } });
    expect(partial.gitCommit).toBeNull();
  });
});

describe("gateRows", () => {
  it("parses a well-formed gates block", () => {
    const rows = gateRows({ gates: [{ id: "b_bed_sum_4way", ok: true, detail: "sum=2060" }] });
    expect(rows).toEqual([{ id: "b_bed_sum_4way", ok: true, detail: "sum=2060" }]);
  });

  it("returns null for a missing or malformed block — never a fabricated list", () => {
    expect(gateRows({})).toBeNull();
    expect(gateRows(null)).toBeNull();
    expect(gateRows({ gates: [{ id: "x", ok: "yes", detail: "" }] })).toBeNull();
  });
});

describe("bundleGatesFailedLine", () => {
  it("is null when no gates failed", () => {
    expect(bundleGatesFailedLine(entry({ gates_failed: [] }))).toBeNull();
  });

  it("names every failed gate (the red line the Archive screen must render)", () => {
    expect(bundleGatesFailedLine(entry({ gates_failed: ["j_smoke", "k_closures"] }))).toBe(
      "Gates failed: j_smoke, k_closures",
    );
  });
});

describe("formatBytes", () => {
  it("formats exact bytes below 1 KiB and one decimal above", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(15240)).toBe("14.9 KiB");
    expect(formatBytes(2.5 * 1024 * 1024)).toBe("2.5 MiB");
    expect(formatBytes(Number.NaN)).toBe("—");
    expect(formatBytes(-1)).toBe("—");
  });
});

// ---------------------------------------------------------------------------
// the real shipped assets (artifact-gated: pipeline/out/ is git-ignored)
// ---------------------------------------------------------------------------

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = path.resolve(HERE, "../../pipeline/out/assets/registry-snapshot.json");
const INDEX_PATH = path.resolve(HERE, "../../pipeline/out/archive-bundles/index.json");

describeGated(
  artifactGate({
    gate: "app:wp12b-shipped-provenance-assets",
    suite: "shipped registry snapshot + archive index (real assets)",
    evidence:
      "proof that the shipped registry snapshot passes the Provenance screen's row-vs-summary " +
      "cross-checks with its known censuses, and that every archive bundle offered a 'Replay " +
      "in browser' preset is reproduced by that preset at the bundle's own seed",
    artifacts: [
      { source: "built-assets", path: REGISTRY_PATH, label: "registry-snapshot" },
      { source: "archive-bundles", path: INDEX_PATH, label: "index" },
    ],
  }),
  () => {
    it("parses the shipped registry snapshot with the known censuses", () => {
      const snapshot = parseRegistrySnapshot(
        JSON.parse(readFileSync(REGISTRY_PATH, "utf8")) as unknown,
      );
      expect(snapshot.variable_count).toBe(55);
      expect(snapshot.assumption_count).toBe(35);
      expect(snapshot.evidence_class_census).toEqual({ M: 15, L: 11, C: 0, A: 29, F: 0 });
      expect([...snapshot.blocking_assumption_ids].sort()).toEqual(["A-04", "A-09", "A-12", "A-16"]);
      expect(snapshot.placeholder_variable_ids).toHaveLength(3);
    });

    it("groups the shipped archive index without losing a bundle", () => {
      const index = parseArchiveIndex(JSON.parse(readFileSync(INDEX_PATH, "utf8")) as unknown);
      const groups = groupBundlesByFamily(index.bundles);
      const regrouped = groups.reduce((n, g) => n + g.bundles.length, 0);
      expect(regrouped).toBe(index.bundles.length);
      expect(index.bundles.length).toBeGreaterThan(0);
    });

    it("replay presets reproduce the exact bundle they are offered on", () => {
      const index = parseArchiveIndex(JSON.parse(readFileSync(INDEX_PATH, "utf8")) as unknown);
      let replayable = 0;
      for (const bundle of index.bundles) {
        const preset = replayPresetFor(bundle.run_dir);
        if (preset === null) {
          continue;
        }
        replayable++;
        const config = materialisePreset(preset);
        // A replay button promises THIS archived configuration: the preset's
        // seed must be the bundle's seed, exactly.
        if (bundle.seed !== null) {
          expect(config.randomSeed, `${bundle.bundle_id} vs preset ${preset.id}`).toBe(bundle.seed);
        }
      }
      // The flagship demo bundle must be replayable, and every archived preset
      // must find its primary archive in the shipped index.
      expect(replayPresetFor("present-day-three-arm/A-seed42")?.id).toBe("A_present_day");
      const archivedPresets = PRESET_DEFINITIONS.filter((d) => d.archiveFamily !== null);
      for (const preset of archivedPresets) {
        const hit = index.bundles.find((b) => b.run_dir === preset.archiveFamily);
        expect(hit, `preset ${preset.id} primary archive ${String(preset.archiveFamily)}`).toBeDefined();
      }
      expect(replayable).toBeGreaterThanOrEqual(archivedPresets.length);
    });
  },
);
