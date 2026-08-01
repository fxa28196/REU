import { describe, expect, it } from "vitest";

import type { AssetManifest } from "../src/assets.js";
import {
  ASSET_MANIFEST_SCHEMA,
  assetDigestList,
  assetIds,
  safeParseAssetManifest,
  verifyAssetDigests,
} from "../src/assets.js";
import {
  canonicalExecutedParameters,
  checkManifestParameterCompleteness,
  checkPhaseEParameterCompleteness,
  checkScenarioEParameterCompleteness,
  configuredVsExecuted,
  ENGINE_SEMANTICS_QUIRKS,
  fieldMapping,
  FORMATTER_MODES,
  MANIFEST_PARAMETER_ORDER,
  PROVENANCE_QUIRKS,
  provenanceQuirk,
  SIMULATION_FIELD_MAP,
  SIMULATION_SCHEMA_PARITY,
  SIMULATION_SCHEMA_V2,
  simIdPreimage,
  simIdPreimageString,
} from "../src/manifest.js";
import { PRESETS } from "../src/presets/index.js";
import { E_PARAM_NAMES, PARAM_COUNT, PARAM_NAMES, SE_PARAM_NAMES } from "../src/schema.js";

const A = PRESETS.A_present_day;

const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);

function assetEntry(sha256: string) {
  return {
    sha256,
    bytes: 1024,
    source_file: "Geography/data/streets.shp",
    source_sha256: "c".repeat(64),
    build_commit: "de7c045",
    built_utc: "2026-07-30T00:00:00Z",
    tool_versions: { node: "24.18.0", java: "17.0.19+10" },
  };
}

const ASSETS: AssetManifest = {
  schema: ASSET_MANIFEST_SCHEMA,
  built_utc: "2026-07-30T00:00:00Z",
  build_commit: "de7c045",
  assets: { "smoke.series0.bin": assetEntry(DIGEST_B), "graph.bin": assetEntry(DIGEST_A) },
};

describe("schema ids", () => {
  it("keeps the v2-web and parity ids distinct", () => {
    expect(SIMULATION_SCHEMA_V2).toBe("reu-wildfire-shelter-abm/simulation/v2-web");
    expect(SIMULATION_SCHEMA_PARITY).toBe("reu-wildfire-shelter-abm/simulation/v1");
    expect(SIMULATION_SCHEMA_V2).not.toBe(SIMULATION_SCHEMA_PARITY);
    expect([...FORMATTER_MODES]).toEqual(["parity", "v2-web"]);
  });
});

describe("manifest parameter order", () => {
  it("is the schema's 41 parameters, in order", () => {
    expect(MANIFEST_PARAMETER_ORDER).toEqual([...PARAM_NAMES]);
    expect(MANIFEST_PARAMETER_ORDER).toHaveLength(PARAM_COUNT);
  });

  it("passes the completeness check for a full list", () => {
    expect(checkManifestParameterCompleteness([...PARAM_NAMES])).toEqual({
      ok: true,
      missing: [],
      unexpected: [],
    });
  });

  it("names the omission when a parameter is missing", () => {
    const partial = PARAM_NAMES.filter((n) => n !== "closureDraw");
    const result = checkManifestParameterCompleteness([...partial]);
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(["closureDraw"]);
  });

  it("names an unexpected entry", () => {
    const result = checkManifestParameterCompleteness([...PARAM_NAMES, "legacyParam"]);
    expect(result.ok).toBe(false);
    expect(result.unexpected).toEqual(["legacyParam"]);
  });
});

describe("configured vs executed", () => {
  it("is empty for a healthy run", () => {
    expect(configuredVsExecuted(A, { ...A })).toEqual([]);
  });

  it("exposes exactly the gotcha-4 case", () => {
    // Configured -0.25, executed 0.0: what the archived Scenario-E runs did.
    const executed = { ...A, pushThetaThreshold: 0 };
    expect(configuredVsExecuted(A, executed)).toEqual([
      { param: "pushThetaThreshold", configured: -0.25, executed: 0 },
    ]);
  });
});

