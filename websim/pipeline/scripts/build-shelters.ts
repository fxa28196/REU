/**
 * build-shelters.ts — WP4(b). Ship the shelter and closure CSVs VERBATIM and
 * emit the `scenarioCode` → file index taken from the certified chain in
 * `ContextCreator` (plan §4 asset table; PORT_MAP §3.1, §4.1, §4.3).
 *
 *   npx tsx pipeline/scripts/build-shelters.ts          # write
 *   npx tsx pipeline/scripts/build-shelters.ts --check  # verify, exit 1 on drift
 *
 * "Verbatim" is a fidelity decision, not laziness (plan §4: "parsed in-browser by
 * the ported CsvLoader — keeps loader parity honest"). Pre-parsing these files
 * into JSON would move the trim/BOM/short-row/blank-capacity semantics of
 * PORT_MAP §4.2 out of the browser and into a Node script nobody validates
 * against Java, and the parity claim would quietly become untestable. The bytes
 * are copied unchanged, digest to digest.
 *
 * The census this script computes is therefore a CHECK, never the shipped
 * representation: it re-reads each copied file through the ported loader and
 * records site/bed counts so a truncated or re-encoded copy fails the build.
 *
 * V45 (`shelterPolicyVariant`) is included: the index records, per code, the
 * `_elayer` variant file and whether it exists, and `resolveShelterFile()`
 * reproduces `ContextCreator`'s fail-fast — a run that asks for recorded pet
 * policy and cannot have it must stop, never silently fall back to the blanket
 * default.
 */

import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  checkMode,
  failBuild,
  geographyPath,
  sha256,
  toJsonBytes,
  writeAsset,
  type WriteResult,
} from "../src/asset-io.js";
import { javaParseDouble, readCsvText } from "../src/csv-loader.js";
import {
  CLOSURE_CHAIN,
  CLOSURES_DIR,
  CLOSURE_WORST_DRAWS,
  SCENARIO_CHAIN,
  SEVERE_LABEL_CODES,
  SHELTERS_DIR,
} from "../src/scenario-index.js";

export const SHELTER_INDEX_SCHEMA = "reu-wildfire-shelter-abm/scenario-index/v1" as const;

/** Where copied CSVs land under `pipeline/out`. */
const SHELTERS_OUT = "assets/data/shelters";
const CLOSURES_OUT = "assets/data/closures";

export interface ShelterCensus {
  readonly rows: number;
  readonly columns: number;
  /** `status` equalsIgnoreCase "operating" — the only sites the model instantiates. */
  readonly operatingRows: number;
  /** Sum of parseable capacities over operating rows. */
  readonly bedSum: number;
  /** Operating rows with a blank capacity: blank means UNLIMITED, never zero. */
  readonly unlimitedCapacityRows: number;
  /** True when the file carries the V45 `pet_intake` column. */
  readonly hasPetIntake: boolean;
}

/**
 * Re-read a shipped shelter CSV through the ported loader. Blank capacity is
 * counted, never coerced: PORT_MAP §4.3 lists "capacity blank = unlimited" as a
 * semantic that survives any format change, and summing it as 0 would understate
 * every arm.
 */
export function censusShelters(text: string): ShelterCensus {
  const rows = readCsvText(text);
  const first = rows[0];
  let operatingRows = 0;
  let bedSum = 0;
  let unlimitedCapacityRows = 0;
  for (const r of rows) {
    if ((r.get("status") ?? "").toLowerCase() !== "operating") {
      continue;
    }
    operatingRows += 1;
    const cap = r.get("capacity") ?? "";
    if (cap === "") {
      unlimitedCapacityRows += 1;
      continue;
    }
    const v = javaParseDouble(cap);
    if (!Number.isNaN(v)) {
      bedSum += v;
    }
  }
  return {
    rows: rows.length,
    columns: first === undefined ? 0 : first.size,
    operatingRows,
    bedSum,
    unlimitedCapacityRows,
    hasPetIntake: first !== undefined && first.has("pet_intake"),
  };
}

