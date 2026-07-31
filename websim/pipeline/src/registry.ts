/**
 * registry.ts — port of `geography.science.ScienceRegistry.load()`, the
 * governance fail-fast, relocated to build time per plan Q10.
 *
 * Q10's whole point: running the gate in the pipeline is *strictly stronger*
 * than running it at page load, because a registry defect stops the asset from
 * existing at all rather than stopping a page that already shipped. So every
 * throw below must stay a throw — downgrading one to a warning would silently
 * restore the weaker guarantee.
 *
 * The rules, in the Java order (which is the order the errors surface in):
 *   readStrict parse (duplicate headers, field-count mismatch, empty file)
 *   → required columns present
 *   → non-empty, unique ids
 *   → `evidence_class` ∈ {M,L,C,A,F}; `status` ∈ {implemented, specified,
 *     placeholder, deprecated}
 *   → every `affects_*` is literally `yes`/`no`, and at least one is `yes`
 *     unless the row is `deprecated`
 *   → evidence class L or M needs a `doi_or_dataset` that is neither empty nor
 *     the literal `none`
 *   → evidence class L or C needs an `uncertainty` that is neither empty nor
 *     the literal `none`
 * and for assumptions: classification ∈ {measured, literature, calibrated,
 * assumption, future_work}; status ∈ {active, retired, blocking}; a row
 * classified `assumption` must carry a `sensitivity_plan`.
 *
 * Deliberately NOT added: a DOI *resolvability* check. The gate tests that the
 * field is non-empty and not the literal `none`; claiming more would be the
 * `gate-resolvable-doi` claim the linter already bans.
 */

import { javaTrim, readStrictCsvText, type CsvRow } from "./csv-loader.js";

export class RegistryValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "RegistryValidationError";
  }
}

const EVIDENCE_CLASSES: readonly string[] = ["M", "L", "C", "A", "F"];
const VARIABLE_STATUSES: readonly string[] = [
  "implemented",
  "specified",
  "placeholder",
  "deprecated",
];
const ASSUMPTION_CLASSES: readonly string[] = [
  "measured",
  "literature",
  "calibrated",
  "assumption",
  "future_work",
];
const ASSUMPTION_STATUSES: readonly string[] = ["active", "retired", "blocking"];

export const VARIABLE_COLUMNS: readonly string[] = [
  "variable_id",
  "name",
  "description",
  "mechanism",
  "math",
  "units",
  "evidence_class",
  "source",
  "doi_or_dataset",
  "uncertainty",
  "affects_movement",
  "affects_exposure",
  "affects_shelter_access",
  "affects_reporting",
  "status",
  "implementation",
];

export const ASSUMPTION_COLUMNS: readonly string[] = [
  "assumption_id",
  "statement",
  "classification",
  "rationale",
  "affects",
  "sensitivity_plan",
  "status",
  "source_or_doc",
];

const AFFECTS_COLUMNS: readonly string[] = [
  "affects_movement",
  "affects_exposure",
  "affects_shelter_access",
  "affects_reporting",
];

export interface RegistryVariable {
  readonly id: string;
  readonly name: string;
  readonly evidenceClass: string;
  readonly status: string;
  readonly doiOrDataset: string;
  readonly uncertainty: string;
}

export interface RegistryAssumption {
  readonly id: string;
  readonly statement: string;
  readonly classification: string;
  readonly status: string;
}

/** `ScienceRegistry.value()` — a missing key reads as `""`, and every read is trimmed. */
function value(row: CsvRow, key: string): string {
  return javaTrim(row.get(key) ?? "");
}

function requireColumns(label: string, firstRow: CsvRow, required: readonly string[]): void {
  for (const col of required) {
    if (!firstRow.has(col)) {
      throw new RegistryValidationError(`${label}: missing required column '${col}'`);
    }
  }
}

/** Full `readVariables` validation over already-decoded text. */
export function validateVariables(text: string, label: string): RegistryVariable[] {
  const rows = readStrictCsvText(text, label);
  const first = rows[0];
  if (first === undefined) {
    throw new RegistryValidationError(`Variable registry is empty: ${label}`);
  }
  requireColumns(label, first, VARIABLE_COLUMNS);

  const out: RegistryVariable[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const id = value(r, "variable_id");
    if (id === "") {
      throw new RegistryValidationError(`${label}: a row has an empty variable_id`);
    }
    if (seen.has(id)) {
      throw new RegistryValidationError(`${label}: duplicate variable_id '${id}'`);
    }
    seen.add(id);

    const cls = value(r, "evidence_class");
    if (!EVIDENCE_CLASSES.includes(cls)) {
      throw new RegistryValidationError(
        `${label} [${id}]: evidence_class '${cls}' is not one of M, L, C, A, F`,
      );
    }
    const status = value(r, "status");
    if (!VARIABLE_STATUSES.includes(status)) {
      throw new RegistryValidationError(
        `${label} [${id}]: status '${status}' is not one of implemented, specified, placeholder, deprecated`,
      );
    }

    let anyAffect = false;
    for (const col of AFFECTS_COLUMNS) {
      const v = value(r, col);
      if (v !== "yes" && v !== "no") {
        throw new RegistryValidationError(
          `${label} [${id}]: ${col} must be yes or no, got '${v}'`,
        );
      }
      anyAffect = anyAffect || v === "yes";
    }
    if (!anyAffect && status !== "deprecated") {
      throw new RegistryValidationError(
        `${label} [${id}]: every affects_* flag is 'no'; a variable that affects nothing` +
          " must be marked deprecated or removed",
      );
    }

    const doi = value(r, "doi_or_dataset");
    const uncertainty = value(r, "uncertainty");
    if ((cls === "L" || cls === "M") && (doi === "" || doi === "none")) {
      throw new RegistryValidationError(
        `${label} [${id}]: evidence_class ${cls} requires a DOI or dataset id in doi_or_dataset`,
      );
    }
    if ((cls === "L" || cls === "C") && (uncertainty === "" || uncertainty === "none")) {
      throw new RegistryValidationError(
        `${label} [${id}]: evidence_class ${cls} requires a non-'none' uncertainty range so it can be sensitivity-tested`,
      );
    }

    out.push({
      id,
      name: value(r, "name"),
      evidenceClass: cls,
      status,
      doiOrDataset: doi,
      uncertainty,
    });
  }
  return out;
}

