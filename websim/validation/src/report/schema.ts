/**
 * schema.ts — the shape of `VALIDATION_REPORT.json`, and a validator for it.
 *
 * The report is a **shipped artifact**: `IMPLEMENTATION_PLAN.md` §5.4 makes the
 * ARCHIVE-VALIDATED badge conditional on *"this build's replay passed Tiers 1–4
 * in the shipped `VALIDATION_REPORT.json`"*. So the file is read by code that
 * did not write it, in a browser, at a version that may not match the emitter's
 * — which is exactly the situation in which an unvalidated JSON blob turns a
 * typo into a badge that lies.
 *
 * ## Why the validator is hand-written rather than a schema library
 *
 * `@websim/validation` declares four dependencies and none of them is a schema
 * validator. Adding one means touching the lockfile that `npm ci` reads in CI,
 * for a document with fourteen fields. The validator below is total, returns
 * *every* problem rather than the first, and is itself corroded in
 * `test/wp9-validation-report.test.ts` — a field deleted, a type changed and a
 * tier verdict flipped each have to make it complain, or it is decoration.
 *
 * ## The one rule that is not a type rule
 *
 * `overall` is not free-form: it must be exactly the conjunction of the tier
 * verdicts the same document carries. A report that says `"green"` over a red
 * Tier-4 census is the specific lie this whole work package exists to prevent,
 * so {@link validateValidationReport} recomputes it and disagrees loudly.
 */

export const VALIDATION_REPORT_SCHEMA = "reu-wildfire-shelter-abm/validation-report/v1";

/** A tier's verdict. `degraded` means it could not be run, and is never green. */
export type TierStatus = "green" | "red" | "degraded";

export interface CheckCensus {
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly total: number;
}

export interface FailureRecord {
  readonly name: string;
  readonly detail: string;
}

export interface Tier3ConfigResult {
  /** Archive-relative run directory the configuration was taken from. */
  readonly run_dir: string;
  readonly run_class: string;
  readonly in_working_set: boolean;
  /** SHA-256 of the 41 executed parameters, canonicalised — the badge's key. */
  readonly config_sha256: string;
  readonly params_from_manifest: number;
  readonly params_from_java_code_default: number;
  readonly checks: CheckCensus;
  readonly failures: readonly FailureRecord[];
  /**
   * Failures that are facts about the RUNNER rather than about the model, kept
   * in their own list so `status` is a statement about the port.
   *
   * There is exactly one eligible check — gate (h)'s
   * `git_working_tree_dirty is false` — and it is only allowed here when the
   * measured tree really is dirty. On a clean tree the same failure is a model
   * failure and colours the configuration red, so this is a classification and
   * not an exemption. The emitter enforces that; `build.git_working_tree_dirty`
   * in the same document is the fact it is enforced against.
   */
  readonly environment_failures: readonly FailureRecord[];
  readonly status: TierStatus;
}

