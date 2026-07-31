import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildShelterAssets, censusClosures, censusShelters } from "../scripts/build-shelters.js";
import { geographyPath, sha256 } from "../src/asset-io.js";
import {
  closuresForCode,
  CLOSURES_DIR,
  resolveShelterFile,
  scenarioForCode,
  SCENARIO_CHAIN,
  SHELTERS_DIR,
} from "../src/scenario-index.js";

const build = buildShelterAssets();
const index = JSON.parse(build.index.bytes.toString("utf8")) as {
  scenarios: {
    code: number;
    scenario_name: string;
    shelters_file: string;
    elayer_file: string;
    elayer_available: boolean;
    reserve_driven: boolean;
  }[];
  closures: { code: number; draw: number | null; file: string }[];
  shelter_census: Record<string, { rows: number; operatingRows: number; bedSum: number; hasPetIntake: boolean }>;
  closure_census: Record<string, { rows: number; waveHours: number[] }>;
};

describe("shelter and closure CSVs ship verbatim", () => {
  it("copies every file byte-for-byte from the read-only Geography tree", () => {
    // Plan section 4 ships these unchanged so the browser's ported CsvLoader is
    // exercised on the real bytes. A re-encoded copy would make the loader
    // parity claim untestable, so the digests must match exactly.
    expect(build.copies.length).toBeGreaterThan(0);
    for (const copy of build.copies) {
      expect(sha256(copy.bytes)).toBe(sha256(readFileSync(geographyPath(copy.sourceFile))));
    }
  });

  it("ships the files the chain can select and nothing else", () => {
    const shipped = build.copies
      .filter((c) => c.sourceFile.startsWith(SHELTERS_DIR))
      .map((c) => c.sourceFile.slice(SHELTERS_DIR.length + 1));
    // PORT_MAP section 4.1 names these as never read by Java. Shipping an
    // unread file invites someone to read it.
    expect(shipped).not.toContain("shelters_multnomah_2026.csv");
    expect(shipped).not.toContain("geocode_cache_2026.json");
    for (const entry of SCENARIO_CHAIN) {
      expect(shipped).toContain(entry.sheltersFile);
    }
  });

  it("ships all five committed closure schedules", () => {
    const shipped = build.copies
      .filter((c) => c.sourceFile.startsWith(CLOSURES_DIR))
      .map((c) => c.sourceFile.slice(CLOSURES_DIR.length + 1))
      .sort();
    expect(shipped).toEqual([
      "closures_E_r1.csv",
      "closures_E_r1_extreme.csv",
      "closures_E_r1_worst.csv",
      "closures_E_r2_worst.csv",
      "closures_E_r3_worst.csv",
    ]);
  });
});

describe("scenarioCode index matches the certified ContextCreator chain", () => {
  it("maps the three headline arms to their archived files", () => {
    expect(scenarioForCode(0).sheltersFile).toBe("shelters_2026_current_placement.csv");
    expect(scenarioForCode(1).sheltersFile).toBe("shelters_2026_expanded_capacity.csv");
    expect(scenarioForCode(2).sheltersFile).toBe("shelters_2026_expanded_plus_new_sites.csv");
  });

  it("keeps code 3 on the historical reference, not on arm C", () => {
    // The historical remap trap: code 2 meant HISTORICAL before the redesign.
    // Trusting a stale comment instead of the code swaps two arms silently.
    expect(scenarioForCode(3).scenarioName).toBe("HISTORICAL_capacity_reference_not_a_scenario");
    expect(scenarioForCode(3).sheltersFile).toBe("shelters_2020-09.csv");
  });

  it("gives arms D and E20 arm B's file plus the reserve parameter", () => {
    for (const code of [7, 20]) {
      expect(scenarioForCode(code).sheltersFile).toBe("shelters_2026_expanded_capacity.csv");
      expect(scenarioForCode(code).reserveDriven).toBe(true);
    }
  });

  it("puts E18 over arm A's file and E19 over arm C's", () => {
    expect(scenarioForCode(18).sheltersFile).toBe("shelters_2026_current_placement.csv");
    expect(scenarioForCode(19).sheltersFile).toBe("shelters_2026_expanded_plus_new_sites.csv");
  });

  it("falls through to arm A for any unmatched code, with no range error", () => {
    // The Java else-branch has no validation. A permalink carrying code 99 must
    // resolve the same way the instrument would, not throw.
    expect(scenarioForCode(99).scenarioName).toBe("A_present_day_reality");
    expect(scenarioForCode(-1).scenarioName).toBe("A_present_day_reality");
  });

  it("emits all 21 registered codes into the shipped index", () => {
    expect(index.scenarios).toHaveLength(21);
    expect(index.scenarios.map((s) => s.code)).toEqual([...Array(21).keys()]);
  });
});