export interface ClosureCensus {
  readonly rows: number;
  /** Distinct activation hours, ascending — the wave schedule. */
  readonly waveHours: readonly number[];
}

/**
 * Closure parse mirrors `ContextCreator`'s: numeric `node_a`/`node_b`/
 * `activation_hour` or throw; a negative hour is fatal. An hour at or after the
 * run end is only a WARN there (the wave is scheduled but inert), so it is
 * recorded rather than rejected here — the run window is not known at build time.
 */
export function censusClosures(text: string, label: string): ClosureCensus {
  const rows = readCsvText(text);
  const hours = new Set<number>();
  let rowNo = 1;
  for (const r of rows) {
    rowNo += 1;
    const a = r.get("node_a") ?? "";
    const b = r.get("node_b") ?? "";
    const h = r.get("activation_hour") ?? "";
    if (!/^[+-]?\d+$/u.test(a) || !/^[+-]?\d+$/u.test(b) || !/^[+-]?\d+$/u.test(h)) {
      throw new Error(
        `${label} row ${rowNo} is malformed (need numeric node_a,node_b,activation_hour)`,
      );
    }
    const hour = Number(h);
    if (hour < 0) {
      throw new Error(`${label} row ${rowNo}: negative activation_hour ${hour}`);
    }
    hours.add(hour);
  }
  return { rows: rows.length, waveHours: [...hours].sort((x, y) => x - y) };
}

export interface ShelterBuild {
  readonly copies: readonly { readonly relativePath: string; readonly bytes: Buffer; readonly sourceFile: string }[];
  readonly index: { readonly relativePath: string; readonly bytes: Buffer };
}

/** Every shelter file the chain can select, plus the `_elayer` variants that exist. */
function shelterFilesToShip(): string[] {
  const names = new Set<string>();
  for (const entry of SCENARIO_CHAIN) {
    names.add(entry.sheltersFile);
    if (existsSync(geographyPath(join(SHELTERS_DIR, entry.elayerFile)))) {
      names.add(entry.elayerFile);
    }
  }
  return [...names].sort();
}

/**
 * Build the verbatim copies and the index in memory. Files not read by Java
 * (`shelters_multnomah_2026.csv`, `geocode_cache_2026.json`, `retired/*`) are
 * never shipped: PORT_MAP §4.1 names them explicitly as unread, and shipping an
 * unread file invites someone to read it.
 */
