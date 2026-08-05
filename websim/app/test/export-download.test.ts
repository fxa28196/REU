/**
 * export-download.test.ts — WP12c export surface (`src/export/download.ts`).
 *
 * Node-only: the engine round trip is a fake `RunExportSource` (structural),
 * the file saver is injected, and hashing runs on Node's own WebCrypto. The
 * load-bearing assertions: the replay-token derivation is pure and exact, the
 * executed parameters come from the ENGINE's emission (a fabricated
 * configured≠executed divergence must surface in `parameter_diff`), the
 * deterministic `sim_id` matches an independent recomputation of the shared
 * preimage, and constructed smoke series carry `CONSTRUCTED_SERIES_LABEL`.
 */

import { describe, expect, it } from "vitest";

import { ENGINE_NAME, ENGINE_VERSION } from "@websim/engine";
import type { RunOutputs } from "@websim/engine/output";
import type { ExportRequest } from "@websim/engine/worker";
import type { AssetManifest, RunConfig } from "@websim/shared";
import {
  ASSET_MANIFEST_SCHEMA,
  SIMULATION_SCHEMA_PARITY,
  SIMULATION_SCHEMA_V2,
  assetDigestList,
  canonicalExecutedParameters,
  configsEqual,
  orderRunConfig,
  parseRunConfig,
  simIdPreimage,
  simIdPreimageString,
} from "@websim/shared";

import { CONSTRUCTED_SERIES_LABEL, PROVENANCE_CLASSES } from "../src/index.js";
import { sha256Hex } from "../src/assets/loader.js";
import { presetConfig } from "../src/state/store.js";
import {
  EXPORT_MANIFEST_SCHEMA,
  REPLAY_TOKEN_DELIMITER,
  REPLAY_TOKEN_FORMAT,
  buildRunExportBundle,
  downloadRunOutputs,
  exportFileNames,
  generatedTimestampFor,
  parseExecutedParameters,
  replayToken,
  simulationSchemaFor,
  smokeExportAnnotations,
} from "../src/export/download.js";
import type { ExportFile, RunExportSource } from "../src/export/download.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function hex64(fill: string): string {
  return fill.repeat(64);
}

function assetManifestFixture(): AssetManifest {
  const entry = (sha: string) => ({
    sha256: sha,
    bytes: 3,
    source_file: "Geography/data/example.csv",
    source_sha256: hex64("0"),
    build_commit: "testcommit",
    built_utc: "2026-08-04T00:00:00Z",
    tool_versions: { node: "test" },
  });
  return {
    schema: ASSET_MANIFEST_SCHEMA,
    built_utc: "2026-08-04T00:00:00Z",
    build_commit: "testcommit",
    assets: {
      // Deliberately NOT in sorted key order: the digest list and the token
      // must not depend on object insertion order.
      "assets/smoke-0.json": entry(hex64("b")),
      "assets/graph-topology.bin": entry(hex64("a")),
    },
  };
}

/** What the engine's v2-web simulation JSON looks like where this module reads it. */
function fakeSimulationJson(executed: RunConfig, request: ExportRequest): string {
  return JSON.stringify({
    reproducibility: {
      sim_id: request.env?.simId ?? "sim-worker",
      parameters: orderRunConfig(executed),
    },
  });
}

/** Structural fake of the worker client; records every ExportRequest. */
function fakeClient(executed: RunConfig): RunExportSource & { requests: ExportRequest[] } {
  const requests: ExportRequest[] = [];
  return {
    requests,
    api: {
      exportOutputs(request: ExportRequest): RunOutputs {
        requests.push(request);
        return {
          agentsCsv: `agents-${request.flavour}`,
          sheltersCsv: `shelters-${request.flavour}`,
          simulationJson: fakeSimulationJson(executed, request),
        };
      },
    },
  };
}

const FIXED_NOW = (): Date => new Date(Date.UTC(2026, 7, 4, 12, 34, 56, 0));

// ---------------------------------------------------------------------------
// replayToken (pure)
// ---------------------------------------------------------------------------