describe("shelterPolicyVariant (V45) selection", () => {
  const exists = (name: string): boolean => index.shelter_census[name] !== undefined;

  it("reads the base file at variant 0", () => {
    expect(resolveShelterFile(0, 0, exists)).toBe("shelters_2026_current_placement.csv");
  });

  it("swaps in the _elayer variant of whichever arm the chain selected", () => {
    expect(resolveShelterFile(0, 1, exists)).toBe("shelters_2026_current_placement_elayer.csv");
    expect(resolveShelterFile(2, 1, exists)).toBe("shelters_2026_expanded_plus_new_sites_elayer.csv");
    // Arm D inherits arm B's variant, exactly as it inherits arm B's base file.
    expect(resolveShelterFile(7, 1, exists)).toBe("shelters_2026_expanded_capacity_elayer.csv");
  });

  it("fails fast when the requested variant does not exist", () => {
    // Never a silent fallback: a run that asked for recorded pet policy and got
    // the blanket default would misattribute every pet-owner outcome.
    expect(() => resolveShelterFile(3, 1, exists)).toThrow(/does not exist/u);
  });

  it("records variant availability per code in the shipped index", () => {
    const byCode = new Map(index.scenarios.map((s) => [s.code, s]));
    expect(byCode.get(0)?.elayer_available).toBe(true);
    expect(byCode.get(3)?.elayer_available).toBe(false);
    expect(byCode.get(4)?.elayer_available).toBe(false);
  });

  it("ships the three variant files, each carrying the pet_intake column", () => {
    for (const name of [
      "shelters_2026_current_placement_elayer.csv",
      "shelters_2026_expanded_capacity_elayer.csv",
      "shelters_2026_expanded_plus_new_sites_elayer.csv",
    ]) {
      expect(index.shelter_census[name]?.hasPetIntake).toBe(true);
    }
    expect(index.shelter_census["shelters_2026_current_placement.csv"]?.hasPetIntake).toBe(false);
  });
});

describe("closuresCode / closureDraw resolution (V48)", () => {
  it("schedules nothing at code 0", () => {
    expect(closuresForCode(0)).toBeNull();
  });

  it("selects base, extreme and the worst family by draw", () => {
    expect(closuresForCode(1)?.file).toBe("closures_E_r1.csv");
    expect(closuresForCode(2)?.file).toBe("closures_E_r1_extreme.csv");
    expect(closuresForCode(3, 2)?.file).toBe("closures_E_r2_worst.csv");
  });

  it("fails fast on an unregistered code or an uncommitted draw", () => {
    expect(() => closuresForCode(4)).toThrow(/not a registered schedule/u);
    expect(() => closuresForCode(3, 4)).toThrow(/only draws 1\.\.3 are committed/u);
    expect(() => closuresForCode(3, 0)).toThrow(/only draws 1\.\.3 are committed/u);
  });
});

describe("census cross-checks against the plan's scenario table", () => {
  it("reproduces the site and bed counts the plan records per arm", () => {
    const a = index.shelter_census["shelters_2026_current_placement.csv"];
    const b = index.shelter_census["shelters_2026_expanded_capacity.csv"];
    const c = index.shelter_census["shelters_2026_expanded_plus_new_sites.csv"];
    expect([a?.operatingRows, a?.bedSum]).toEqual([36, 2234]);
    expect([b?.operatingRows, b?.bedSum]).toEqual([36, 6842]);
    expect([c?.operatingRows, c?.bedSum]).toEqual([46, 6842]);
  });

  it("reproduces the historical reference's two operating sites", () => {
    const h = index.shelter_census["shelters_2020-09.csv"];
    expect([h?.operatingRows, h?.bedSum]).toEqual([2, 198]);
  });

  it("counts a blank capacity as unlimited rather than summing it as zero", () => {
    const census = censusShelters("shelter_id,capacity,status\ns1,,operating\ns2,10,operating\n");
    expect(census.bedSum).toBe(10);
    expect(census.unlimitedCapacityRows).toBe(1);
    expect(census.operatingRows).toBe(2);
  });

  it("ignores non-operating rows the way the model does", () => {
    const census = censusShelters("shelter_id,capacity,status\ns1,50,closed\ns2,10,OPERATING\n");
    expect(census.bedSum).toBe(10);
    expect(census.operatingRows).toBe(1);
  });

  it("records the worst-family schedules as 72 edges over six waves", () => {
    for (const file of ["closures_E_r1_worst.csv", "closures_E_r2_worst.csv", "closures_E_r3_worst.csv"]) {
      expect(index.closure_census[file]?.rows).toBe(72);
      expect(index.closure_census[file]?.waveHours).toHaveLength(6);
    }
  });

  it("rejects a malformed or negative-hour closure row", () => {
    expect(() => censusClosures("node_a,node_b,activation_hour\n1,2,x\n", "f")).toThrow(/malformed/u);
    expect(() => censusClosures("node_a,node_b,activation_hour\n1,2,-1\n", "f")).toThrow(
      /negative activation_hour/u,
    );
  });
});

describe("build-shelters reproducibility", () => {
  it("produces a byte-identical index on a second build", () => {
    const again = buildShelterAssets();
    expect(again.index.bytes.toString("hex")).toBe(build.index.bytes.toString("hex"));
    expect(again.copies.map((c) => join(c.relativePath))).toEqual(
      build.copies.map((c) => join(c.relativePath)),
    );
  });
});