export function buildShelterAssets(): ShelterBuild {
  const copies: { relativePath: string; bytes: Buffer; sourceFile: string }[] = [];
  const shelterCensuses: Record<string, ShelterCensus & { sha256: string; bytes: number }> = {};

  for (const name of shelterFilesToShip()) {
    const repoRelative = `${SHELTERS_DIR}/${name}`;
    const raw = readFileSync(geographyPath(repoRelative));
    copies.push({ relativePath: `${SHELTERS_OUT}/${name}`, bytes: raw, sourceFile: repoRelative });
    // Census the COPY's bytes, so a copy that differs from the source cannot
    // pass by being censused from the source.
    shelterCensuses[name] = {
      ...censusShelters(raw.toString("utf8")),
      sha256: sha256(raw),
      bytes: raw.length,
    };
  }

  const closureCensuses: Record<string, ClosureCensus & { sha256: string; bytes: number }> = {};
  for (const entry of CLOSURE_CHAIN) {
    if (closureCensuses[entry.file] !== undefined) {
      continue;
    }
    const repoRelative = `${CLOSURES_DIR}/${entry.file}`;
    const raw = readFileSync(geographyPath(repoRelative));
    copies.push({ relativePath: `${CLOSURES_OUT}/${entry.file}`, bytes: raw, sourceFile: repoRelative });
    closureCensuses[entry.file] = {
      ...censusClosures(raw.toString("utf8"), entry.file),
      sha256: sha256(raw),
      bytes: raw.length,
    };
  }

  const index = {
    schema: SHELTER_INDEX_SCHEMA,
    note:
      "scenarioCode -> shelter file, transcribed from ContextCreator.build(). Any code not " +
      "listed resolves to the fallback entry (arm A) with no range error, exactly as the " +
      "Java else-branch does. Trust the code, not a stale comment: code 2 meant HISTORICAL " +
      "before the redesign and is now arm C.",
    shelters_dir: "data/shelters",
    closures_dir: "data/closures",
    fallback_scenario_code: 0,
    severe_label_codes: SEVERE_LABEL_CODES,
    severe_label_warning:
      "scenarioCode 18/19/20 are LABELS; severity comes from smokeSeriesCode/smokeScale and " +
      "closuresCode. With smokeSeriesCode=0 the arm is a severe label over an unsevere run.",
    shelter_policy_variant:
      "shelterPolicyVariant=1 (V45) reads <base>_elayer.csv, which carries the recorded " +
      "pet_intake policy. A missing variant file is a fail-fast, never a silent fallback.",
    scenarios: SCENARIO_CHAIN.map((e) => {
      const elayerAvailable = shelterCensuses[e.elayerFile] !== undefined;
      return {
        code: e.code,
        scenario_name: e.scenarioName,
        shelters_file: e.sheltersFile,
        elayer_file: e.elayerFile,
        elayer_available: elayerAvailable,
        reserve_driven: e.reserveDriven,
      };
    }),
    closures: CLOSURE_CHAIN.map((e) => ({
      code: e.code,
      draw: e.draw,
      file: e.file,
      label: e.label,
    })),
    closure_worst_draws: CLOSURE_WORST_DRAWS,
    shelter_census: shelterCensuses,
    closure_census: closureCensuses,
  };

  return {
    copies,
    index: { relativePath: "assets/shelter-index.json", bytes: toJsonBytes(index) },
  };
}

/** Asset-manifest rows for this builder, used by `checksums.ts`. */
export function shelterManifestInputs(): { readonly id: string; readonly sourceFile: string }[] {
  const build = buildShelterAssets();
  return [
    ...build.copies.map((c) => ({ id: c.relativePath, sourceFile: c.sourceFile })),
    {
      id: build.index.relativePath,
      // The index is derived from the Java chain, not from one input file.
      sourceFile: "Geography/src/geography/agents/ContextCreator.java",
    },
  ];
}

function main(): void {
  const check = checkMode();
  let build: ShelterBuild;
  try {
    build = buildShelterAssets();
  } catch (e) {
    return failBuild(`build-shelters: ${e instanceof Error ? e.message : String(e)}`);
  }

  let drift = 0;
  const results: WriteResult[] = [];
  for (const copy of build.copies) {
    const r = writeAsset(copy.relativePath, copy.bytes, check);
    results.push(r);
    if (check && !r.unchanged) {
      drift += 1;
      process.stdout.write(`DRIFT    ${r.id}\n`);
    }
    // Verbatim means verbatim: the copy's digest must equal the source's.
    const sourceDigest = sha256(readFileSync(geographyPath(copy.sourceFile)));
    if (sourceDigest !== r.sha256) {
      return failBuild(`build-shelters: ${r.id} is not a verbatim copy of ${copy.sourceFile}`);
    }
  }
  const indexResult = writeAsset(build.index.relativePath, build.index.bytes, check);
  if (check && !indexResult.unchanged) {
    drift += 1;
    process.stdout.write(`DRIFT    ${indexResult.id}\n`);
  }

  const shelters = results.filter((r) => r.id.startsWith(SHELTERS_OUT)).length;
  const closures = results.filter((r) => r.id.startsWith(CLOSURES_OUT)).length;
  process.stdout.write(
    `${check ? "checked" : "wrote  "} ${shelters} shelter CSV(s), ${closures} closure CSV(s), ` +
      `${SCENARIO_CHAIN.length} scenario codes, ${basename(indexResult.id)} (${indexResult.bytes} bytes)\n`,
  );
  if (check && drift > 0) {
    failBuild(`build-shelters: ${drift} asset(s) differ from a fresh build — rerun without --check.`);
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
