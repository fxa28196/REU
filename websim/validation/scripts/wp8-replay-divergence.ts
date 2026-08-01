/**
 * wp8-replay-divergence.ts — bounding the ER/SE/SE2 replay divergence.
 *
 * `DR-WP7-order-attribution.md` sets the precedent this script follows: where
 * the within-tick shuffle-order channel makes exact per-agent identity
 * impossible, do not *assert* an explanation — bound the divergence against a
 * measured permutation distribution and report where the observation sits in it.
 * The committed distribution is
 * `validation/order-census/order-permutation-census.json` (200 independent
 * permutation streams, arm A, seed 42, 312 h, compared against
 * `present-day-three-arm/A-seed42` on raw text).
 *
 * The script therefore reports each TS replay's `final_state` divergence twice:
 *
 *  - against the archived **E-arm** run it is supposed to reproduce
 *    (`phase-e/ER-*`, `scenario-e/SE-*`, `scenario-e-v2/SE2-*`);
 *  - and, for the arm-A configurations, against the archived **pre-E** run
 *    (`present-day-three-arm/A-seed42`), which is the census's own reference.
 *
 * Two numbers rather than one, because the census can only place a divergence
 * that is of the same *kind* as the one it sampled. Reporting an out-of-support
 * observation as "percentile 100" would be the assertion the DR forbids; the
 * script prints the multiple of the census maximum instead and says the
 * observation is outside the sampled support.
 *
 * ```
 * npx tsx validation/scripts/wp8-replay-divergence.ts
 * ```
 */

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const REPLAY_ROOT = path.join(REPO_ROOT, "websim", "pipeline", "out", "wp8-replay");
const ARCHIVE_ROOT = path.join(REPO_ROOT, "docs", "runs");
const CENSUS = path.join(
  REPO_ROOT,
  "websim",
  "validation",
  "order-census",
  "order-permutation-census.json",
);

/** The three environment columns, exactly the set `compare-archive-agents.ts` drops. */
const EXCLUDED = new Set(["sim_id", "commit", "data_version"]);

interface Csv {
  readonly header: readonly string[];
  readonly rows: ReadonlyMap<string, readonly string[]>;
}

function readCsv(file: string): Csv {
  const lines = readFileSync(file, "utf8").split(/\r?\n/u).filter((l) => l.length > 0);
  const header = lines[0]!.split(",");
  const rows = new Map<string, readonly string[]>();
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i]!.split(",");
    rows.set(cells[0]!, cells);
  }
  return { header, rows };
}

interface Divergence {
  readonly rows: number;
  readonly sharedColumns: number;
  readonly rowsIdentical: number;
  readonly finalStateFlips: number;
  /** `"FROM->TO"` → count, over the flipped rows. */
  readonly transitions: Readonly<Record<string, number>>;
  readonly columnsBitEqual: number;
}

function diff(tsFile: string, javaFile: string): Divergence {
  const ts = readCsv(tsFile);
  const ja = readCsv(javaFile);
  const shared = ts.header.filter((h) => ja.header.includes(h) && !EXCLUDED.has(h));
  const ti = new Map(ts.header.map((h, i) => [h, i]));
  const ji = new Map(ja.header.map((h, i) => [h, i]));
  const mismatch = new Map<string, number>();
  const transitions: Record<string, number> = {};
  let rowsIdentical = 0;
  let flips = 0;
  for (const [key, tc] of ts.rows) {
    const jc = ja.rows.get(key);
    if (jc === undefined) continue;
    let equal = true;
    for (const col of shared) {
      if (tc[ti.get(col)!] !== jc[ji.get(col)!]) {
        mismatch.set(col, (mismatch.get(col) ?? 0) + 1);
        equal = false;
      }
    }
    if (equal) rowsIdentical++;
    const tState = tc[ti.get("final_state")!]!;
    const jState = jc[ji.get("final_state")!]!;
    if (tState !== jState) {
      flips++;
      const k = `${jState}->${tState}`;
      transitions[k] = (transitions[k] ?? 0) + 1;
    }
  }
  return {
    rows: ts.rows.size,
    sharedColumns: shared.length,
    rowsIdentical,
    finalStateFlips: flips,
    transitions,
    columnsBitEqual: shared.filter((c) => (mismatch.get(c) ?? 0) === 0).length,
  };
}

interface CensusEnvelope {
  readonly n: number;
  readonly min: number;
  readonly max: number;
  readonly mean: number;
  readonly sd: number;
  readonly observed: number;
  readonly observed_percentile: number;
}

/**
 * Place a divergence in the census, or refuse to.
 *
 * The census was measured on **arm A at seed 42**, where 2,234 beds bind against
 * 6,842 residents; it is the distribution of what the ordering channel alone can
 * do at that capacity margin. Below-minimum and above-maximum are reported
 * differently on purpose: an observation under the floor is *less* divergence
 * than the channel typically produces (which the arm-C control is, because arm C
 * has 6,842 beds and the channel has almost nothing to arbitrate), while one
 * over the ceiling is a divergence the channel demonstrably cannot reach.
 */
