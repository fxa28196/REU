/**
 * tier3-golden.ts — Tier-3 statistical cross-validation against the committed
 * golden summaries.
 *
 * `IMPLEMENTATION_PLAN.md` §5.1 Tier 3 lists what a replay owes the archive:
 *
 * > sheltered counts within 9-seed archive ranges; `unreachable` identical
 * > across arms within seed and its id-set hash equal to Java's (exact — the
 * > world is Tier-1 identical); realised marginals **equal, not close**;
 * > 54,002.8 µg·m⁻³·h never-sheltered identity exact; dose ≡ exposure × 0.61 to
 * > FP precision; U-03 bed-sum; capacity sums per arm.
 *
 * Every one of those numbers already exists, derived from archive bytes, in
 * `validation/golden-summaries/`. This module reads them and applies them to a
 * replayed run. It computes nothing about the archive itself.
 *
 * ## The oracle discipline, and how the one transcription here is protected
 *
 * Four of the five checks compare the port to a **committed digest of Java
 * bytes**, so there is nothing to get wrong: the expectation was produced by a
 * different program, before this one existed.
 *
 * The exception is {@link realisedMarginals}, which has to be *computed* from a
 * run's `agents.csv` because the port's CSV is text in memory rather than a
 * digested archive directory. That is a transcription of
 * `pipeline/src/archive/golden.ts`'s private `realisedMarginals`, and a
 * transcription is exactly the kind of second copy that drifts. It is protected
 * by being run over the **archived Java bytes** as well: `checkGoldenMarginals`
 * scores the archive side against the committed digest first, and only then the
 * port. If the transcription drifts, the archive side goes red — against a file
 * neither this module nor the port produced — and the port's verdict is never
 * reached. A function checked only against the thing it is checking would prove
 * nothing.
 *
 * ## Envelope AND equality, not envelope alone
 *
 * The plan's rule is *"within the 9-seed archive range"*, which is the right
 * rule for a *live user run* at a swept configuration. A replay is stronger
 * than that: it is the same seed, so the archive holds the exact number the run
 * must produce. Both are asserted, and separately — the equality check is the
 * evidence, and the envelope check is the plan's clause. A replay that landed
 * inside the range but on the wrong seed's value would pass the second and fail
 * the first, which is the point.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import type { Checks } from "./checks.js";
import type { RunView } from "./run-view.js";

const here = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url));

/** Directory holding the committed digests of the read-only Java archive. */
export const GOLDEN_DIR = here("../../golden-summaries");

export const GOLDEN_FILES = [
  "sheltered-envelopes",
  "demographic-marginals",
  "capacity-sums",
  "cross-arm-hashes",
  "exposure-identities",
] as const;

export type GoldenFileName = (typeof GOLDEN_FILES)[number];

interface GoldenDocument {
  readonly schema: string;
  readonly values: Record<string, unknown>;
}

export type GoldenSummaries = Readonly<Record<GoldenFileName, GoldenDocument>>;

/** Read the five committed digests. Absence is a hard error, never a skip. */
export function loadGoldenSummaries(dir: string = GOLDEN_DIR): GoldenSummaries {
  const out: Partial<Record<GoldenFileName, GoldenDocument>> = {};
  for (const name of GOLDEN_FILES) {
    const file = path.join(dir, `${name}.json`);
    const parsed = JSON.parse(readFileSync(file, "utf8")) as GoldenDocument;
    if (typeof parsed.schema !== "string" || typeof parsed.values !== "object") {
      throw new Error(`${file}: not a golden-summary document (no schema/values)`);
    }
    out[name] = parsed;
  }
  return out as GoldenSummaries;
}

