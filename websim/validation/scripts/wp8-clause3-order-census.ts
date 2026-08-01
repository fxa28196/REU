/**
 * wp8-clause3-order-census.ts — the ordering channel at the ER/SE/SE2 replay
 * configurations.
 *
 * `DR-WP7-order-attribution.md` sets the method: where the within-tick shuffle
 * makes exact per-agent identity impossible, do not assert an explanation —
 * re-run the identical configuration over many independent permutation streams
 * and report where the observation sits in the resulting spread.
 *
 * The WP7 slice needed that because its arm-A run diverged from the archive on
 * 114 `final_state` cells. This script asks the same question of the twelve
 * decision-layer replays, whose measured divergence is different, and reports
 * the spread rather than reasoning about it.
 *
 * `HeadlessOptions.shuffleStreamSeed` re-seeds the Repast default stream between
 * the last build-time draw and the first tick, so it moves the permutation
 * sequence and nothing else (DR-WP7 §2.1). A build digest across every stream is
 * asserted here for the same reason the WP7 census asserts one.
 *
 * ```
 * npx tsx validation/scripts/wp8-clause3-order-census.ts
 * npx tsx validation/scripts/wp8-clause3-order-census.ts --streams 8
 * ```
 *
 * Writes `pipeline/out/wp8-replay/clause3-order-census.json`.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PARAM_NAMES, parseRunConfig, type RunConfig } from "@websim/shared";

import { headlessAssetsPresent, runHeadless } from "../src/headless.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const ARCHIVE_ROOT = path.join(REPO_ROOT, "docs", "runs");
const OUT_ROOT = path.join(REPO_ROOT, "websim", "pipeline", "out", "wp8-replay");

interface Case {
  readonly run: string;
  readonly archive: string;
  readonly streams: number;
}

const CASES: readonly Case[] = [
  { run: "ER-A-n6842-seed42", archive: "phase-e", streams: 20 },
  { run: "SE-E18-seed42", archive: "scenario-e", streams: 10 },
  { run: "SE2-E18-d1-seed42", archive: "scenario-e-v2", streams: 10 },
];

/** `ContextCreator.doubleParam` fallbacks — same table the replay script uses. */
const CODE_FALLBACKS: Readonly<Record<string, number>> = {
  smokeSeriesCode: 0,
  smokeScale: 1.0,
  closuresCode: 0,
  pStuck: 0.3,
  stuckDelayH: 3.0,
  pushThetaThreshold: -0.25,
  kPush: 1.0,
  closureDraw: 1,
};

function buildConfig(c: Case): RunConfig {
  const manifest = JSON.parse(
    readFileSync(path.join(ARCHIVE_ROOT, c.archive, c.run, "simulation.json"), "utf8"),
  ) as { reproducibility: { parameters: Record<string, number> } };
  const params = manifest.reproducibility.parameters;
  const raw: Record<string, number> = {};
  for (const name of PARAM_NAMES) {
    const executed = params[name];
    if (executed !== undefined) {
      raw[name] = executed;
      continue;
    }
    const fallback = CODE_FALLBACKS[name];
    if (fallback === undefined) {
      throw new Error(`${c.run}: manifest lacks ${name} and there is no documented code fallback`);
    }
    raw[name] = fallback;
  }
  return parseRunConfig(raw, `archived manifest ${c.archive}/${c.run}`);
}

// --- a local CSV reader, so the census does not share a parser with the gate --

interface Table {
  readonly header: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

function parseCsv(text: string): Table {
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\r") continue;
    if (ch === "\n") {
      row.push(field);
      out.push(row);
      row = [];
      field = "";
      continue;
    }
    field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    out.push(row);
  }
  const header = out[0] ?? [];
  const rows = out.slice(1).filter((r) => !(r.length === 1 && r[0] === ""));
  return { header, rows };
}

function column(t: Table, name: string): readonly string[] {
  const i = t.header.indexOf(name);
  if (i < 0) throw new Error(`no column ${name}`);
  return t.rows.map((r) => r[i] ?? "");
}

const EXCLUDE = new Set(["sim_id", "commit", "data_version"]);

interface Divergence {
  readonly comparedCols: number;
  readonly rowsIdentical: number;
  readonly rows: number;
  readonly finalStateDiffs: number;
  readonly colsBitEqual: number;
  readonly sheltered: number;
  readonly unreachable: number;
  readonly refusedAllFull: number;
  readonly refusedCountSitesMatching: number;
  readonly sheltersRows: number;
}

function diverge(portAgents: Table, archAgents: Table, portShel: Table, archShel: Table): Divergence {
  const shared = portAgents.header.filter((c) => archAgents.header.includes(c));
  const cols = shared.filter((c) => !EXCLUDE.has(c));
  const pk = column(portAgents, "agent_id");
  const ak = column(archAgents, "agent_id");
  const aIdx = new Map(ak.map((k, i) => [k, i]));
  const bad = new Array<boolean>(pk.length).fill(false);
  let colsBitEqual = 0;
  let finalStateDiffs = 0;
  for (const c of cols) {
    const pv = column(portAgents, c);
    const av = column(archAgents, c);
    let d = 0;
    for (let i = 0; i < pv.length; i++) {
      const j = aIdx.get(pk[i]!);
      if (j === undefined) continue;
      if (pv[i] !== av[j]) {
        d++;
        bad[i] = true;
      }
    }
    if (d === 0) colsBitEqual++;
    if (c === "final_state") finalStateDiffs = d;
  }
  const state = column(portAgents, "final_state");

  const psk = column(portShel, "shelter_id");
  const askIdx = new Map(column(archShel, "shelter_id").map((k, i) => [k, i]));
  const prc = column(portShel, "refused_count");
  const arc = column(archShel, "refused_count");
  let sitesMatching = 0;
  for (let i = 0; i < psk.length; i++) {
    const j = askIdx.get(psk[i]!);
    if (j !== undefined && prc[i] === arc[j]) sitesMatching++;
  }

  return {
    comparedCols: cols.length,
    rowsIdentical: bad.filter((b) => !b).length,
    rows: pk.length,
    finalStateDiffs,
    colsBitEqual,
    sheltered: state.filter((s) => s === "SHELTERED").length,
    unreachable: state.filter((s) => s === "UNREACHABLE").length,
    refusedAllFull: state.filter((s) => s === "REFUSED_ALL_FULL").length,
    refusedCountSitesMatching: sitesMatching,
    sheltersRows: psk.length,
  };
}