function placement(flips: number, env: CensusEnvelope): string {
  if (flips >= env.min && flips <= env.max) {
    return `INSIDE the 200-stream envelope [${env.min}, ${env.max}] (mean ${env.mean}, sd ${env.sd.toFixed(2)}); z = ${((flips - env.mean) / env.sd).toFixed(2)}`;
  }
  if (flips < env.min) {
    return (
      `BELOW the sampled support [${env.min}, ${env.max}] — less divergence than the ordering ` +
      `channel produced in any of 200 arm-A draws. The census is an arm-A-at-seed-42 envelope ` +
      `(2,234 beds vs 6,842 residents); an arm with slack capacity is not expected to sit in it`
    );
  }
  return (
    `ABOVE the sampled support [${env.min}, ${env.max}] — ${(flips / env.max).toFixed(1)}x the ` +
    `census maximum, z = ${((flips - env.mean) / env.sd).toFixed(1)}. No percentile is reportable: ` +
    `the ordering channel never produced a divergence this large in 200 draws, so this divergence ` +
    `is not an ordering artefact`
  );
}

interface Target {
  readonly run: string;
  readonly archive: string;
  /** Extra comparison against the census's own reference, when meaningful. */
  readonly preE: string | null;
}

const TARGETS: readonly Target[] = [
  ...[42, 43, 44].map((s) => ({
    run: `ER-A-n6842-seed${s}`,
    archive: `phase-e/ER-A-n6842-seed${s}`,
    preE: s === 42 ? "present-day-three-arm/A-seed42" : null,
  })),
  ...[42, 43, 44].map((s) => ({
    run: `ER-C-n6842-seed${s}`,
    archive: `phase-e/ER-C-n6842-seed${s}`,
    preE: s === 42 ? "present-day-three-arm/C-seed42" : null,
  })),
  ...[42, 43, 44].map((s) => ({
    run: `SE-E18-seed${s}`,
    archive: `scenario-e/SE-E18-seed${s}`,
    preE: null,
  })),
  ...[42, 43, 44].map((s) => ({
    run: `SE2-E18-d1-seed${s}`,
    archive: `scenario-e-v2/SE2-E18-d1-seed${s}`,
    preE: null,
  })),
];

function main(): void {
  const census = JSON.parse(readFileSync(CENSUS, "utf8")) as {
    final_state_divergence: CensusEnvelope;
  };
  const env = census.final_state_divergence;
  console.log(
    `[census] committed envelope: n=${env.n} streams, final_state flips min=${env.min} ` +
      `max=${env.max} mean=${env.mean} sd=${env.sd.toFixed(2)}; the certified-faithful WP7 ` +
      `arm-A observation is ${env.observed} at percentile ${env.observed_percentile}\n`,
  );

  const out: Record<string, unknown>[] = [];
  for (const t of TARGETS) {
    const tsFile = path.join(REPLAY_ROOT, t.run, "agents.csv");
    const jaFile = path.join(ARCHIVE_ROOT, ...t.archive.split("/"), "agents.csv");
    if (!existsSync(tsFile)) {
      console.error(`MISSING ${tsFile}`);
      process.exitCode = 2;
      continue;
    }
    const d = diff(tsFile, jaFile);
    console.log(`--- ${t.run}  vs  docs/runs/${t.archive}`);
    console.log(
      `    rows ${d.rows}, shared columns ${d.sharedColumns}, bit-equal columns ` +
        `${d.columnsBitEqual}/${d.sharedColumns}, rows byte-identical ${d.rowsIdentical} ` +
        `(${((100 * d.rowsIdentical) / d.rows).toFixed(2)}%)`,
    );
    console.log(`    final_state flips ${d.finalStateFlips} -> ${placement(d.finalStateFlips, env)}`);
    console.log(
      `    transitions ${Object.entries(d.transitions)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k}=${v}`)
        .join(" ")}`,
    );
    const record: Record<string, unknown> = { run: t.run, vs: `docs/runs/${t.archive}`, ...d };

    if (t.preE !== null) {
      const p = diff(tsFile, path.join(ARCHIVE_ROOT, ...t.preE.split("/"), "agents.csv"));
      console.log(
        `    [control] same TS bytes vs docs/runs/${t.preE}: rows byte-identical ` +
          `${p.rowsIdentical}/${p.rows} (${((100 * p.rowsIdentical) / p.rows).toFixed(2)}%), ` +
          `final_state flips ${p.finalStateFlips} -> ${placement(p.finalStateFlips, env)}`,
      );
      record["preEControl"] = { vs: `docs/runs/${t.preE}`, ...p };
    }
    out.push(record);
    console.log("");
  }

  writeFileSync(
    path.join(REPLAY_ROOT, "replay-divergence.json"),
    `${JSON.stringify(
      { schema: "websim/wp8-replay-divergence/v1", censusEnvelope: env, runs: out },
      null,
      2,
    )}\n`,
  );
}

main();
