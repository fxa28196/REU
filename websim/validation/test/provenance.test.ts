/**
 * provenance.test.ts — the three states of `git_working_tree_dirty`, proved
 * without a git repository to mutate.
 *
 * `validation/src/provenance.ts` exists because gate (h) tests
 * `git_working_tree_dirty is False` **by identity**: a missing block, `null` and
 * the string `"unknown"` all FAIL, and a run whose provenance is unknown is not
 * a run whose tree was clean. That makes the flag's three-state behaviour
 * load-bearing rather than cosmetic, and the one outcome that must never be
 * reachable by accident is a `false` the tree did not earn —
 * `docs/critique-response/09-SYSTEM-AUDIT.md` §133-136 records eight archived D
 * manifests stamped exactly that by Java's mtime heuristic.
 *
 * The porcelain runner is injected, so these cases pin the mapping from git's
 * output to the flag without running `git init` anywhere.
 */

import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { PARAM_NAMES, PRESETS, parseRunConfig } from "@websim/shared";

import { artifactGate, itGated, type ArtifactRef } from "../../tools/artifact-gate.js";
import {
  PORT_SOURCE_PATHS,
  SOURCE_INTEGRITY_FILES,
  datasetDigest,
  gitWorkingTreeDirty,
  portSourceIntegrity,
  type PorcelainRunner,
} from "../src/provenance.js";
import { ASSET_DIR, GEOGRAPHY_DIR, runHeadless } from "../src/headless.js";
import { Checks, checkManifest, runFromDocuments } from "../src/harness/index.js";

const REPO_ROOT = path.resolve(GEOGRAPHY_DIR, "..");

const constant =
  (out: string | null): PorcelainRunner =>
  () =>
    out;

describe("git_working_tree_dirty is three-state, and 'clean' has to be earned", () => {
  it("empty porcelain output is the only thing that yields false", () => {
    expect(gitWorkingTreeDirty(REPO_ROOT, PORT_SOURCE_PATHS, constant(""))).toBe(false);
    expect(gitWorkingTreeDirty(REPO_ROOT, PORT_SOURCE_PATHS, constant("\n"))).toBe(false);
    expect(gitWorkingTreeDirty(REPO_ROOT, PORT_SOURCE_PATHS, constant("   \n  \n"))).toBe(false);
  });

  it("a modified tracked file is dirty", () => {
    expect(
      gitWorkingTreeDirty(REPO_ROOT, PORT_SOURCE_PATHS, constant(" M websim/engine/src/sim.ts\n")),
    ).toBe(true);
  });

  it("an UNTRACKED file is dirty too — it is the case a commit cannot reproduce", () => {
    expect(
      gitWorkingTreeDirty(REPO_ROOT, PORT_SOURCE_PATHS, constant("?? websim/engine/src/new.ts\n")),
    ).toBe(true);
  });

  it("a runner that cannot answer yields 'unknown', never false", () => {
    // No git on PATH, not a repository, permissions — all the same answer, and
    // it is not the permissive one.
    expect(gitWorkingTreeDirty(REPO_ROOT, PORT_SOURCE_PATHS, constant(null))).toBe("unknown");
  });

  it("names the port sources that can change a number, and nothing that cannot", () => {
    expect([...PORT_SOURCE_PATHS].sort()).toEqual([
      "websim/engine/src",
      "websim/shared/src",
      "websim/validation/scripts",
      "websim/validation/src",
    ]);
    // docs/ and pipeline/out/ are deliberately absent: neither can move a
    // metric, and folding them in would make the flag red for reasons no
    // reader could act on.
    expect(PORT_SOURCE_PATHS.some((p) => p.includes("docs"))).toBe(false);
    expect(PORT_SOURCE_PATHS.some((p) => p.includes("out"))).toBe(false);
  });
});

describe("the input digest census", () => {
  it("is OutcomeLogger.writeSourceIntegrity()'s 13 paths, in its order", () => {
    expect(SOURCE_INTEGRITY_FILES.length).toBe(13);
    expect(SOURCE_INTEGRITY_FILES[0]).toBe("data/Streets.shp");
    // The three 2026 study arms the Java list once OMITTED while checksumming
    // retired placement files (TECHNICAL_REFERENCE §12.3).
    for (const f of [
      "data/shelters/shelters_2026_current_placement.csv",
      "data/shelters/shelters_2026_expanded_capacity.csv",
      "data/shelters/shelters_2026_expanded_plus_new_sites.csv",
    ]) {
      expect(SOURCE_INTEGRITY_FILES).toContain(f);
    }
    expect(SOURCE_INTEGRITY_FILES.some((f) => f.includes("placement_") && f.includes("_A"))).toBe(
      false,
    );
  });

  it("reports a missing file as Java's own 'unavailable' token, not as a hash", () => {
    const d = datasetDigest(GEOGRAPHY_DIR, "data/definitely-not-here.csv");
    expect(d).toEqual({ file: "data/definitely-not-here.csv", sha256: "unavailable" });
  });

  it("hashes real bytes when Geography/ is present", () => {
    const rel = "data/registry/variables.csv";
    if (!existsSync(path.join(GEOGRAPHY_DIR, rel))) {
      // Geography/ is an external read-only artifact; its absence is the
      // artifact-gate's business, not this unit's. Assert the shape instead.
      expect(datasetDigest(GEOGRAPHY_DIR, rel).sha256).toBe("unavailable");
      return;
    }
    expect(datasetDigest(GEOGRAPHY_DIR, rel).sha256).toMatch(/^[0-9a-f]{64}$/u);
  });
});