describe("deterministic sim_id", () => {
  it("serialises all 41 parameters in fixed order", () => {
    const canonical = canonicalExecutedParameters(A);
    const pairs = canonical.split("|");
    expect(pairs).toHaveLength(PARAM_COUNT);
    expect(pairs.map((p) => p.split("=")[0])).toEqual([...PARAM_NAMES]);
    expect(canonical).toContain("pushThetaThreshold=-0.25");
  });

  it("is insensitive to key order in the input object", () => {
    const shuffled = Object.fromEntries([...Object.entries(A)].reverse()) as typeof A;
    expect(canonicalExecutedParameters(shuffled)).toBe(canonicalExecutedParameters(A));
  });

  it("changes when any parameter changes", () => {
    const preimage = simIdPreimageString(simIdPreimage(A, "websim-ts 0.1.0", ASSETS));
    const other = simIdPreimageString(
      simIdPreimage({ ...A, randomSeed: 43 }, "websim-ts 0.1.0", ASSETS),
    );
    expect(other).not.toBe(preimage);
  });

  it("changes when the engine version or an asset digest changes", () => {
    const base = simIdPreimageString(simIdPreimage(A, "websim-ts 0.1.0", ASSETS));
    expect(simIdPreimageString(simIdPreimage(A, "websim-ts 0.1.1", ASSETS))).not.toBe(base);

    const rebuilt: AssetManifest = {
      ...ASSETS,
      assets: { ...ASSETS.assets, "graph.bin": assetEntry("d".repeat(64)) },
    };
    expect(simIdPreimageString(simIdPreimage(A, "websim-ts 0.1.0", rebuilt))).not.toBe(base);
  });

  it("distinguishes -0 from +0", () => {
    const plus = canonicalExecutedParameters({ ...A, gammaVuln: 0 });
    const minus = canonicalExecutedParameters({ ...A, gammaVuln: -0 });
    expect(minus).not.toBe(plus);
    expect(minus).toContain("gammaVuln=-0");
  });

  it("refuses to hash a non-finite parameter", () => {
    expect(() => canonicalExecutedParameters({ ...A, smokeScale: Number.NaN })).toThrow(
      /Non-finite parameter/u,
    );
  });
});

describe("asset manifest", () => {
  it("validates a well-formed manifest", () => {
    expect(safeParseAssetManifest(ASSETS).ok).toBe(true);
  });

  it("rejects an uppercase or truncated digest", () => {
    const bad = { ...ASSETS, assets: { "graph.bin": assetEntry("A".repeat(64)) } };
    expect(safeParseAssetManifest(bad).ok).toBe(false);
    const short = { ...ASSETS, assets: { "graph.bin": assetEntry("a".repeat(63)) } };
    expect(safeParseAssetManifest(short).ok).toBe(false);
  });

  it("lists digests in sorted-id order, not insertion order", () => {
    expect(assetIds(ASSETS)).toEqual(["graph.bin", "smoke.series0.bin"]);
    expect(assetDigestList(ASSETS)).toEqual([
      `graph.bin:${DIGEST_A}`,
      `smoke.series0.bin:${DIGEST_B}`,
    ]);
  });

  it("reports every asset whose loaded bytes do not match", () => {
    expect(
      verifyAssetDigests(ASSETS, { "graph.bin": DIGEST_A, "smoke.series0.bin": DIGEST_B }),
    ).toEqual([]);
    expect(verifyAssetDigests(ASSETS, { "graph.bin": DIGEST_A })).toEqual(["smoke.series0.bin"]);
    expect(verifyAssetDigests(ASSETS, { "graph.bin": DIGEST_B, "smoke.series0.bin": DIGEST_B })).toEqual([
      "graph.bin",
    ]);
  });
});

describe("Q6 field maps", () => {
  it("covers the seven v1 output quirks", () => {
    expect(SIMULATION_FIELD_MAP).toHaveLength(7);
    expect(SIMULATION_FIELD_MAP.map((m) => m.id).sort()).toEqual(
      [
        "crlf-line-endings",
        "door-refusals-naming",
        "generated-utc-local",
        "half-up-rounding",
        "json-escaping",
        "nan-strata",
        "utilization-final-only",
      ].sort(),
    );
    expect(new Set(SIMULATION_FIELD_MAP.map((m) => m.id)).size).toBe(SIMULATION_FIELD_MAP.length);
  });

  it("fixes six quirks in v2-web and retains HALF_UP rounding", () => {
    const retained = SIMULATION_FIELD_MAP.filter((m) => m.v2Status === "retained");
    expect(retained.map((m) => m.id)).toEqual(["half-up-rounding"]);
    expect(SIMULATION_FIELD_MAP.filter((m) => m.v2Status === "fixed")).toHaveLength(6);
  });

  it("splits v1's single utilization column into two named v2 columns", () => {
    expect(fieldMapping("utilization-final-only")?.v2Keys).toEqual([
      "utilization_final",
      "utilization_peak",
    ]);
  });

  it("keeps engine-semantics quirks out of the formatting map and reproduced in both modes", () => {
    const formattingIds = new Set(SIMULATION_FIELD_MAP.map((m) => m.id));
    for (const quirk of ENGINE_SEMANTICS_QUIRKS) {
      expect(formattingIds.has(quirk.id)).toBe(false);
      expect(quirk.reproducedIn).toBe("both");
    }
    expect(ENGINE_SEMANTICS_QUIRKS.map((q) => q.id).sort()).toEqual([
      "closed-door-not-counted-refused",
      "double-concentration-lookup",
    ]);
  });

  it("returns undefined for an unknown mapping id", () => {
    expect(fieldMapping("no-such-quirk")).toBeUndefined();
  });
});