/** The census's stream seeds — the walk `order-permutation-census.ts` uses. */
function streamSeeds(count: number): number[] {
  const seeds: number[] = [];
  let x = 0x9e3779b1 | 0;
  for (let i = 0; i < count; i++) {
    x = (Math.imul(x, 1664525) + 1013904223) | 0;
    seeds.push(x);
  }
  return seeds;
}

/**
 * The build-time columns. Every one of them is written before tick 1, so a
 * census that varied anything other than the permutation would move this digest.
 */
const BUILD_COLS = [
  "agent_id",
  "random_seed",
  "starting_encampment",
  "start_lon",
  "start_lat",
  "walking_speed_mps",
  "age_years",
  "age_band",
  "sex",
  "mobility_limited",
  "mobility_category",
  "asthma_flag",
  "copd_flag",
  "any_respiratory",
  "chronic_physical",
  "vulnerable_flag",
  "aware_initial",
  "heavy_belongings",
  "has_pet",
  "has_dependents",
  "theta_z",
] as const;

function buildDigest(t: Table): string {
  const h = createHash("sha256");
  for (const c of BUILD_COLS) {
    h.update(c);
    h.update("");
    for (const v of column(t, c)) {
      h.update(v);
      h.update("");
    }
  }
  return h.digest("hex").slice(0, 16);
}

function main(): void {
  const argv = process.argv.slice(2);
  let override: number | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--streams") {
      override = Number(argv[i + 1]);
      i++;
    } else throw new Error(`unknown argument ${argv[i]}`);
  }

  if (!headlessAssetsPresent()) {
    console.error("SKIP: packed graph assets absent — this run produced NO numbers.");
    process.exit(2);
  }

  mkdirSync(OUT_ROOT, { recursive: true });
  const report: Record<string, unknown>[] = [];

  for (const c of CASES) {
    const config = buildConfig(c);
    const dir = path.join(ARCHIVE_ROOT, c.archive, c.run);
    const archAgents = parseCsv(readFileSync(path.join(dir, "agents.csv"), "utf8"));
    const archShel = parseCsv(readFileSync(path.join(dir, "shelters.csv"), "utf8"));

    const n = override ?? c.streams;
    const seeds: (number | null)[] = [null, ...streamSeeds(n)];
    const digests = new Set<string>();
    const rows: Record<string, unknown>[] = [];

    for (const seed of seeds) {
      const t0 = performance.now();
      const result = runHeadless({
        config,
        paramNames: PARAM_NAMES,
        ...(seed === null ? {} : { shuffleStreamSeed: seed }),
      });
      const portAgents = parseCsv(result.parity.agentsCsv);
      const portShel = parseCsv(result.parity.sheltersCsv);
      digests.add(buildDigest(portAgents));
      const d = diverge(portAgents, archAgents, portShel, archShel);
      rows.push({
        stream: seed === null ? "certified-faithful" : seed,
        ...d,
        ms: Math.round(performance.now() - t0),
      });
      console.log(
        `[census] ${c.run} stream ${String(seed ?? "certified").padStart(12)} ` +
          `final_state diffs ${String(d.finalStateDiffs).padStart(4)}  ` +
          `rows identical ${d.rowsIdentical}/${d.rows}  ` +
          `bit-equal cols ${d.colsBitEqual}/${d.comparedCols}  ` +
          `sheltered ${d.sheltered}  unreachable ${d.unreachable}  ` +
          `refused_count sites ${d.refusedCountSitesMatching}/${d.sheltersRows}`,
      );
    }

    const observed = rows[0]!["finalStateDiffs"] as number;
    const sample = rows.slice(1).map((r) => r["finalStateDiffs"] as number);
    const sorted = [...sample].sort((a, b) => a - b);
    const le = sample.filter((v) => v <= observed).length;
    report.push({
      run: c.run,
      archive: c.archive,
      streams: sample.length,
      buildDigests: [...digests],
      observedFinalStateDiffs: observed,
      sampleMin: sorted[0] ?? null,
      sampleMax: sorted[sorted.length - 1] ?? null,
      sampleMedian: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null,
      sampleMean: sample.length ? sample.reduce((a, b) => a + b, 0) / sample.length : null,
      percentileOfObserved: sample.length ? (100 * le) / sample.length : null,
      distinctSampleValues: [...new Set(sample)].sort((a, b) => a - b),
      rows,
    });
    console.log(
      `[census] ${c.run}: build digests ${[...digests].join(",")} ` +
        `(1 = permutation was the only thing varied)\n`,
    );
  }

  const p = path.join(OUT_ROOT, "clause3-order-census.json");
  writeFileSync(
    p,
    `${JSON.stringify(
      { schema: "websim/wp8-clause3-order-census/v1", generated: new Date().toISOString(), cases: report },
      null,
      2,
    )}\n`,
  );
  console.log(`wrote ${p}`);
}

main();
