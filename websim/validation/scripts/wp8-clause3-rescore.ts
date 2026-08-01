/**
 * wp8-clause3-rescore.ts — an INDEPENDENT re-score of WP8 acceptance clause 3.
 *
 * Clause 3 asks whether the ER / SE / SE2 presets reproduce the archived
 * direction-of-effect and the archived counter identities. `DR-WP8-verification.md`
 * §5 refuted it. This script re-measures it from raw bytes so the verdict does
 * not rest on `wp8-archive-replay.ts`'s own arithmetic.
 *
 * ## Why it re-implements the CSV reader
 *
 * `wp8-archive-replay.ts` scores the port side and the archive side with the
 * *same* function (`scoreRun`, over `harness/frame.ts`). That is fine for a
 * relative comparison but it means a defect in the reader moves both columns
 * together. This file imports **nothing** from `websim/` — its own splitter, its
 * own numeric coercion, its own JSON reads — so a disagreement between this
 * report and `replay-report.json` is itself a finding.
 *
 * ## What it reads
 *
 * ```
 * docs/runs/{phase-e,scenario-e,scenario-e-v2}/<run>/{agents,shelters,simulation}   archive
 * websim/pipeline/out/wp8-replay/<run>/{agents,shelters,simulation}.csv|json        port
 * websim/pipeline/out/wp8-replay/<run>/closure-census.json                          port closures
 * websim/validation/order-census/order-permutation-census.json                      order envelope
 * ```
 *
 * ## What it writes (inside `pipeline/out/wp8-replay/`, an allowlisted dir)
 *
 * ```
 * clause3-rescore.json    every number below, machine-readable
 * clause3-rescore.md      the side-by-side table
 * ```
 *
 * ```
 * npx tsx validation/scripts/wp8-clause3-rescore.ts
 * ```
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const ARCHIVE_ROOT = path.join(REPO_ROOT, "docs", "runs");
const REPLAY_ROOT = path.join(REPO_ROOT, "websim", "pipeline", "out", "wp8-replay");
const CENSUS = path.join(
  REPO_ROOT,
  "websim",
  "validation",
  "order-census",
  "order-permutation-census.json",
);

// ---------------------------------------------------------------------------
// a minimal, self-contained CSV reader (RFC-4180 quotes, CR/LF tolerant)
// ---------------------------------------------------------------------------

interface Table {
  readonly header: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

function parseCsv(text: string): Table {
  const rows: string[][] = [];
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
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  const header = rows.shift() ?? [];
  return { header, rows };
}

function colIndex(t: Table, name: string): number {
  return t.header.indexOf(name);
}

/** Column as text; `[]` when the column is absent. */
function col(t: Table, name: string): string[] {
  const j = colIndex(t, name);
  return j < 0 ? [] : t.rows.map((r) => r[j] ?? "");
}

/** Column as numbers, blanks and unparseables read as 0. `[]` when absent. */
function numCol(t: Table, name: string): number[] {
  return col(t, name).map((s) => {
    const v = Number(s.trim());
    return Number.isFinite(v) ? v : 0;
  });
}

const total = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);

// ---------------------------------------------------------------------------

interface Manifest {
  readonly population?: Record<string, number>;
  readonly smoke_field?: Record<string, number>;
  readonly reproducibility?: { readonly parameters?: Record<string, number> };
  readonly closures?: Record<string, unknown> | null;
  readonly decision_layer?: Record<string, unknown> | null;
}

interface Scored {
  readonly source: string;
  readonly n: number;
  readonly sheltered: number;
  readonly refusedAllFullFinal: number | null;
  readonly unreachableManifest: number | null;
  /** `final_state == "UNREACHABLE"` counted off the CSV, independent of the manifest. */
  readonly unreachableCsv: number;
  readonly doorRefusalsTotal: number;
  readonly policyRefusals: number;
  readonly capacityRefusals: number;
  readonly outOfRangeLookups: number | null;
  readonly closuresCode: number | null;
  readonly informationRegime: number | null;
  readonly enableDecisionLayer: number | null;
  readonly simulationHours: number | null;
  // gate (l) inputs
  readonly counterColumnsPresent: boolean;
  readonly blockages: number;
  readonly pushThroughs: number;
  readonly reroutes: number;
  readonly stuckEvents: number;
  readonly residentsBlocked: number;
  /** l.1: rows where `blockages != pushes + reroutes`. */
  readonly rowsViolatingL1: number;
  /** l.2: rows where `stuck > pushes`. */
  readonly rowsViolatingL2: number;
}