export interface Tier4ConfigResult {
  readonly run_dir: string;
  readonly verdict: "EXACT" | "ORDER-CHANNEL" | "UNEXPLAINED";
  readonly agents_cells_compared: number;
  readonly agents_cells_identical: number;
  readonly agents_rows: number;
  readonly agents_rows_identical: number;
  readonly shelters_cells_compared: number;
  readonly shelters_cells_identical: number;
  readonly capacity_binds: boolean;
  readonly saturated_sites: number;
  /**
   * Shelter sites in the configuration — the denominator {@link saturated_sites}
   * is a numerator of.
   *
   * Added because `tiers.tier4.caution` states saturation as "N of M sites", and
   * a number in the prose that no field beside it can confirm is exactly how the
   * false caution shipped. Every figure the caution quotes now has a field in
   * this document to be checked against.
   */
  readonly sites: number;
  readonly capacity_refusals: number;
  /**
   * Residents whose TERMINAL state is `REFUSED_ALL_FULL` — ultimately turned
   * away, having found no door at all.
   *
   * Deliberately separate from {@link capacity_refusals}, which counts refusals
   * AT A DOOR. Conflating the two is the specific error the caution used to
   * carry: a resident refused at one full door can be admitted at the next, so a
   * run can record hundreds of capacity refusals and still end with
   * `refused_all_full = 1`. "Almost nobody was ultimately turned away" is not
   * "no shelter saturates".
   */
  readonly refused_all_full: number;
  /**
   * Residents refused at NO door in EITHER run whose bytes still differ. The
   * release rule: the within-tick order channel cannot reach a resident nobody
   * ever turned away, so a non-zero value here is a defect outside the declared
   * channel.
   */
  readonly rows_never_refused_divergent: number;
  readonly rows_never_refused: number;
  /** Residents refused at least once in at least one run — the channel's reach. */
  readonly rows_door_contested: number;
  /**
   * Published for context only. `shelter_reached` is blank for every refused
   * resident, so this bucket lumps together journeys the channel rearranged
   * completely; it is NOT a defect count. See tier4-census.ts.
   */
  readonly rows_same_assignment_divergent: number;
  readonly build_time_columns_divergent: Readonly<Record<string, number>>;
  readonly final_state_flips: number;
  readonly final_state_transitions: Readonly<Record<string, number>>;
  readonly envelope_applicable: boolean;
  readonly envelope_note: string;
  readonly unexplained: readonly string[];
}

// ---------------------------------------------------------------------------
// the Tier-4 caution — DERIVED, not written
// ---------------------------------------------------------------------------

/**
 * The fields {@link tier4Caution} reads. `Tier4ConfigResult` satisfies it
 * structurally; the validator reconstructs it from an untyped document so the
 * same text can be re-derived from a file nobody trusts yet.
 */
export interface CautionInput {
  readonly verdict: string;
  readonly capacity_binds: boolean;
  readonly saturated_sites: number;
  readonly sites: number;
  readonly capacity_refusals: number;
  readonly refused_all_full: number;
  readonly rows_door_contested: number;
  readonly agents_rows: number;
  readonly final_state_flips: number;
}

/** Thousands separators, computed rather than localised — the output is a contract. */
function group(n: number): string {
  const s = Math.trunc(Math.abs(n)).toString();
  const withCommas = s.replace(/\B(?=(\d{3})+$)/gu, ",");
  return n < 0 ? `-${withCommas}` : withCommas;
}