describe("archive gates (h) and (i) — manifest completeness", () => {
  const full = Object.keys(PRESETS.SE2_worst_plausible_E18_d1);

  it("(h) passes on a complete parameter list and names what is missing", () => {
    expect(checkPhaseEParameterCompleteness(full)).toEqual({
      ok: true,
      missing: [],
      unexpected: [],
    });
    const without = full.filter((n) => n !== "gammaVuln" && n !== "sigmaTheta");
    const result = checkPhaseEParameterCompleteness(without);
    expect(result.ok).toBe(false);
    // Reported in E_PARAMS order, not in the caller's order.
    expect(result.missing).toEqual(["sigmaTheta", "gammaVuln"]);
  });

  it("(h) ignores parameters outside the 21, including shelterPolicyVariant", () => {
    // Gate (h) is a presence check over E_PARAMS only; a manifest carrying extra
    // parameters (every archived one does) must still pass.
    expect(checkPhaseEParameterCompleteness([...E_PARAM_NAMES]).ok).toBe(true);
    expect(
      checkPhaseEParameterCompleteness([...E_PARAM_NAMES, "shelterPolicyVariant", "wat"]).ok,
    ).toBe(true);
  });

  it("(i) requires closureDraw only for the worst family", () => {
    const withoutDraw = full.filter((n) => n !== "closureDraw");
    expect(checkScenarioEParameterCompleteness(withoutDraw, 3).missing).toEqual(["closureDraw"]);
    for (const code of [0, 1, 2]) {
      expect(checkScenarioEParameterCompleteness(withoutDraw, code).ok, `code ${code}`).toBe(true);
    }
    // The Python defaults a missing closuresCode to 0; so does this.
    expect(checkScenarioEParameterCompleteness(withoutDraw).ok).toBe(true);
  });

  it("(i) reports the missing Scenario-E parameters in SE_PARAMS order", () => {
    const result = checkScenarioEParameterCompleteness(["smokeScale", "closuresCode"], 0);
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual([
      "smokeSeriesCode",
      "pStuck",
      "stuckDelayH",
      "pushThetaThreshold",
      "kPush",
    ]);
    expect(SE_PARAM_NAMES).toHaveLength(7);
  });

  it("passes both gates for every shipped preset", () => {
    for (const [id, config] of Object.entries(PRESETS)) {
      const names = Object.keys(config);
      expect(checkPhaseEParameterCompleteness(names).ok, `${id} gate (h)`).toBe(true);
      expect(
        checkScenarioEParameterCompleteness(names, config.closuresCode).ok,
        `${id} gate (i)`,
      ).toBe(true);
    }
  });
});

describe("provenance ledger", () => {
  it("carries the pushThetaThreshold honesty note verbatim", () => {
    // Quoted from docs/IMPLEMENTATION_PLAN.md §6.4 (lines 548-551), which
    // WP8-SPEC-archive-gates.md §5.2 reproduces. Line wrapping removed; every
    // other character, including the typographic minus in -0.25 and the em dash,
    // is the source's. A paraphrase here would defeat the point of the note.
    const quirk = provenanceQuirk("pushtheta-batch-zeroing");
    expect(quirk).toBeDefined();
    expect(quirk?.note).toBe(
      "the SE/SE2 preset UI and quirk ledger state that archived runs *executed* " +
        "`pushThetaThreshold = 0.0` (Repast negative-\"number\" parser defect, inert — zero " +
        "blockage events) while web presets carry the corrected −0.25, so live-vs-archived " +
        "closure comparisons are framed correctly.",
    );
    expect(quirk?.param).toBe("pushThetaThreshold");
    expect(quirk?.archivedExecutedValue).toBe(0);
    expect(quirk?.presetValue).toBe(-0.25);
  });

  it("states the impact and cites checkable sources", () => {
    for (const quirk of PROVENANCE_QUIRKS) {
      expect(PARAM_NAMES as readonly string[]).toContain(quirk.param);
      expect(quirk.impact.length).toBeGreaterThan(0);
      expect(quirk.sources.length).toBeGreaterThan(0);
      // A provenance note is neither a formatting quirk nor engine semantics; it
      // must not appear in either of the other two ledgers.
      expect(SIMULATION_FIELD_MAP.map((m) => m.id)).not.toContain(quirk.id);
      expect(ENGINE_SEMANTICS_QUIRKS.map((q) => q.id)).not.toContain(quirk.id);
    }
    expect(PROVENANCE_QUIRKS.map((q) => q.id)).toEqual(["pushtheta-batch-zeroing"]);
  });

  it("returns undefined for an unknown provenance id", () => {
    expect(provenanceQuirk("no-such-note")).toBeUndefined();
  });
});