const SE_COLS = ["blockages_encountered", "push_throughs", "reroutes", "stuck_events"] as const;

function score(dir: string, label: string): Scored {
  const agents = parseCsv(readFileSync(path.join(dir, "agents.csv"), "utf8"));
  const shelters = parseCsv(readFileSync(path.join(dir, "shelters.csv"), "utf8"));
  const man = JSON.parse(readFileSync(path.join(dir, "simulation.json"), "utf8")) as Manifest;
  const params = man.reproducibility?.parameters ?? {};

  const state = col(agents, "final_state");
  const refused = numCol(shelters, "refused_count");
  const policy = numCol(shelters, "policy_refused");

  const present = SE_COLS.every((c) => colIndex(agents, c) >= 0);
  const blk = numCol(agents, "blockages_encountered");
  const psh = numCol(agents, "push_throughs");
  const rrt = numCol(agents, "reroutes");
  const stk = numCol(agents, "stuck_events");

  const doorRefusals = Math.trunc(total(refused));
  const policyRefusals = Math.trunc(total(policy));

  return {
    source: label,
    n: agents.rows.length,
    sheltered: state.filter((s) => s === "SHELTERED").length,
    refusedAllFullFinal: man.population?.["refused_all_full"] ?? null,
    unreachableManifest: man.population?.["unreachable"] ?? null,
    unreachableCsv: state.filter((s) => s === "UNREACHABLE").length,
    doorRefusalsTotal: doorRefusals,
    policyRefusals,
    capacityRefusals: doorRefusals - policyRefusals,
    outOfRangeLookups: man.smoke_field?.["out_of_range_lookups"] ?? null,
    closuresCode: params["closuresCode"] ?? null,
    informationRegime: params["informationRegime"] ?? null,
    enableDecisionLayer: params["enableDecisionLayer"] ?? null,
    simulationHours: params["simulationHours"] ?? null,
    counterColumnsPresent: present,
    blockages: Math.trunc(total(blk)),
    pushThroughs: Math.trunc(total(psh)),
    reroutes: Math.trunc(total(rrt)),
    stuckEvents: Math.trunc(total(stk)),
    residentsBlocked: blk.filter((v) => v > 0).length,
    rowsViolatingL1: blk.reduce((a, b, i) => a + (b !== (psh[i] ?? 0) + (rrt[i] ?? 0) ? 1 : 0), 0),
    rowsViolatingL2: stk.reduce((a, s, i) => a + (s > (psh[i] ?? 0) ? 1 : 0), 0),
  };
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// clause 4 mechanism: were any residents mid-walk when a closure wave landed?
// ---------------------------------------------------------------------------

/**
 * How many residents were walking when each wave fired, computed off
 * `time_started_tick` / `time_arrived_tick` alone.
 *
 * Reported as a **bound**, not a number, because the CSV does not record when a
 * resident that never arrived stopped walking:
 *
 *  - `lower` counts only residents with both timestamps and `start <= t <= end`;
 *  - `upper` additionally counts every resident that started before `t` and has
 *    no arrival timestamp, i.e. assumes it was still walking at `t`.
 *
 * The true count is inside `[lower, upper]`. Where `upper == 0` the run
 * provably had nobody in transit at that tick and the four Scenario-E counters
 * cannot be anything but zero — which is the difference between a measured zero
 * and a structural one.
 */
interface WaveOverlap {
  readonly hour: number;
  readonly tick: number;
  readonly lower: number;
  readonly upper: number;
}

interface WalkProfile {
  readonly departures: number;
  readonly arrivals: number;
  readonly firstDepartureHour: number | null;
  readonly lastArrivalHour: number | null;
  readonly overlaps: readonly WaveOverlap[];
}

function walkProfile(dir: string, waveHours: readonly number[], ticksPerHour: number): WalkProfile {
  const agents = parseCsv(readFileSync(path.join(dir, "agents.csv"), "utf8"));
  const startTxt = col(agents, "time_started_tick");
  const arriveTxt = col(agents, "time_arrived_tick");
  const starts: (number | null)[] = startTxt.map((s) => {
    const v = Number(s.trim());
    return s.trim() === "" || !Number.isFinite(v) ? null : v;
  });
  const arrives: (number | null)[] = arriveTxt.map((s) => {
    const v = Number(s.trim());
    return s.trim() === "" || !Number.isFinite(v) ? null : v;
  });

  const overlaps: WaveOverlap[] = waveHours.map((h) => {
    const tick = h * ticksPerHour;
    let lower = 0;
    let upper = 0;
    for (let i = 0; i < starts.length; i++) {
      const s = starts[i]!;
      if (s === null || s > tick) continue;
      const e = arrives[i]!;
      if (e !== null && e >= tick) {
        lower++;
        upper++;
      } else if (e === null) {
        upper++;
      }
    }
    return { hour: h, tick, lower, upper };
  });

  const startedHours = starts.filter((s): s is number => s !== null).map((s) => s / ticksPerHour);
  const arrivedHours = arrives.filter((s): s is number => s !== null).map((s) => s / ticksPerHour);
  return {
    departures: startedHours.length,
    arrivals: arrivedHours.length,
    firstDepartureHour: startedHours.length === 0 ? null : Math.min(...startedHours),
    lastArrivalHour: arrivedHours.length === 0 ? null : Math.max(...arrivedHours),
    overlaps,
  };
}

interface Case {
  readonly run: string;
  readonly archive: "phase-e" | "scenario-e" | "scenario-e-v2";
  /** Closure activation hours from the schedule; `[]` for a closure-free run. */
  readonly waveHours: readonly number[];
}

/** From `Geography/data/closures/`, and re-checked against the port's own census. */
const SE_E18_WAVES = [79] as const;
const SE2_E18_D1_WAVES = [3, 44, 72, 142, 265, 303] as const;

const CASES: readonly Case[] = [
  ...[42, 43, 44].map((s) => ({
    run: `ER-A-n6842-seed${s}`,
    archive: "phase-e" as const,
    waveHours: [],
  })),
  ...[42, 43, 44].map((s) => ({
    run: `ER-C-n6842-seed${s}`,
    archive: "phase-e" as const,
    waveHours: [],
  })),
  ...[42, 43, 44].map((s) => ({
    run: `SE-E18-seed${s}`,
    archive: "scenario-e" as const,
    waveHours: SE_E18_WAVES,
  })),
  ...[42, 43, 44].map((s) => ({
    run: `SE2-E18-d1-seed${s}`,
    archive: "scenario-e-v2" as const,
    waveHours: SE2_E18_D1_WAVES,
  })),
];

function pct(port: number, arch: number): string {
  if (arch === 0) return port === 0 ? "0.000x" : "inf";
  return `${(port / arch).toFixed(3)}x`;
}

interface Row {
  run: string;
  archive: string;
  port: Scored;
  arch: Scored;
  waveHours: readonly number[];
  portWalk: WalkProfile;
  archWalk: WalkProfile;
}

function main(): void {
  const rows: Row[] = [];
  for (const c of CASES) {
    const portDir = path.join(REPLAY_ROOT, c.run);
    const archDir = path.join(ARCHIVE_ROOT, c.archive, c.run);
    if (!existsSync(portDir)) {
      console.error(`MISSING port output ${portDir} — run wp8-archive-replay.ts first`);
      process.exitCode = 2;
      continue;
    }
    // `minutesPerTick` is 1 in every archived E run; read it rather than assume.
    const man = JSON.parse(readFileSync(path.join(archDir, "simulation.json"), "utf8")) as Manifest;
    const mpt = man.reproducibility?.parameters?.["minutesPerTick"] ?? 1;
    const ticksPerHour = Math.round(60 / mpt);
    // Cross-check the hardcoded wave hours against the archive's own block.
    const archWaves = (man.closures?.["wave_hours"] as number[] | undefined) ?? [];
    if (c.waveHours.length > 0 && JSON.stringify(archWaves) !== JSON.stringify([...c.waveHours])) {
      throw new Error(
        `${c.run}: wave hours ${JSON.stringify(c.waveHours)} disagree with the archived ` +
          `closures block ${JSON.stringify(archWaves)}`,
      );
    }
    rows.push({
      run: c.run,
      archive: c.archive,
      port: score(portDir, `port ${c.run}`),
      arch: score(archDir, `archive ${c.archive}/${c.run}`),
      waveHours: c.waveHours,
      portWalk: walkProfile(portDir, c.waveHours, ticksPerHour),
      archWalk: walkProfile(archDir, c.waveHours, ticksPerHour),
    });
  }

  // --- the four questions ---------------------------------------------------
  const threeAnswers = ["ER-A-n6842-seed42", "SE-E18-seed42", "SE2-E18-d1-seed42"].map((r) => {
    const hit = rows.find((x) => x.run === r);
    return { run: r, portSheltered: hit?.port.sheltered ?? null, archSheltered: hit?.arch.sheltered ?? null };
  });
  const distinctPort = new Set(threeAnswers.map((t) => t.portSheltered));
  const distinctArch = new Set(threeAnswers.map((t) => t.archSheltered));

  const severe = rows.filter((r) => r.archive !== "phase-e");
  const oorNonZero = severe.filter((r) => (r.port.outOfRangeLookups ?? -1) !== 0);

  const l1Violations = rows.filter((r) => r.port.rowsViolatingL1 > 0);
  const l2Violations = rows.filter((r) => r.port.rowsViolatingL2 > 0);
  const portAllCountersZero = rows.every(
    (r) => r.port.blockages + r.port.pushThroughs + r.port.reroutes + r.port.stuckEvents === 0,
  );
  const archAllCountersZero = rows.every(
    (r) => r.arch.blockages + r.arch.pushThroughs + r.arch.reroutes + r.arch.stuckEvents === 0,
  );

  const census = JSON.parse(readFileSync(CENSUS, "utf8")) as {
    final_state_divergence: Record<string, number>;
    swap_structure: { sheltered_values: number[]; unreachable_values: number[] };
    results: { sheltered: number; unreachable: number }[];
  };
  const censusSheltered = census.results.map((r) => r.sheltered);
  const censusMin = Math.min(...censusSheltered);
  const censusMax = Math.max(...censusSheltered);

  // --- markdown -------------------------------------------------------------
  const md: string[] = [];
  md.push("# WP8 clause 3 — independent re-score");
  md.push("");
  md.push(`Generated ${new Date().toISOString()}. Reader: this file's own CSV parser; no \`websim/\` imports.`);
  md.push("");
  md.push("## Table 1 — sheltered, policy refusals, unreachable");
  md.push("");
  md.push("| run | sheltered port | sheltered archive | ratio | policy_refusals port | policy_refusals archive | unreachable port (manifest/CSV) | unreachable archive (manifest/CSV) |");
  md.push("|---|---|---|---|---|---|---|---|");
  for (const r of rows) {
    md.push(
      `| ${r.run} | ${r.port.sheltered} | ${r.arch.sheltered} | ${pct(r.port.sheltered, r.arch.sheltered)} | ` +
        `${r.port.policyRefusals} | ${r.arch.policyRefusals} | ` +
        `${r.port.unreachableManifest ?? "-"}/${r.port.unreachableCsv} | ` +
        `${r.arch.unreachableManifest ?? "-"}/${r.arch.unreachableCsv} |`,
    );
  }
  md.push("");
  md.push("## Table 2 — gate (l) counter identities, port side");
  md.push("");
  md.push("| run | closuresCode | cols present | blockages | pushes | reroutes | stuck | rows blk!=psh+rrt (l.1) | rows stk>psh (l.2) |");
  md.push("|---|---|---|---|---|---|---|---|---|");
  for (const r of rows) {
    md.push(
      `| ${r.run} | ${r.port.closuresCode ?? "-"} | ${r.port.counterColumnsPresent} | ${r.port.blockages} | ` +
        `${r.port.pushThroughs} | ${r.port.reroutes} | ${r.port.stuckEvents} | ` +
        `${r.port.rowsViolatingL1} | ${r.port.rowsViolatingL2} |`,
    );
  }
  md.push("");
  md.push("## Table 3 — gate (l) counter identities, archive side");
  md.push("");
  md.push("| run | closuresCode | cols present | blockages | pushes | reroutes | stuck | rows blk!=psh+rrt (l.1) | rows stk>psh (l.2) |");
  md.push("|---|---|---|---|---|---|---|---|---|");
  for (const r of rows) {
    md.push(
      `| ${r.run} | ${r.arch.closuresCode ?? "-"} | ${r.arch.counterColumnsPresent} | ${r.arch.blockages} | ` +
        `${r.arch.pushThroughs} | ${r.arch.reroutes} | ${r.arch.stuckEvents} | ` +
        `${r.arch.rowsViolatingL1} | ${r.arch.rowsViolatingL2} |`,
    );
  }
  md.push("");
  md.push("## Table 4 — configuration and smoke");
  md.push("");
  md.push("| run | hours | informationRegime | enableDecisionLayer | port out_of_range_lookups | archive out_of_range_lookups |");
  md.push("|---|---|---|---|---|---|");
  for (const r of rows) {
    md.push(
      `| ${r.run} | ${r.arch.simulationHours ?? "-"} | ${r.arch.informationRegime ?? "-"} | ` +
        `${r.arch.enableDecisionLayer ?? "-"} | ${r.port.outOfRangeLookups ?? "-"} | ` +
        `${r.arch.outOfRangeLookups ?? "-"} |`,
    );
  }
  md.push("");
  md.push("## Table 5 — clause 4 mechanism: walkers in transit when a wave lands");
  md.push("");
  md.push(
    "`lower`/`upper` bound the residents mid-walk at the wave tick (see `WaveOverlap`). " +
      "`upper == 0` means the run provably had nobody in transit, so the four counters are " +
      "structurally zero rather than measured zero.",
  );
  md.push("");
  md.push("| run | side | departures | arrivals | first departure h | last arrival h | per-wave in-transit lower..upper |");
  md.push("|---|---|---|---|---|---|---|");
  for (const r of rows) {
    if (r.waveHours.length === 0) continue;
    for (const [side, w] of [["port", r.portWalk] as const, ["archive", r.archWalk] as const]) {
      md.push(
        `| ${r.run} | ${side} | ${w.departures} | ${w.arrivals} | ` +
          `${w.firstDepartureHour?.toFixed(2) ?? "-"} | ${w.lastArrivalHour?.toFixed(2) ?? "-"} | ` +
          `${w.overlaps.map((o) => `h${o.hour}: ${o.lower}..${o.upper}`).join(", ")} |`,
      );
    }
  }
  md.push("");
  md.push("## Verdicts");
  md.push("");
  md.push(`- distinct port sheltered over {ER-A-42, SE-E18-42, SE2-E18-d1-42}: ${JSON.stringify([...distinctPort])}`);
  md.push(`- distinct archive sheltered over the same three: ${JSON.stringify([...distinctArch])}`);
  md.push(`- severe-series runs with non-zero out_of_range_lookups: ${oorNonZero.length}`);
  md.push(`- port runs violating gate l.1: ${l1Violations.length}; l.2: ${l2Violations.length}`);
  md.push(`- port all four counters zero on all 12 runs: ${portAllCountersZero}`);
  md.push(`- archive all four counters zero on all 12 runs: ${archAllCountersZero}`);
  md.push(
    `- order-permutation census sheltered spread over ${census.results.length} runs: ` +
      `[${censusMin}, ${censusMax}]; distinct values ${JSON.stringify(census.swap_structure.sheltered_values)}`,
  );

  const out = {
    schema: "websim/wp8-clause3-rescore/v1",
    generated: new Date().toISOString(),
    note:
      "Independent re-score of WP8 acceptance clause 3. Reads raw bytes with this file's own " +
      "CSV parser; imports nothing from websim/.",
    runs: rows,
    verdicts: {
      threeAnswers,
      distinctPortSheltered: [...distinctPort],
      distinctArchiveSheltered: [...distinctArch],
      severeRunsWithNonZeroOutOfRange: oorNonZero.map((r) => r.run),
      portRunsViolatingL1: l1Violations.map((r) => r.run),
      portRunsViolatingL2: l2Violations.map((r) => r.run),
      portAllCountersZero,
      archAllCountersZero,
      orderCensus: {
        runs: census.results.length,
        shelteredDistinct: census.swap_structure.sheltered_values,
        shelteredMin: censusMin,
        shelteredMax: censusMax,
        unreachableDistinct: census.swap_structure.unreachable_values,
        finalStateDivergence: census.final_state_divergence,
      },
    },
  };

  writeFileSync(path.join(REPLAY_ROOT, "clause3-rescore.json"), `${JSON.stringify(out, null, 2)}\n`);
  writeFileSync(path.join(REPLAY_ROOT, "clause3-rescore.md"), `${md.join("\n")}\n`);
  console.log(md.join("\n"));
  console.log(`\n[rescore] wrote ${path.join(REPLAY_ROOT, "clause3-rescore.json")}`);
}

main();