/** Full `readAssumptions` validation over already-decoded text. */
export function validateAssumptions(text: string, label: string): RegistryAssumption[] {
  const rows = readStrictCsvText(text, label);
  const first = rows[0];
  if (first === undefined) {
    throw new RegistryValidationError(`Assumption registry is empty: ${label}`);
  }
  requireColumns(label, first, ASSUMPTION_COLUMNS);

  const out: RegistryAssumption[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const id = value(r, "assumption_id");
    if (id === "") {
      throw new RegistryValidationError(`${label}: a row has an empty assumption_id`);
    }
    if (seen.has(id)) {
      throw new RegistryValidationError(`${label}: duplicate assumption_id '${id}'`);
    }
    seen.add(id);
    const cls = value(r, "classification");
    if (!ASSUMPTION_CLASSES.includes(cls)) {
      throw new RegistryValidationError(
        `${label} [${id}]: classification '${cls}' is not one of measured, literature, calibrated, assumption, future_work`,
      );
    }
    const status = value(r, "status");
    if (!ASSUMPTION_STATUSES.includes(status)) {
      throw new RegistryValidationError(
        `${label} [${id}]: status '${status}' is not one of active, retired, blocking`,
      );
    }
    if (cls === "assumption" && value(r, "sensitivity_plan") === "") {
      throw new RegistryValidationError(
        `${label} [${id}]: classification 'assumption' requires a sensitivity_plan`,
      );
    }
    out.push({ id, statement: value(r, "statement"), classification: cls, status });
  }
  return out;
}

export interface RegistryCensus {
  readonly variableCount: number;
  readonly assumptionCount: number;
  /** Variables per evidence class in the fixed order M, L, C, A, F. */
  readonly evidenceClassCensus: Readonly<Record<string, number>>;
  /** Assumptions per classification, in the declared vocabulary order. */
  readonly assumptionClassCensus: Readonly<Record<string, number>>;
  /** Variables that are present but inert — never quotable as results. */
  readonly placeholderVariableIds: readonly string[];
  /** Assumptions that must be resolved before publication. */
  readonly blockingAssumptionIds: readonly string[];
  /** `ScienceRegistry.summaryLine()`, reproduced for the build log. */
  readonly summaryLine: string;
}

export function censusOf(
  variables: readonly RegistryVariable[],
  assumptions: readonly RegistryAssumption[],
): RegistryCensus {
  const evidenceClassCensus: Record<string, number> = {};
  for (const c of EVIDENCE_CLASSES) {
    evidenceClassCensus[c] = 0;
  }
  for (const v of variables) {
    evidenceClassCensus[v.evidenceClass] = (evidenceClassCensus[v.evidenceClass] ?? 0) + 1;
  }
  const assumptionClassCensus: Record<string, number> = {};
  for (const c of ASSUMPTION_CLASSES) {
    assumptionClassCensus[c] = 0;
  }
  for (const a of assumptions) {
    assumptionClassCensus[a.classification] = (assumptionClassCensus[a.classification] ?? 0) + 1;
  }
  const placeholderVariableIds = variables.filter((v) => v.status === "placeholder").map((v) => v.id);
  const blockingAssumptionIds = assumptions.filter((a) => a.status === "blocking").map((a) => a.id);
  // Java renders the census map as `{M=3, L=17, ...}` (AbstractMap.toString).
  const censusText = EVIDENCE_CLASSES.map((c) => `${c}=${evidenceClassCensus[c] ?? 0}`).join(", ");
  const summaryLine =
    `[ScienceRegistry] ${variables.length} variables {${censusText}}, ` +
    `${assumptions.length} assumptions; ${placeholderVariableIds.length} placeholder variable(s), ` +
    `${blockingAssumptionIds.length} blocking assumption(s)`;
  return {
    variableCount: variables.length,
    assumptionCount: assumptions.length,
    evidenceClassCensus,
    assumptionClassCensus,
    placeholderVariableIds,
    blockingAssumptionIds,
    summaryLine,
  };
}