/** `present-day-three-arm/A-seed42` → `present-day-three-arm/A-seed*`. */
export function configKeyOf(runDir: string): string {
  return runDir.replace(/seed\d+/u, "seed*");
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

// ---------------------------------------------------------------------------
// the one computed quantity
// ---------------------------------------------------------------------------

/**
 * Transcription of `pipeline/src/archive/golden.ts`'s `realisedMarginals`,
 * over a {@link RunView} rather than an `ArchiveTable`.
 *
 * Raw-cell equality (`"1"`), not numeric coercion — the committed digest is
 * defined on raw text, so `1.0` is deliberately not `1`.
 */
export function realisedMarginals(run: RunView): Record<string, number> {
  const col = (name: string): readonly string[] => run.agents.column(name);
  const n = run.agents.rows.length;
  const count = (name: string): number => col(name).filter((c) => c === "1").length;
  const r6 = (x: number): number => Math.round(x * 1e6) / 1e6;
  const age = col("age_years");
  const speed = col("walking_speed_mps");
  const sex = col("sex");
  let age55 = 0;
  let male = 0;
  let speedSum = 0;
  for (let i = 0; i < n; i += 1) {
    if (Number(age[i]) >= 55) age55 += 1;
    if (sex[i] === "MALE") male += 1;
    speedSum += Number(speed[i]);
  }
  return {
    n,
    mobility_limited: r6(count("mobility_limited") / n),
    asthma: r6(count("asthma_flag") / n),
    copd: r6(count("copd_flag") / n),
    any_respiratory: r6(count("any_respiratory") / n),
    chronic_physical: r6(count("chronic_physical") / n),
    vulnerable_any: r6(count("vulnerable_flag") / n),
    age_55plus: r6(age55 / n),
    male: r6(male / n),
    mean_walking_speed_mps: r6(speedSum / n),
  };
}

/** `capacity` / `final_occupancy` sums and the site census off `shelters.csv`. */
export function shelterCensus(run: RunView): {
  shelter_sites: number;
  capacity_sum: number;
  unlimited_capacity_sites: number;
  final_occupancy_sum: number;
} {
  const cap = run.shelters.column("capacity");
  const occ = run.shelters.has("final_occupancy")
    ? run.shelters.column("final_occupancy")
    : cap.map(() => "");
  let capacitySum = 0;
  let unlimited = 0;
  let occupancySum = 0;
  for (let i = 0; i < cap.length; i += 1) {
    // A BLANK capacity means UNLIMITED, never zero (PORT_MAP §4.3).
    if (cap[i] === "") unlimited += 1;
    else capacitySum += Math.trunc(Number(cap[i]));
    if (occ[i] !== "") occupancySum += Math.trunc(Number(occ[i]));
  }
  return {
    shelter_sites: cap.length,
    capacity_sum: capacitySum,
    unlimited_capacity_sites: unlimited,
    final_occupancy_sum: occupancySum,
  };
}

/** Distinct raw `cumulative_dose_ugm3h` strings over the never-sheltered rows. */
export function neverShelteredExposure(run: RunView): {
  count: number;
  distinct: readonly string[];
} {
  const state = run.agents.column("final_state");
  const dose = run.agents.column("cumulative_dose_ugm3h");
  const seen = new Set<string>();
  let count = 0;
  for (let i = 0; i < state.length; i += 1) {
    if (state[i] === "SHELTERED") continue;
    count += 1;
    seen.add(dose[i] as string);
  }
  return { count, distinct: [...seen].sort() };
}

/** Rows where `vwe_ugm3h` and `cumulative_dose_ugm3h` differ as RAW TEXT. */
export function vweDoseMismatchRows(run: RunView): number {
  if (!run.agents.has("vwe_ugm3h")) return -1;
  const vwe = run.agents.column("vwe_ugm3h");
  const dose = run.agents.column("cumulative_dose_ugm3h");
  let bad = 0;
  for (let i = 0; i < vwe.length; i += 1) {
    if (vwe[i] !== dose[i]) bad += 1;
  }
  return bad;
}

// ---------------------------------------------------------------------------
// the checks
// ---------------------------------------------------------------------------

export interface GoldenCheckContext {
  /** Archive-relative run directory, e.g. `present-day-three-arm/A-seed42`. */
  readonly runDir: string;
  readonly seed: number;
  readonly arm: "A" | "B" | "C";
  readonly golden: GoldenSummaries;
}

function populationBlock(run: RunView): Record<string, unknown> {
  return record(run.manifest["population"]);
}

/**
 * The headline population census: EQUAL to the archived run at this seed, and
 * inside the archived seed-to-seed envelope for this configuration.
 */
export function checkGoldenEnvelope(ck: Checks, run: RunView, ctx: GoldenCheckContext): void {
  const group = record(ctx.golden["sheltered-envelopes"].values[configKeyOf(ctx.runDir)]);
  const bySeed = record(group["by_seed"]);
  const archived = record(bySeed[String(ctx.seed)]);
  if (Object.keys(archived).length === 0) {
    ck.add(
      `(t3) [${run.name}] sheltered-envelopes carries this run`,
      false,
      `no by_seed[${ctx.seed}] under ${configKeyOf(ctx.runDir)} — the digest cannot grade it`,
    );
    return;
  }

  const pop = populationBlock(run);
  const fields = ["sheltered", "refused_all_full", "unreachable", "pre_evac", "en_route", "n_agents"];
  const bad: string[] = [];
  for (const f of fields) {
    const want = numberOrNull(archived[f]);
    const got = numberOrNull(pop[f]);
    if (want !== null && want !== got) bad.push(`${f}: port ${String(got)} vs archive ${String(want)}`);
  }
  ck.add(
    `(t3) [${run.name}] population census equals the archived run at seed ${ctx.seed}`,
    bad.length === 0,
    bad.length === 0
      ? fields.map((f) => `${f}=${String(pop[f])}`).join(" ")
      : bad.join("; "),
    bad,
  );

  const outside: string[] = [];
  for (const f of ["sheltered", "refused_all_full", "unreachable"]) {
    const env = record(group[f]);
    const lo = numberOrNull(env["min"]);
    const hi = numberOrNull(env["max"]);
    const got = numberOrNull(pop[f]);
    if (lo === null || hi === null || got === null) continue;
    if (got < lo || got > hi) outside.push(`${f}=${got} outside [${lo}, ${hi}]`);
  }
  ck.add(
    `(t3) [${run.name}] population census inside the archived ${String(
      (group["seeds"] as unknown[] | undefined)?.length ?? 0,
    )}-seed envelope`,
    outside.length === 0,
    outside.length === 0 ? "sheltered / refused_all_full / unreachable all in range" : outside.join("; "),
  );
}

/**
 * Realised demographic marginals, EQUAL not close — and the transcription is
 * scored against the archive first, so a drifting transcription is caught by a
 * digest neither side produced.
 */
export function checkGoldenMarginals(
  ck: Checks,
  run: RunView,
  archivedRun: RunView,
  ctx: GoldenCheckContext,
): void {
  const entry = record(ctx.golden["demographic-marginals"].values[ctx.runDir]);
  const want = record(entry["derived_from_agents_csv"]);
  if (Object.keys(want).length === 0) {
    ck.add(
      `(t3) [${run.name}] demographic-marginals carries this run`,
      false,
      `no values[${ctx.runDir}].derived_from_agents_csv in the committed digest`,
    );
    return;
  }

  const compare = (label: string, view: RunView): string[] => {
    const got = realisedMarginals(view);
    return Object.keys(want)
      .filter((k) => !Object.is(numberOrNull(want[k]), got[k] ?? null))
      .map((k) => `${label} ${k}: ${String(got[k])} vs digest ${String(want[k])}`);
  };

  // The oracle step. If this fails the transcription is wrong, and the port's
  // verdict below would be meaningless either way.
  const archiveBad = compare("archive", archivedRun);
  ck.add(
    `(t3) [${run.name}] the marginals transcription reproduces the committed digest on JAVA bytes`,
    archiveBad.length === 0,
    archiveBad.length === 0
      ? `${Object.keys(want).length} marginals recomputed from the archived agents.csv`
      : archiveBad.join("; "),
    archiveBad,
  );

  const portBad = compare("port", run);
  ck.add(
    `(t3) [${run.name}] realised marginals EQUAL the archive (not close)`,
    portBad.length === 0,
    portBad.length === 0
      ? Object.entries(want)
          .map(([k, v]) => `${k}=${String(v)}`)
          .join(" ")
      : portBad.join("; "),
    portBad,
  );
}

/** Capacity sums and the site census per configuration (U-03 bed-sum inputs). */
export function checkGoldenCapacity(ck: Checks, run: RunView, ctx: GoldenCheckContext): void {
  const group = record(ctx.golden["capacity-sums"].values[configKeyOf(ctx.runDir)]);
  const want = record(record(group["runs"])[ctx.runDir]);
  if (Object.keys(want).length === 0) {
    ck.add(
      `(t3) [${run.name}] capacity-sums carries this run`,
      false,
      `no runs[${ctx.runDir}] under ${configKeyOf(ctx.runDir)}`,
    );
    return;
  }
  const got = shelterCensus(run);
  const bad = (["shelter_sites", "capacity_sum", "unlimited_capacity_sites", "final_occupancy_sum"] as const)
    .filter((k) => numberOrNull(want[k]) !== got[k])
    .map((k) => `${k}: port ${got[k]} vs archive ${String(want[k])}`);
  ck.add(
    `(t3) [${run.name}] capacity sum + site census equal the archive`,
    bad.length === 0,
    bad.length === 0
      ? `sites=${got.shelter_sites} capacity=${got.capacity_sum} occupancy=${got.final_occupancy_sum}`
      : bad.join("; "),
    bad,
  );
}

/**
 * The two identity hashes: port versus this run's own archived bytes, and —
 * where the committed digest names this exact run — versus the digest too.
 *
 * ## Why the digest cannot be the only oracle here
 *
 * `cross-arm-hashes.json` is keyed by **seed** and covers the three-arm family:
 * `values["42"].arms.A.source` is `present-day-three-arm/A-seed42`. Comparing a
 * `phase-e/ER-A-n6842-seed42` replay against that entry compares two different
 * runs. The population projection happens to agree (the sampler is a property
 * of the world build, not of the decision layer) but the UNREACHABLE id set
 * does **not**: a resident who never departs is never found unreachable, so the
 * E arms report 4–9 where arm A reports 28. Asserting the digest there would be
 * a red line that means nothing, and quietly dropping the check would be worse.
 *
 * So the primary oracle is this run's **own archived Java bytes**, which exist
 * for every replay target, and the committed digest is asserted on top wherever
 * it genuinely describes the same run — which additionally pins this module's
 * reading of the archive against a file another program produced.
 *
 * `populationColumnSha256` / `unreachableIdSetSha256` are the ported gate's own
 * functions and are passed in rather than imported, so this module does not
 * duplicate the hash definition that `gate-2026-cross-arm.ts` owns.
 */
export function checkGoldenCrossArmHashes(
  ck: Checks,
  run: RunView,
  archivedRun: RunView,
  ctx: GoldenCheckContext,
  hashes: { readonly population: (r: RunView) => string; readonly unreachable: (r: RunView) => string },
): void {
  const gotPop = hashes.population(run);
  const gotUnr = hashes.unreachable(run);
  const archPop = hashes.population(archivedRun);
  const archUnr = hashes.unreachable(archivedRun);

  ck.add(
    `(t3) [${run.name}] POP_COLS raw-text hash equals this run's archived bytes`,
    gotPop === archPop,
    `port ${gotPop.slice(0, 16)}… vs archive ${archPop.slice(0, 16)}…`,
  );
  ck.add(
    `(t3) [${run.name}] UNREACHABLE id-set hash equals this run's archived bytes`,
    gotUnr === archUnr,
    `port ${gotUnr.slice(0, 16)}… vs archive ${archUnr.slice(0, 16)}…`,
  );

  const seedEntry = record(ctx.golden["cross-arm-hashes"].values[String(ctx.seed)]);
  const armEntry = record(record(seedEntry["arms"])[ctx.arm]);
  if (armEntry["source"] !== ctx.runDir) {
    ck.skip(
      `(t3) [${run.name}] committed cross-arm digest`,
      `cross-arm-hashes.json seed ${ctx.seed} arm ${ctx.arm} describes ` +
        `${String(armEntry["source"] ?? "no run")}, not ${ctx.runDir} — the UNREACHABLE id set is ` +
        "not invariant across preset families, so the digest does not grade this run",
    );
    return;
  }
  const bad: string[] = [];
  if (gotPop !== armEntry["population_column_sha256"]) {
    bad.push(`POP_COLS ${gotPop.slice(0, 16)}… vs digest ${String(armEntry["population_column_sha256"]).slice(0, 16)}…`);
  }
  if (gotUnr !== armEntry["unreachable_id_set_sha256"]) {
    bad.push(
      `UNREACHABLE ${gotUnr.slice(0, 16)}… vs digest ${String(armEntry["unreachable_id_set_sha256"]).slice(0, 16)}…`,
    );
  }
  ck.add(
    `(t3) [${run.name}] both identity hashes equal the committed cross-arm digest`,
    bad.length === 0,
    bad.length === 0 ? `digest source ${ctx.runDir}` : bad.join("; "),
    bad,
  );
}

/**
 * The never-sheltered exposure identity and the raw-text `vwe ≡ dose` row
 * identity — the two hand-checkable exposure facts of §5.1.
 *
 * The resting-dose ratio in the same digest is deliberately NOT asserted: its
 * own `method` field records that the reconstruction is taken from the
 * archive's 4-decimal-rounded exposure and that exactly one archived row rounds
 * the other way. Asserting a quantity whose oracle documents its own
 * off-by-one would be asserting the rounding, not the model.
 */
export function checkGoldenExposure(ck: Checks, run: RunView, ctx: GoldenCheckContext): void {
  const entry = record(ctx.golden["exposure-identities"].values[ctx.runDir]);
  const never = record(entry["never_sheltered"]);
  if (Object.keys(never).length === 0) {
    ck.add(
      `(t3) [${run.name}] exposure-identities carries this run`,
      false,
      `no values[${ctx.runDir}].never_sheltered`,
    );
    return;
  }
  const got = neverShelteredExposure(run);
  const wantCount = numberOrNull(never["count"]);
  const wantDistinct = numberOrNull(never["distinct_exposure_values"]);
  const wantValue = never["exposure_ugm3h"];
  const bad: string[] = [];
  if (wantCount !== got.count) bad.push(`count: ${got.count} vs ${String(wantCount)}`);
  if (wantDistinct !== got.distinct.length) {
    bad.push(`distinct values: ${got.distinct.length} vs ${String(wantDistinct)}`);
  }
  if (got.distinct.length === 1 && got.distinct[0] !== wantValue) {
    bad.push(`value: ${String(got.distinct[0])} vs ${String(wantValue)}`);
  }
  ck.add(
    `(t3) [${run.name}] never-sheltered exposure identity, exact raw text`,
    bad.length === 0,
    bad.length === 0
      ? `${got.count} never-sheltered rows all read ${String(wantValue)} µg·m⁻³·h`
      : bad.join("; "),
    bad,
  );

  const wantMismatch = numberOrNull(entry["vwe_equals_dose_mismatch_rows"]);
  const gotMismatch = vweDoseMismatchRows(run);
  ck.add(
    `(t3) [${run.name}] vwe ≡ dose as raw text on every row`,
    gotMismatch === wantMismatch,
    `mismatching rows: port ${gotMismatch} vs archive ${String(wantMismatch)}`,
  );
}
