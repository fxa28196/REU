/**
 * run-view.ts — one loaded run, from the archive or from the engine.
 *
 * The Python's `class Run` (verify_E_runs.py lines 208–235) reads three files
 * off disk. The port keeps the same surface (`agents`, `shelters`, `manifest`,
 * `repro`, `params`, `population`, `decision`, `num`, `has_e_block`) but takes
 * the three *documents* rather than a directory, because WP8 has to run the
 * same gates over three different producers:
 *
 *  1. an archived run directory (`docs/runs/**`) — read-only, certified;
 *  2. the TS engine's `RunOutputs` in memory (`writeRunOutputs(...)`), which is
 *     the whole point of porting the gates rather than shelling out to Python;
 *  3. a hand-built corrosion fixture, so every gate can be shown able to fail.
 *
 * A gate that could only read (1) would be untestable, and a gate that could
 * only read (2) would be unfalsifiable — it would be checking the port against
 * itself, which this project has explicitly rejected.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { readManifestText } from "@websim/pipeline/archive";

import { readFrame, type RawFrame } from "./frame.js";
import { E_AGENT_COLS } from "./constants.js";

/** Loose view of `simulation.json` — every block in it is conditional. */
export type ManifestJson = Readonly<Record<string, unknown>>;

/** The three documents a run consists of. */
export interface RunDocuments {
  readonly name: string;
  readonly agentsCsv: string;
  readonly sheltersCsv: string;
  readonly simulationJson: string;
}

export interface RunView {
  /** Leaf directory name in the archive, or a caller-supplied label. */
  readonly name: string;
  readonly agents: RawFrame;
  readonly shelters: RawFrame;
  readonly manifest: ManifestJson;
  readonly repro: ManifestJson;
  /** `reproducibility.parameters` — the EXECUTED values, not the requested. */
  readonly params: ManifestJson;
  readonly population: ManifestJson;
  readonly decision: ManifestJson;
  /** `pd.to_numeric(agents[col], errors="coerce")`. */
  num(column: string): readonly number[];
  /** True when all six Phase-E attribute columns are present. */
  hasEBlock(): boolean;
}

function record(value: unknown): ManifestJson {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as ManifestJson)
    : {};
}

class Run implements RunView {
  constructor(
    readonly name: string,
    readonly agents: RawFrame,
    readonly shelters: RawFrame,
    readonly manifest: ManifestJson,
  ) {}

  get repro(): ManifestJson {
    return record(this.manifest["reproducibility"]);
  }

  get params(): ManifestJson {
    return record(this.repro["parameters"]);
  }

  get population(): ManifestJson {
    return record(this.manifest["population"]);
  }

  get decision(): ManifestJson {
    return record(this.manifest["decision_layer"]);
  }

  num(column: string): readonly number[] {
    return this.agents.num(column);
  }

  hasEBlock(): boolean {
    return E_AGENT_COLS.every((c) => this.agents.has(c));
  }
}

/** Build a {@link RunView} from three in-memory documents. */
export function runFromDocuments(docs: RunDocuments): RunView {
  const { manifest } = readManifestText(docs.simulationJson, `${docs.name}/simulation.json`);
  return new Run(
    docs.name,
    readFrame(docs.agentsCsv, `${docs.name}/agents.csv`),
    readFrame(docs.sheltersCsv, `${docs.name}/shelters.csv`),
    manifest as ManifestJson,
  );
}

/**
 * Load an archived run directory. Mirrors the Python's constructor, including
 * its hard error when one of the three files is absent — a run missing
 * `agents.csv` is 18 of the 154 archived manifests (all `scenario-crandom-2026`)
 * and is not something a gate may quietly treat as zero.
 */
export function loadRunDir(dir: string, name = path.basename(dir)): RunView {
  const read = (file: string): string => {
    try {
      return readFileSync(path.join(dir, file), "utf8");
    } catch (cause) {
      throw new Error(`${dir} is missing ${file}`, { cause });
    }
  };
  return runFromDocuments({
    name,
    agentsCsv: read("agents.csv"),
    sheltersCsv: read("shelters.csv"),
    simulationJson: read("simulation.json"),
  });
}

// --- Python value coercions --------------------------------------------------
//
// The gates read manifest values with `float(...)`, `int(float(...))` and
// `int(...)`. Those are not the same as JavaScript's `Number(...)`, and the
// difference decides verdicts, so they are written out rather than inlined.

/**
 * Python truthiness, for the `if not mapping.get(key)` idiom the gates use.
 *
 * Written out rather than leaning on JavaScript's `!!`: the two agree on
 * `false`, `0`, `""` and absence, and disagree on `[]` and `{}` — empty
 * containers are falsy in Python and truthy in JavaScript, and gate (g) leans
 * on exactly that when it treats an empty `decision_layer` as absent.
 */
export function pyTruthy(value: unknown): boolean {
  if (value === undefined || value === null || value === false) {
    return false;
  }
  if (typeof value === "number") {
    return value !== 0 && !Number.isNaN(value);
  }
  if (typeof value === "string") {
    return value.length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === "object") {
    return Object.keys(value).length > 0;
  }
  return true;
}

/** Python `float(value)`. Throws on a value Python would not accept. */
export function pyFloat(value: unknown, what: string): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (value.trim() !== "" && Number.isFinite(parsed)) {
      return parsed;
    }
  }
  throw new Error(`${what}: cannot read ${JSON.stringify(value)} as a float`);
}

/** Python `int(float(value))` — truncation toward zero, as `int()` does. */
export function pyIntOfFloat(value: unknown, what: string): number {
  return Math.trunc(pyFloat(value, what));
}

/** `float(mapping.get(key, fallback))`. */
export function floatParam(mapping: ManifestJson, key: string, fallback: number): number {
  const raw = mapping[key];
  return raw === undefined ? fallback : pyFloat(raw, key);
}

/** `int(float(mapping.get(key, fallback)))` — the `closuresCode` idiom. */
export function intParam(mapping: ManifestJson, key: string, fallback: number): number {
  const raw = mapping[key];
  return raw === undefined ? fallback : pyIntOfFloat(raw, key);
}

/**
 * Render a manifest value the way the Python's f-strings do, so detail lines
 * stay legible: JSON numbers print bare, absent values print as given.
 */
export function showValue(value: unknown): string {
  if (value === undefined) {
    return "ABSENT";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value) ?? String(value);
}

/** `f"{value:.Nf}"`. */
export function fixed(value: number, digits: number): string {
  return Number.isFinite(value) ? value.toFixed(digits) : String(value);
}