describe("replayToken", () => {
  it("composes format ‖ configHash ‖ engineVersion ‖ sorted asset SHAs", () => {
    expect(replayToken("h", "v", ["b:2", "a:1"])).toBe(
      ["websim-replay/v1", "h", "v", "a:1,b:2"].join(REPLAY_TOKEN_DELIMITER),
    );
  });

  it("is independent of asset input order", () => {
    expect(replayToken("h", "v", ["x", "y", "z"])).toBe(replayToken("h", "v", ["z", "x", "y"]));
  });

  it("rejects empty configHash and empty engineVersion", () => {
    expect(() => replayToken("", "v", [])).toThrow(/configHash/);
    expect(() => replayToken("h", "", [])).toThrow(/engineVersion/);
  });

  it("rejects any field containing the delimiter", () => {
    expect(() => replayToken(`h${REPLAY_TOKEN_DELIMITER}x`, "v", [])).toThrow(/delimiter/);
    expect(() => replayToken("h", "v", [`a${REPLAY_TOKEN_DELIMITER}b`])).toThrow(/delimiter/);
  });

  it("keeps the advertised format id", () => {
    expect(replayToken("h", "v", []).startsWith(`${REPLAY_TOKEN_FORMAT}${REPLAY_TOKEN_DELIMITER}`)).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// Small pure pieces
// ---------------------------------------------------------------------------

describe("pure helpers", () => {
  it("simulationSchemaFor maps flavours to schema ids", () => {
    expect(simulationSchemaFor("v2-web")).toBe(SIMULATION_SCHEMA_V2);
    expect(simulationSchemaFor("parity")).toBe(SIMULATION_SCHEMA_PARITY);
  });

  it("exportFileNames: v2-web writes simulation.v2.json, parity keeps the Java name", () => {
    expect(exportFileNames("v2-web").simulation).toBe("simulation.v2.json");
    expect(exportFileNames("parity").simulation).toBe("simulation.json");
    expect(exportFileNames("v2-web").agents).toBe("agents.csv");
    expect(exportFileNames("v2-web").shelters).toBe("shelters.csv");
    expect(exportFileNames("v2-web").manifest).toBe("manifest.executed.json");
    expect(exportFileNames("v2-web").replayToken).toBe("replay-token.txt");
  });

  it("generatedTimestampFor: v2-web is true UTC, parity reproduces the local-time quirk", () => {
    const date = new Date(Date.UTC(2026, 7, 4, 12, 0, 0, 500));
    expect(generatedTimestampFor("v2-web", date)).toBe(date.toISOString());
    expect(generatedTimestampFor("v2-web", date).endsWith("Z")).toBe(true);

    const local = new Date(2026, 6, 4, 5, 6, 7, 89); // local wall time
    expect(generatedTimestampFor("parity", local)).toBe("2026-07-04T05:06:07.089");
  });

  it("smokeExportAnnotations: observed series at unit scale carries no notes", () => {
    expect(smokeExportAnnotations({ smokeSeriesCode: 0, smokeScale: 1 })).toEqual([]);
  });

  it("smokeExportAnnotations: constructed series carry the label VERBATIM", () => {
    const v1 = smokeExportAnnotations({ smokeSeriesCode: 1, smokeScale: 1 });
    expect(v1).toHaveLength(1);
    expect(v1[0]).toContain(CONSTRUCTED_SERIES_LABEL);
    const v2 = smokeExportAnnotations({ smokeSeriesCode: 2, smokeScale: 1 });
    expect(v2[0]).toContain(CONSTRUCTED_SERIES_LABEL);
    expect(v2[0]).toContain("Canberra");
  });

  it("smokeExportAnnotations: non-unit scale adds a counterfactual note", () => {
    const notes = smokeExportAnnotations({ smokeSeriesCode: 1, smokeScale: 2 });
    expect(notes).toHaveLength(2);
    expect(notes[1]).toContain("smokeScale 2");
    expect(notes[1]).toContain("counterfactual");
  });
});

// ---------------------------------------------------------------------------
// Executed-parameter readback
// ---------------------------------------------------------------------------

describe("parseExecutedParameters", () => {
  const executed = presetConfig("A_present_day");

  it("reads the engine's parameter block back as a validated RunConfig", () => {
    const text = JSON.stringify({ reproducibility: { parameters: orderRunConfig(executed) } });
    expect(configsEqual(parseExecutedParameters(text), executed)).toBe(true);
  });

  it("throws when a parameter is missing, naming it", () => {
    const partial: Record<string, number> = { ...orderRunConfig(executed) };
    delete partial["kPush"];
    const text = JSON.stringify({ reproducibility: { parameters: partial } });
    expect(() => parseExecutedParameters(text)).toThrow(/kPush/);
  });

  it("throws on an unexpected parameter", () => {
    const extra = { ...orderRunConfig(executed), bogusParam: 1 };
    const text = JSON.stringify({ reproducibility: { parameters: extra } });
    expect(() => parseExecutedParameters(text)).toThrow(/bogusParam/);
  });

  it("throws when the block is absent", () => {
    expect(() => parseExecutedParameters("{}")).toThrow(/reproducibility\.parameters/);
  });

  it("throws (with the parity hint) on unparseable JSON such as bare NaN", () => {
    expect(() => parseExecutedParameters('{"x": NaN}')).toThrow(/parity/);
  });
});

// ---------------------------------------------------------------------------
// Bundle assembly
// ---------------------------------------------------------------------------

describe("buildRunExportBundle", () => {
  const assets = assetManifestFixture();

  it("v2-web: files, deterministic sim_id, token wiring, env stamping", async () => {
    const configured = presetConfig("A_present_day");
    const client = fakeClient(configured);
    const bundle = await buildRunExportBundle(client, {
      flavour: "v2-web",
      configured,
      assets,
      now: FIXED_NOW,
    });

    // Files, in download order, with the flavour-correct simulation name.
    expect(bundle.files.map((f) => f.name)).toEqual([
      "agents.csv",
      "shelters.csv",
      "simulation.v2.json",
      "manifest.executed.json",
      "replay-token.txt",
    ]);
    expect(bundle.files[0]?.text).toBe("agents-v2-web");

    // Two engine calls: the executed-parameter probe (v2-web, no env), then
    // the requested flavour with the deterministic sim_id embedded.
    expect(client.requests).toHaveLength(2);
    expect(client.requests[0]?.flavour).toBe("v2-web");
    expect(client.requests[0]?.env).toBeUndefined();
    expect(client.requests[1]?.flavour).toBe("v2-web");
    expect(client.requests[1]?.env?.simId).toBe(bundle.simId);
    expect(client.requests[1]?.env?.generatedTimestamp?.endsWith("Z")).toBe(true);

    // sim_id and config hash match independent recomputations of the shared
    // preimage — the "same config + engine + assets ⇒ same sim_id" claim.
    const encoder = new TextEncoder();
    const expectedSimId = await sha256Hex(
      encoder.encode(simIdPreimageString(simIdPreimage(configured, ENGINE_VERSION, assets))),
    );
    expect(bundle.simId).toBe(expectedSimId);
    const expectedConfigHash = await sha256Hex(
      encoder.encode(canonicalExecutedParameters(configured)),
    );
    expect(bundle.configHash).toBe(expectedConfigHash);
    expect(bundle.replayToken).toBe(
      replayToken(expectedConfigHash, ENGINE_VERSION, assetDigestList(assets)),
    );
    expect(bundle.files[4]?.text).toBe(`${bundle.replayToken}\n`);

    // The manifest file is the manifest object, byte-parseable.
    const manifest = JSON.parse(bundle.files[3]?.text ?? "");
    expect(manifest).toEqual(JSON.parse(JSON.stringify(bundle.manifest)));
    expect(bundle.manifest.schema).toBe(EXPORT_MANIFEST_SCHEMA);
    expect(bundle.manifest.simulation_schema).toBe(SIMULATION_SCHEMA_V2);
    expect(bundle.manifest.formatter_mode).toBe("v2-web");
    expect(bundle.manifest.provenance_class).toBe(PROVENANCE_CLASSES.live);
    expect(bundle.manifest.engine.engine).toBe(ENGINE_NAME);
    expect(bundle.manifest.engine.engine_version).toBe(ENGINE_VERSION);
    expect(bundle.manifest.reproducibility.replay_token).toBe(bundle.replayToken);
    expect(bundle.manifest.reproducibility.generated_utc).toBe(FIXED_NOW().toISOString());
    expect(bundle.manifest.parameter_diff).toEqual([]);
    expect(bundle.manifest.smoke_series_annotations).toEqual([]);

    // Determinism: a second build produces the identical identifiers.
    const again = await buildRunExportBundle(fakeClient(configured), {
      flavour: "v2-web",
      configured,
      assets,
      now: FIXED_NOW,
    });
    expect(again.simId).toBe(bundle.simId);
    expect(again.configHash).toBe(bundle.configHash);
    expect(again.replayToken).toBe(bundle.replayToken);
  });

  it("parity toggle: parity flavour files, Java simulation.json name, local-quirk timestamp", async () => {
    const configured = presetConfig("A_present_day");
    const client = fakeClient(configured);
    const bundle = await buildRunExportBundle(client, {
      flavour: "parity",
      configured,
      assets,
      now: FIXED_NOW,
    });
    expect(bundle.files.map((f) => f.name)).toContain("simulation.json");
    expect(bundle.files.map((f) => f.name)).not.toContain("simulation.v2.json");
    expect(bundle.files[0]?.text).toBe("agents-parity");
    expect(client.requests[1]?.flavour).toBe("parity");
    // The parity timestamp reproduces the local-time quirk: no trailing Z.
    const stamp = client.requests[1]?.env?.generatedTimestamp ?? "";
    expect(stamp.endsWith("Z")).toBe(false);
    expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$/);
    expect(bundle.manifest.simulation_schema).toBe(SIMULATION_SCHEMA_PARITY);
    expect(bundle.manifest.formatter_mode).toBe("parity");
    // The probe stays v2-web regardless — parity JSON may carry bare NaN.
    expect(client.requests[0]?.flavour).toBe("v2-web");
  });

  it("surfaces a configured≠executed divergence in parameter_diff (never hides it)", async () => {
    const configured = presetConfig("SE_severe_v1_E18");
    // The engine "executed" 0.0 where the UI configured -0.25 — the exact
    // shape of the negative-zeroing episode this manifest exists to expose.
    const executed = parseRunConfig({ ...configured, pushThetaThreshold: 0 });
    const bundle = await buildRunExportBundle(fakeClient(executed), {
      flavour: "v2-web",
      configured,
      assets,
      now: FIXED_NOW,
    });
    expect(configsEqual(bundle.executed, executed)).toBe(true);
    expect(bundle.manifest.parameter_diff).toEqual([
      { param: "pushThetaThreshold", configured: -0.25, executed: 0 },
    ]);
    // sim_id hashes the EXECUTED values, not the configured ones.
    const expectedSimId = await sha256Hex(
      new TextEncoder().encode(simIdPreimageString(simIdPreimage(executed, ENGINE_VERSION, assets))),
    );
    expect(bundle.simId).toBe(expectedSimId);
  });

  it("stamps CONSTRUCTED_SERIES_LABEL into the manifest for a constructed series", async () => {
    const configured = presetConfig("SE_severe_v1_E18"); // smokeSeriesCode 1
    const bundle = await buildRunExportBundle(fakeClient(configured), {
      flavour: "v2-web",
      configured,
      assets,
      now: FIXED_NOW,
    });
    expect(bundle.manifest.smoke_series_annotations.length).toBeGreaterThan(0);
    expect(bundle.manifest.smoke_series_annotations[0]).toContain(CONSTRUCTED_SERIES_LABEL);
  });
});

// ---------------------------------------------------------------------------
// Download plumbing (saver injected; no DOM in this test)
// ---------------------------------------------------------------------------

describe("downloadRunOutputs", () => {
  it("saves all five files in bundle order through the injected saver", async () => {
    const configured = presetConfig("A_present_day");
    const saved: ExportFile[] = [];
    const bundle = await downloadRunOutputs(fakeClient(configured), {
      flavour: "v2-web",
      configured,
      assets: assetManifestFixture(),
      now: FIXED_NOW,
      save: (file) => {
        saved.push(file);
      },
    });
    expect(saved.map((f) => f.name)).toEqual(bundle.files.map((f) => f.name));
    expect(saved).toHaveLength(5);
    expect(saved[3]?.mimeType).toContain("application/json");
    expect(saved[4]?.text).toBe(`${bundle.replayToken}\n`);
  });
});