/** `"8-12"`, or `"9"` when every configuration agrees. */
function span(rows: readonly CautionInput[], f: (r: CautionInput) => number): string {
  const xs = rows.map(f);
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  return lo === hi ? group(lo) : `${group(lo)}-${group(hi)}`;
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/**
 * The Tier-4 caution, **computed from the measured facts in the same document**.
 *
 * ## Why this is a function and not a string constant
 *
 * It used to be a constant, and the constant was false. It said of the ER / SE /
 * SE2 configurations:
 *
 * > "…no shelter saturates, so the within-tick order channel has nothing to act
 * > on."
 *
 * The archive says otherwise, and so did the very fields printed two lines above
 * it in the same JSON object: `capacity_binds: true` on all seventeen
 * configurations, `saturated_sites` 8-12 of 36 on the five EXACT ones,
 * `capacity_refusals` 291-443. `docs/runs/scenario-e/SE-E18-seed42/shelters.csv`
 * has 9 of its 36 sites at or above capacity;
 * `docs/runs/phase-e/ER-A-n6842-seed42/shelters.csv` has 8.
 *
 * The true observation those runs support is a different one: they end with
 * `REFUSED_ALL_FULL = 1`, i.e. almost nobody is **ultimately** turned away. That
 * was generalised into "no shelter saturates", and the two are not the same
 * claim — a resident refused at a full door can be admitted at the next one,
 * which produces a per-door capacity refusal with no terminal
 * `REFUSED_ALL_FULL`. Doors saturate; the people mostly still get in.
 *
 * The consequence runs the *other* way from the one the old text implied.
 * Because doors do saturate, the shuffle-order channel **is** armed on those
 * configurations — it had 274-349 door-contested rows it could have rearranged —
 * and the port reproduced every row anyway. That makes the exact per-row
 * agreement with the Java archive more notable, not less.
 *
 * ## Why deriving it closes the class
 *
 * Nothing asserted that the report's prose agreed with the numbers emitted
 * beside it, which is precisely how a sentence contradicted by its own adjacent
 * fields shipped. A prose/number cross-check would have caught it; generating
 * the prose FROM the numbers makes the disagreement unrepresentable, and
 * {@link validateValidationReport} then re-derives this text from the untyped
 * document and refuses any file whose caution does not match — so a hand-edited
 * artifact is caught too.
 *
 * Every figure below comes from a field of `tiers.tier4.configs[]`. Nothing is
 * hard-coded, including the direction of the argument: the "nothing saturated"
 * branch still exists and is still correct — it is now only reachable when the
 * measurements actually say so.
 */
export function tier4Caution(rows: readonly CautionInput[]): string {
  if (rows.length === 0) {
    return (
      "No Tier-4 attribution was recorded, so there is no EXACT verdict to qualify. " +
      "A report over zero configurations is not evidence."
    );
  }

  const exact = rows.filter((r) => r.verdict === "EXACT");
  const binding = exact.filter((r) => r.capacity_binds);
  const slack = exact.filter((r) => !r.capacity_binds);
  const other = rows.filter((r) => r.verdict !== "EXACT");

  const parts: string[] = ["An EXACT verdict does NOT generalise."];

  if (exact.length === 0) {
    parts.push(
      `No configuration here earned one — all ${group(rows.length)} diverge — so there is nothing ` +
        "in this document to over-read.",
    );
  }

  if (binding.length > 0) {
    parts.push(
      `It is NOT that capacity fails to bind. On the ARCHIVE side of the ${group(binding.length)} ` +
        `${plural(binding.length, "configuration", "configurations")} that reproduced every per-agent ` +
        `row exactly, ${span(binding, (r) => r.saturated_sites)} of ${span(binding, (r) => r.sites)} ` +
        `shelter sites reach capacity and ${span(binding, (r) => r.capacity_refusals)} residents are ` +
        "turned away at a full door, so the within-tick shuffle-order channel is ARMED, not inert. It " +
        `could have rearranged the ${span(binding, (r) => r.rows_door_contested)} of ` +
        `${span(binding, (r) => r.agents_rows)} rows that were refused at some door, and it moved none ` +
        "of them. That makes the exact per-row agreement with the Java archive MORE notable, not less.",
    );
    parts.push(
      "What is narrow there is the channel's REACH, not its existence: those runs end with " +
        `REFUSED_ALL_FULL = ${span(binding, (r) => r.refused_all_full)}, because a resident refused at ` +
        "one full door is admitted at another. A per-door capacity refusal is therefore not a terminal " +
        "outcome, and the terminal count is not a statement about whether doors filled. Reading the one " +
        "as the other is the error this caution used to carry.",
    );
  }

  if (slack.length > 0) {
    parts.push(
      `${group(slack.length)} ${plural(slack.length, "configuration", "configurations")} matched ` +
        "exactly with no door ever filling (capacity_binds false): there the order channel genuinely " +
        "had nothing to act on, and the match is no evidence about ordering at all.",
    );
  }

  if (other.length > 0) {
    parts.push(
      `Against that, the ${group(other.length)} ${plural(other.length, "configuration", "configurations")} ` +
        `that did NOT match exactly saturate ${span(other, (r) => r.saturated_sites)} of ` +
        `${span(other, (r) => r.sites)} sites, record ${span(other, (r) => r.capacity_refusals)} capacity ` +
        `refusals, leave ${span(other, (r) => r.refused_all_full)} residents in REFUSED_ALL_FULL and ` +
        `contest ${span(other, (r) => r.rows_door_contested)} of ${span(other, (r) => r.agents_rows)} ` +
        `rows — and there the balanced final_state flips do appear ` +
        `(${span(other, (r) => r.final_state_flips)}). An exact match measured where the channel's reach ` +
        "is small is not a claim about where it is large.",
    );
  }

  parts.push(
    "capacity_binds, saturated_sites, sites, capacity_refusals and refused_all_full are measured on " +
      "the ARCHIVE side of every configuration and printed beside each verdict, so the regime is stated " +
      "rather than inferred — and every number in this paragraph is computed from those fields rather " +
      "than written next to them.",
  );

  return parts.join(" ");
}

export interface AssetRecord {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
}

export interface ValidationReport {
  readonly schema: typeof VALIDATION_REPORT_SCHEMA;
  readonly generated_utc: string;
  readonly produced_by: string;
  readonly note: string;
  readonly build: {
    readonly port_commit: string;
    readonly git_working_tree_dirty: boolean | "unknown";
    readonly node: string;
  };
  readonly archive: {
    readonly present: boolean;
    readonly source: "env" | "default";
    readonly configs_replayed: number;
  };
  readonly assets: {
    readonly manifest_sha256: string;
    readonly build_commit: string;
    readonly count: number;
    /** The assets a run actually reads, not the whole build output. */
    readonly entries: readonly AssetRecord[];
  };
  readonly golden_summaries: readonly AssetRecord[];
  readonly working_set: {
    readonly manifest_sha256: string;
    readonly runs: number;
    readonly bytes: number;
    readonly payload_present: boolean;
  };
  readonly tiers: {
    readonly tier2_r3: { readonly status: TierStatus; readonly note: string };
    readonly tier3: {
      readonly status: TierStatus;
      readonly checks: CheckCensus;
      readonly configs: readonly Tier3ConfigResult[];
      /**
       * `verify_2026_runs.py`'s cross-arm identities, which are properties of a
       * SET of runs (population hash and UNREACHABLE id set must agree across
       * arms within a seed) and therefore cannot be filed under any one
       * configuration. Its checks are counted in `checks` and its failures
       * colour `status`.
       */
      readonly cross_arm: {
        readonly status: TierStatus;
        readonly members: readonly string[];
        readonly checks: CheckCensus;
        readonly failures: readonly FailureRecord[];
        readonly environment_failures: readonly FailureRecord[];
      };
    };
    readonly tier4: {
      readonly status: TierStatus;
      readonly exact: number;
      readonly order_channel: number;
      readonly unexplained: number;
      readonly caution: string;
      readonly configs: readonly Tier4ConfigResult[];
    };
  };
  readonly overall: TierStatus;
  /** Run directories whose replay earns ARCHIVE-VALIDATED for this build. */
  readonly archive_validated: readonly string[];
}

// ---------------------------------------------------------------------------
// validation
// ---------------------------------------------------------------------------

type Problems = string[];

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function req(p: Problems, at: string, obj: Record<string, unknown>, key: string, kind: string): unknown {
  const v = obj[key];
  const ok =
    kind === "string"
      ? typeof v === "string"
      : kind === "number"
        ? typeof v === "number" && Number.isFinite(v)
        : kind === "boolean"
          ? typeof v === "boolean"
          : kind === "object"
            ? isRecord(v)
            : kind === "array"
              ? Array.isArray(v)
              : false;
  if (!ok) {
    p.push(`${at}.${key}: expected ${kind}, got ${v === undefined ? "undefined" : typeof v}`);
  }
  return v;
}

const STATUSES: ReadonlySet<string> = new Set(["green", "red", "degraded"]);

function status(p: Problems, at: string, obj: Record<string, unknown>): TierStatus | null {
  const v = obj["status"];
  if (typeof v !== "string" || !STATUSES.has(v)) {
    p.push(`${at}.status: expected one of green|red|degraded, got ${JSON.stringify(v)}`);
    return null;
  }
  return v as TierStatus;
}

function census(p: Problems, at: string, v: unknown): void {
  if (!isRecord(v)) {
    p.push(`${at}: expected a check census object`);
    return;
  }
  for (const k of ["passed", "failed", "skipped", "total"]) req(p, at, v, k, "number");
  const sum = Number(v["passed"]) + Number(v["failed"]) + Number(v["skipped"]);
  if (Number.isFinite(sum) && sum !== Number(v["total"])) {
    p.push(`${at}: passed+failed+skipped = ${sum} but total = ${String(v["total"])}`);
  }
}

function assetList(p: Problems, at: string, v: unknown): void {
  if (!Array.isArray(v)) {
    p.push(`${at}: expected an array of {path, sha256, bytes}`);
    return;
  }
  v.forEach((e, i) => {
    if (!isRecord(e)) {
      p.push(`${at}[${i}]: not an object`);
      return;
    }
    req(p, `${at}[${i}]`, e, "path", "string");
    req(p, `${at}[${i}]`, e, "bytes", "number");
    const sha = e["sha256"];
    if (typeof sha !== "string" || !/^[0-9a-f]{64}$/u.test(sha)) {
      p.push(`${at}[${i}].sha256: expected 64 lowercase hex chars, got ${JSON.stringify(sha)}`);
    }
  });
}

/**
 * Phrases that assert nothing ever filled. Matched only to produce a *legible*
 * complaint: the exact re-derivation below already rejects any of them, but
 * "the caution disagrees with the document at character 118" is a much worse
 * bug report than naming the contradiction.
 *
 * This is the sentence that shipped, in the forms it could plausibly be
 * rewritten into. The list is deliberately narrow — it must not fire on the
 * correct text, which says the opposite at length and does contain the word
 * "saturate".
 */
const NO_SATURATION_CLAIMS: readonly RegExp[] = [
  /no shelters? saturates?/iu,
  /nothing (?:ever )?saturat/iu,
  /no (?:door|site)s? (?:ever )?(?:fills?|filled|saturates?)/iu,
  /capacity (?:does|did) not bind/iu,
  /no (?:site|door|shelter) reach(?:es|ed) capacity/iu,
];

/** The Tier-4 fields the caution is derived from, or `null` if any is unusable. */
function cautionInput(c: unknown): CautionInput | null {
  if (!isRecord(c)) return null;
  const num = (k: string): number | null => {
    const v = c[k];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  const verdict = c["verdict"];
  const binds = c["capacity_binds"];
  const fields = {
    saturated_sites: num("saturated_sites"),
    sites: num("sites"),
    capacity_refusals: num("capacity_refusals"),
    refused_all_full: num("refused_all_full"),
    rows_door_contested: num("rows_door_contested"),
    agents_rows: num("agents_rows"),
    final_state_flips: num("final_state_flips"),
  };
  if (typeof verdict !== "string" || typeof binds !== "boolean") return null;
  if (Object.values(fields).some((v) => v === null)) return null;
  return { verdict, capacity_binds: binds, ...(fields as Record<string, number>) } as CautionInput;
}

/** The first place two strings differ, with context — a readable diff for one field. */
function firstDifference(got: string, want: string): string {
  let i = 0;
  while (i < got.length && i < want.length && got[i] === want[i]) i++;
  const from = Math.max(0, i - 40);
  const clip = (s: string): string => JSON.stringify(s.slice(from, i + 60));
  return `at char ${i}: document has ${clip(got)}, the measurements give ${clip(want)}`;
}

/**
 * `tiers.tier4.caution` must be exactly what the same document's numbers
 * produce.
 *
 * ## Why this check exists
 *
 * The shipped report said "no shelter saturates" about configurations whose own
 * adjacent fields recorded `capacity_binds: true`, `saturated_sites` 8-12 of 36
 * and `capacity_refusals` 291-443. Nothing asserted that the prose agreed with
 * the numbers printed beside it, so it shipped. The emitter now *derives* the
 * caution from those fields ({@link tier4Caution}); this re-derives it from the
 * untyped document and refuses any file where the two disagree, which also
 * catches an artifact edited by hand after emission.
 *
 * Skipped only when a row is missing or malformed — the per-field `req` calls
 * have already complained about that, and a second cascade of noise about a
 * document that is broken anyway helps nobody.
 */
function cautionProblems(p: Problems, caution: unknown, configs: readonly unknown[]): void {
  if (typeof caution !== "string") return; // already reported by req()
  const rows: CautionInput[] = [];
  for (const c of configs) {
    const r = cautionInput(c);
    if (r === null) return;
    rows.push(r);
  }

  const binding = rows.filter((r) => r.capacity_binds);
  if (binding.length > 0) {
    for (const re of NO_SATURATION_CLAIMS) {
      const hit = re.exec(caution);
      if (hit !== null) {
        p.push(
          `tiers.tier4.caution claims ${JSON.stringify(hit[0])} while ${binding.length} of ` +
            `${rows.length} configuration(s) in the SAME document record capacity_binds=true, ` +
            `saturated_sites ${span(binding, (r) => r.saturated_sites)} of ` +
            `${span(binding, (r) => r.sites)} and capacity_refusals ` +
            `${span(binding, (r) => r.capacity_refusals)}. Doors saturating and residents being ` +
            "ultimately turned away (refused_all_full " +
            `${span(binding, (r) => r.refused_all_full)}) are different facts.`,
        );
      }
    }
  }

  const want = tier4Caution(rows);
  if (caution !== want) {
    p.push(
      "tiers.tier4.caution does not match the text its own measurements produce — " +
        firstDifference(caution, want),
    );
  }
}

/**
 * Every problem with a candidate report, as strings. Empty means valid.
 *
 * Never throws: a validator that dies on the first malformed field cannot be
 * used to *report* on a malformed file, which is the job.
 */
export function validateValidationReport(value: unknown): readonly string[] {
  const p: Problems = [];
  if (!isRecord(value)) {
    return ["root: expected an object"];
  }
  if (value["schema"] !== VALIDATION_REPORT_SCHEMA) {
    p.push(`schema: expected ${JSON.stringify(VALIDATION_REPORT_SCHEMA)}, got ${JSON.stringify(value["schema"])}`);
  }
  for (const k of ["generated_utc", "produced_by", "note"]) req(p, "", value, k, "string");

  const build = req(p, "", value, "build", "object");
  if (isRecord(build)) {
    req(p, "build", build, "port_commit", "string");
    req(p, "build", build, "node", "string");
    const dirty = build["git_working_tree_dirty"];
    if (typeof dirty !== "boolean" && dirty !== "unknown") {
      p.push(`build.git_working_tree_dirty: expected boolean or "unknown", got ${JSON.stringify(dirty)}`);
    }
  }

  const archive = req(p, "", value, "archive", "object");
  if (isRecord(archive)) {
    req(p, "archive", archive, "present", "boolean");
    req(p, "archive", archive, "configs_replayed", "number");
    if (archive["source"] !== "env" && archive["source"] !== "default") {
      p.push(`archive.source: expected "env" or "default", got ${JSON.stringify(archive["source"])}`);
    }
  }

  const assets = req(p, "", value, "assets", "object");
  if (isRecord(assets)) {
    req(p, "assets", assets, "manifest_sha256", "string");
    req(p, "assets", assets, "build_commit", "string");
    req(p, "assets", assets, "count", "number");
    assetList(p, "assets.entries", assets["entries"]);
  }
  assetList(p, "golden_summaries", value["golden_summaries"]);

  const ws = req(p, "", value, "working_set", "object");
  if (isRecord(ws)) {
    req(p, "working_set", ws, "manifest_sha256", "string");
    req(p, "working_set", ws, "runs", "number");
    req(p, "working_set", ws, "bytes", "number");
    req(p, "working_set", ws, "payload_present", "boolean");
  }

  const tiers = req(p, "", value, "tiers", "object");
  const seen: TierStatus[] = [];
  if (isRecord(tiers)) {
    const t2 = tiers["tier2_r3"];
    if (isRecord(t2)) {
      const s = status(p, "tiers.tier2_r3", t2);
      if (s !== null) seen.push(s);
      req(p, "tiers.tier2_r3", t2, "note", "string");
    } else {
      p.push("tiers.tier2_r3: expected an object");
    }

    const t3 = tiers["tier3"];
    if (isRecord(t3)) {
      const s = status(p, "tiers.tier3", t3);
      if (s !== null) seen.push(s);
      census(p, "tiers.tier3.checks", t3["checks"]);
      const cross = t3["cross_arm"];
      if (isRecord(cross)) {
        status(p, "tiers.tier3.cross_arm", cross);
        census(p, "tiers.tier3.cross_arm.checks", cross["checks"]);
        req(p, "tiers.tier3.cross_arm", cross, "members", "array");
        req(p, "tiers.tier3.cross_arm", cross, "failures", "array");
        req(p, "tiers.tier3.cross_arm", cross, "environment_failures", "array");
        if (
          Array.isArray(cross["environment_failures"]) &&
          cross["environment_failures"].length > 0 &&
          isRecord(value["build"]) &&
          value["build"]["git_working_tree_dirty"] === false
        ) {
          p.push(
            "tiers.tier3.cross_arm.environment_failures is non-empty while " +
              "build.git_working_tree_dirty is false",
          );
        }
      } else {
        p.push("tiers.tier3.cross_arm: expected an object");
      }
      const configs = t3["configs"];
      if (!Array.isArray(configs) || configs.length === 0) {
        p.push("tiers.tier3.configs: expected a non-empty array — a report over zero configurations is not evidence");
      } else {
        configs.forEach((c, i) => {
          const at = `tiers.tier3.configs[${i}]`;
          if (!isRecord(c)) {
            p.push(`${at}: not an object`);
            return;
          }
          req(p, at, c, "run_dir", "string");
          req(p, at, c, "run_class", "string");
          req(p, at, c, "in_working_set", "boolean");
          req(p, at, c, "params_from_manifest", "number");
          req(p, at, c, "params_from_java_code_default", "number");
          const sha = c["config_sha256"];
          if (typeof sha !== "string" || !/^[0-9a-f]{64}$/u.test(sha)) {
            p.push(`${at}.config_sha256: expected 64 lowercase hex chars`);
          }
          census(p, `${at}.checks`, c["checks"]);
          req(p, at, c, "failures", "array");
          req(p, at, c, "environment_failures", "array");
          const s3 = status(p, at, c);
          if (Array.isArray(c["failures"])) {
            const want = c["failures"].length === 0 ? "green" : "red";
            if (s3 !== null && s3 !== want) {
              p.push(`${at}.status is ${s3} with ${c["failures"].length} model failure(s)`);
            }
          }
          // An environment failure is only a classification when the document's
          // own build block says the tree really was dirty.
          if (
            Array.isArray(c["environment_failures"]) &&
            c["environment_failures"].length > 0 &&
            isRecord(value["build"]) &&
            value["build"]["git_working_tree_dirty"] === false
          ) {
            p.push(
              `${at}.environment_failures is non-empty while build.git_working_tree_dirty is ` +
                "false — on a clean tree there is no environment excuse for a failing check",
            );
          }
        });
      }
    } else {
      p.push("tiers.tier3: expected an object");
    }

    const t4 = tiers["tier4"];
    if (isRecord(t4)) {
      const s = status(p, "tiers.tier4", t4);
      if (s !== null) seen.push(s);
      for (const k of ["exact", "order_channel", "unexplained"]) req(p, "tiers.tier4", t4, k, "number");
      req(p, "tiers.tier4", t4, "caution", "string");
      const configs = t4["configs"];
      if (!Array.isArray(configs) || configs.length === 0) {
        p.push("tiers.tier4.configs: expected a non-empty array");
      } else {
        configs.forEach((c, i) => {
          const at = `tiers.tier4.configs[${i}]`;
          if (!isRecord(c)) {
            p.push(`${at}: not an object`);
            return;
          }
          req(p, at, c, "run_dir", "string");
          if (!["EXACT", "ORDER-CHANNEL", "UNEXPLAINED"].includes(String(c["verdict"]))) {
            p.push(`${at}.verdict: expected EXACT|ORDER-CHANNEL|UNEXPLAINED, got ${JSON.stringify(c["verdict"])}`);
          }
          for (const k of [
            "agents_cells_compared",
            "agents_cells_identical",
            "agents_rows",
            "agents_rows_identical",
            "shelters_cells_compared",
            "shelters_cells_identical",
            "saturated_sites",
            "sites",
            "capacity_refusals",
            "refused_all_full",
            "rows_never_refused_divergent",
            "rows_never_refused",
            "rows_door_contested",
            "rows_same_assignment_divergent",
            "final_state_flips",
          ]) {
            req(p, at, c, k, "number");
          }
          req(p, at, c, "capacity_binds", "boolean");
          req(p, at, c, "envelope_applicable", "boolean");
          req(p, at, c, "envelope_note", "string");
          req(p, at, c, "unexplained", "array");
          if (Array.isArray(c["unexplained"])) {
            const empty = c["unexplained"].length === 0;
            if (empty && c["verdict"] === "UNEXPLAINED") {
              p.push(`${at}: verdict UNEXPLAINED with an empty unexplained list`);
            }
            if (!empty && c["verdict"] !== "UNEXPLAINED") {
              p.push(
                `${at}: verdict ${String(c["verdict"])} carries ${c["unexplained"].length} ` +
                  "unexplained finding(s) — a divergence outside the declared channel is release-blocking",
              );
            }
          }
        });
        const unexplainedConfigs = configs.filter((c) => isRecord(c) && c["verdict"] === "UNEXPLAINED").length;
        if (Number(t4["unexplained"]) !== unexplainedConfigs) {
          p.push(
            `tiers.tier4.unexplained says ${String(t4["unexplained"])} but ${unexplainedConfigs} ` +
              "configuration(s) carry that verdict",
          );
        }
        cautionProblems(p, t4["caution"], configs);
      }
    } else {
      p.push("tiers.tier4: expected an object");
    }
  }

  const overall = value["overall"];
  if (typeof overall !== "string" || !STATUSES.has(overall)) {
    p.push(`overall: expected one of green|red|degraded, got ${JSON.stringify(overall)}`);
  } else if (seen.length === 3) {
    const want = rollUp(seen);
    if (overall !== want) {
      p.push(
        `overall says ${JSON.stringify(overall)} but the three tier verdicts ` +
          `[${seen.join(", ")}] roll up to ${JSON.stringify(want)}`,
      );
    }
  }

  if (!Array.isArray(value["archive_validated"])) {
    p.push("archive_validated: expected an array of run directories");
  }

  return p;
}

/** `red` beats `degraded` beats `green`. A tier that could not run is not green. */
export function rollUp(statuses: readonly TierStatus[]): TierStatus {
  if (statuses.includes("red")) return "red";
  if (statuses.includes("degraded")) return "degraded";
  return "green";
}