describe("the block a port evidence run carries", () => {
  it("says what it measured, and reports a dirty tree as dirty", () => {
    const si = portSourceIntegrity({
      repoRoot: REPO_ROOT,
      geographyDir: GEOGRAPHY_DIR,
      porcelain: constant(" M websim/engine/src/sim.ts\n"),
    });
    expect(si.gitWorkingTreeDirty).toBe(true);
    expect(si.files.length).toBe(13);
    expect(si.note).toContain("NOT a certified Java run");
    expect(si.note).toContain("git status --porcelain");
  });
});

// ---------------------------------------------------------------------------
// gate (h) over the PORT's own writer
// ---------------------------------------------------------------------------

/**
 * The end-to-end claim item C is about: a port run's `simulation.json` now
 * carries a `source_integrity` block, and gate (h) — the port of
 * `verify_E_runs.py:check_manifest` — accepts it.
 *
 * The porcelain runner is stubbed **in both directions**, and that is the whole
 * design. Gate (h) is an identity test against the JSON boolean `false`, so
 * whether a real replay passes it is a fact about the working tree, not about
 * the writer: on a committed tree the flag reads `false` and the gate is green;
 * on an uncommitted one it reads `true` and the gate is red, correctly, because
 * nobody could reproduce that run from the recorded commit. What these two cases
 * pin is the part that IS the port's own behaviour — that the block is emitted
 * at all, in the shape and at the path the gate reads (QUIRK: it lives at
 * `reproducibility.source_integrity`, not at the top of the block), and that it
 * transmits the measured value rather than a constant.
 */
const gate = artifactGate({
  gate: "validation:port-provenance",
  suite: "the port's source_integrity block satisfies gate (h)",
  evidence:
    "an end-to-end demonstration that the TS writer emits a source_integrity block gate (h) " +
    "reads, and that the block reports the measured git state instead of a hardcoded verdict",
  artifacts: [
    { source: "graph-asset", label: "topology", path: `${ASSET_DIR}/graph-topology.bin` },
    { source: "graph-asset", label: "geometry", path: `${ASSET_DIR}/graph-geometry.bin` },
    {
      source: "geography",
      label: "data/shelters",
      path: path.join(GEOGRAPHY_DIR, "data", "shelters", "shelters_2026_current_placement.csv"),
    },
  ] as readonly ArtifactRef[],
});

/** A deliberately tiny run — this case is about the manifest, not the model. */
function portManifest(porcelain: PorcelainRunner): ReturnType<typeof runFromDocuments> {
  const config = {
    ...parseRunConfig(PRESETS["ER_baseline_real_A"], "preset ER_baseline_real_A"),
    numAgents: 40,
    simulationHours: 24,
  };
  const result = runHeadless({
    config,
    paramNames: PARAM_NAMES,
    env: {
      sourceIntegrity: portSourceIntegrity({
        repoRoot: REPO_ROOT,
        geographyDir: GEOGRAPHY_DIR,
        porcelain,
      }),
    },
  });
  return runFromDocuments({
    name: "TS port-provenance probe",
    agentsCsv: result.parity.agentsCsv,
    sheltersCsv: result.parity.sheltersCsv,
    simulationJson: result.parity.simulationJson,
  });
}

itGated(
  gate,
  "(h) PASSES on port output when the measured tree is clean",
  () => {
    const ck = new Checks();
    checkManifest(ck, portManifest(constant("")));
    expect(ck.results.length).toBe(2);
    expect(ck.failureReport()).toBe("");
    expect(ck.skipped.length).toBe(0);
    expect(ck.results.map((c) => c.status)).toEqual(["PASS", "PASS"]);
  },
  180_000,
);

itGated(
  gate,
  "(h) FAILS on port output when the measured tree is dirty — the flag is not decoration",
  () => {
    const ck = new Checks();
    checkManifest(ck, portManifest(constant(" M websim/engine/src/sim.ts\n")));
    // The parameter-completeness half still passes; only the provenance half
    // moves, which is what makes this a test of the value and not of the shape.
    expect(ck.results.length).toBe(2);
    const dirty = ck.results.find((c) => c.name.includes("git_working_tree_dirty"));
    expect(dirty?.status).toBe("FAIL");
    expect(dirty?.detail).toContain("true");
    expect(ck.results.find((c) => c.name.includes("21 Phase-E"))?.status).toBe("PASS");
  },
  180_000,
);
