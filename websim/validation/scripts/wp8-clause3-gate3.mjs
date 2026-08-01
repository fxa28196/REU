/**
 * wp8-clause3-gate3.mjs — independent re-measurement of WP8 acceptance clause 3.
 *
 * Run:  node validation/scripts/wp8-clause3-gate3.mjs
 *
 * This file imports nothing from `websim/`. It has its own RFC-4180 splitter,
 * its own numeric coercion and its own gate arithmetic, transcribed from
 * `scripts/verify_E_runs.py` via `websim/docs/WP8-SPEC-archive-gates.md` §3.
 * Both sides of every comparison are read as raw field text off disk:
 *
 *   port    websim/pipeline/out/wp8-replay/<run>/
 *   archive docs/runs/<archive>/<run>/
 *
 * Output: websim/pipeline/out/wp8-replay/clause3-gate3.json (+ stdout tables).
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const PORT_ROOT = path.join(REPO, "websim", "pipeline", "out", "wp8-replay");
const ARCH_ROOT = path.join(REPO, "docs", "runs");

const CASES = [
  ...[42, 43, 44].map((s) => ({ run: `ER-A-n6842-seed${s}`, archive: "phase-e", seed: s })),
  ...[42, 43, 44].map((s) => ({ run: `ER-C-n6842-seed${s}`, archive: "phase-e", seed: s })),
  ...[42, 43, 44].map((s) => ({ run: `SE-E18-seed${s}`, archive: "scenario-e", seed: s })),
  ...[42, 43, 44].map((s) => ({ run: `SE2-E18-d1-seed${s}`, archive: "scenario-e-v2", seed: s })),
];

// --- CSV -------------------------------------------------------------------

function splitCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; }
      } else field += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === ",") { row.push(field); field = ""; continue; }
    if (ch === "\r") continue;
    if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    field += ch;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function frame(file) {
  const rows = splitCsv(readFileSync(file, "utf8"));
  const header = rows[0];
  const data = rows.slice(1).filter((r) => !(r.length === 1 && r[0] === ""));
  const idx = new Map(header.map((h, i) => [h, i]));
  return {
    header,
    rows: data,
    has: (c) => idx.has(c),
    col: (c) => {
      const i = idx.get(c);
      if (i === undefined) throw new Error(`${file}: no column ${c}`);
      return data.map((r) => r[i] ?? "");
    },
    // verify_E_runs.py `num()`: pd.to_numeric(errors="coerce"); empty -> NaN.
    num: (c) => {
      const i = idx.get(c);
      if (i === undefined) return data.map(() => Number.NaN);
      return data.map((r) => {
        const v = (r[i] ?? "").trim();
        return v === "" ? Number.NaN : Number(v);
      });
    },
  };
}

const sum = (xs) => xs.reduce((a, b) => a + (Number.isNaN(b) ? 0 : b), 0);
const count = (xs, p) => xs.filter(p).length;

// --- per-run measurement ---------------------------------------------------

function measure(dir) {
  const a = frame(path.join(dir, "agents.csv"));
  const s = frame(path.join(dir, "shelters.csv"));
  const m = JSON.parse(readFileSync(path.join(dir, "simulation.json"), "utf8"));

  const state = a.col("final_state");
  const blk = a.num("blockages_encountered").map((v) => (Number.isNaN(v) ? 0 : v));
  const psh = a.num("push_throughs").map((v) => (Number.isNaN(v) ? 0 : v));
  const rrt = a.num("reroutes").map((v) => (Number.isNaN(v) ? 0 : v));
  const stk = a.num("stuck_events").map((v) => (Number.isNaN(v) ? 0 : v));

  const started = a.col("time_started_tick").map((v) => v.trim() !== "");
  const arrived = a.col("time_arrived_tick").map((v) => v.trim() !== "");
  const startTick = a.num("time_started_tick");
  const arrTick = a.num("time_arrived_tick");
  const finite = (xs) => xs.filter((v) => Number.isFinite(v));

  const awareCol = a.has("aware_initial") ? a.col("aware_initial") : [];
  const thetaCol = a.has("theta_z") ? a.col("theta_z") : [];

  const stateHist = {};
  for (const v of state) stateHist[v] = (stateHist[v] ?? 0) + 1;

  const refused = s.has("refused_count") ? sum(s.num("refused_count")) : 0;
  const policy = s.has("policy_refused") ? sum(s.num("policy_refused")) : 0;

  return {
    n: a.rows.length,
    header_cols: a.header.length,
    sheltered_csv: count(state, (v) => v === "SHELTERED"),
    sheltered_manifest: m.population?.sheltered ?? null,
    sheltered_reached_yes: count(a.col("reached_shelter"), (v) => v === "yes"),
    sheltered_occupancy: s.has("final_occupancy") ? sum(s.num("final_occupancy")) : null,
    unreachable_csv: count(state, (v) => v === "UNREACHABLE"),
    unreachable_manifest: m.population?.unreachable ?? null,
    refused_all_full_manifest: m.population?.refused_all_full ?? null,
    unaware_manifest: m.population?.unaware ?? null,
    pre_evac_manifest: m.population?.pre_evac ?? null,
    en_route_manifest: m.population?.en_route ?? null,
    state_hist: stateHist,
    door_refusals_total: Math.trunc(refused),
    policy_refusals: Math.trunc(policy),
    capacity_refusals: Math.trunc(refused - policy),
    door_ledger_agents: Math.trunc(sum(a.num("door_refusals"))),
    // gate (l)
    l_blk: Math.trunc(sum(blk)),
    l_psh: Math.trunc(sum(psh)),
    l_rrt: Math.trunc(sum(rrt)),
    l_stk: Math.trunc(sum(stk)),
    l1_bad_rows: count(blk.map((v, i) => v !== psh[i] + rrt[i]), Boolean),
    l2_bad_rows: count(stk.map((v, i) => v > psh[i]), Boolean),
    residents_blocked: count(blk, (v) => v > 0),
    out_of_range_lookups: m.smoke_field?.out_of_range_lookups ?? null,
    smoke_hours: m.smoke_field?.hours ?? null,
    smoke_peak: m.smoke_field?.peak_hourly_ugm3 ?? null,
    // decision-layer liveness witnesses
    aware_nonempty: count(awareCol, (v) => v.trim() !== ""),
    aware_one: count(awareCol, (v) => v.trim() === "1"),
    theta_distinct: new Set(thetaCol.filter((v) => v.trim() !== "")).size,
    has_pet_one: a.has("has_pet") ? count(a.col("has_pet"), (v) => v.trim() === "1") : 0,
    has_dep_one: a.has("has_dependents") ? count(a.col("has_dependents"), (v) => v.trim() === "1") : 0,
    heavy_one: a.has("heavy_belongings") ? count(a.col("heavy_belongings"), (v) => v.trim() === "1") : 0,
    // trajectory-set shape (the like-for-like question)
    departures: count(started, Boolean),
    arrivals: count(arrived, Boolean),
    first_departure_tick: finite(startTick).length ? Math.min(...finite(startTick)) : null,
    last_departure_tick: finite(startTick).length ? Math.max(...finite(startTick)) : null,
    last_arrival_tick: finite(arrTick).length ? Math.max(...finite(arrTick)) : null,
    _startTick: startTick,
    _arrTick: arrTick,
    _manifest: m,
    _agents: a,
    _shelters: s,
  };
}

// --- in-transit census at a wave instant -----------------------------------

function inTransitAt(mm, tick) {
  let n = 0;
  for (let i = 0; i < mm._startTick.length; i++) {
    const s = mm._startTick[i];
    if (!Number.isFinite(s) || s > tick) continue;
    const e = mm._arrTick[i];
    if (!Number.isFinite(e) || e >= tick) n++;
  }
  return n;
}

// --- per-agent / per-column identity ---------------------------------------

const IDENTITY_EXCLUDE = new Set(["sim_id", "commit", "data_version"]);
const WALLCLOCK = /(^|_)(generated|created|wallclock|timestamp|run_at|exported?_at)(_|$)/i;

function identity(portM, archM) {
  const pa = portM._agents;
  const aa = archM._agents;
  const shared = pa.header.filter((c) => aa.header.includes(c));
  const cols = shared.filter((c) => !IDENTITY_EXCLUDE.has(c) && !WALLCLOCK.test(c));

  const pk = pa.col("agent_id");
  const ak = aa.col("agent_id");
  const aIdx = new Map(ak.map((k, i) => [k, i]));
  const keysEqual = pk.length === ak.length && pk.every((k) => aIdx.has(k));

  const perCol = {};
  let identicalRows = 0;
  const rowBad = new Array(pk.length).fill(false);
  for (const c of cols) {
    const pv = pa.col(c);
    const av = aa.col(c);
    let d = 0;
    for (let i = 0; i < pv.length; i++) {
      const j = aIdx.get(pk[i]);
      if (j === undefined) continue;
      if (pv[i] !== av[j]) { d++; rowBad[i] = true; }
    }
    perCol[c] = d;
  }
  identicalRows = rowBad.filter((b) => !b).length;

  const bitEqual = Object.entries(perCol).filter(([, d]) => d === 0).map(([c]) => c);

  // shelters.csv
  const ps = portM._shelters;
  const as_ = archM._shelters;
  const sShared = ps.header.filter((c) => as_.header.includes(c));
  const sKey = ps.col("shelter_id");
  const aKeyIdx = new Map(as_.col("shelter_id").map((k, i) => [k, i]));
  const sPerCol = {};
  for (const c of sShared) {
    const pv = ps.col(c);
    const av = as_.col(c);
    let d = 0;
    for (let i = 0; i < pv.length; i++) {
      const j = aKeyIdx.get(sKey[i]);
      if (j === undefined) continue;
      if (pv[i] !== av[j]) d++;
    }
    sPerCol[c] = d;
  }

  return {
    shared_cols: shared.length,
    compared_cols: cols.length,
    rows: pk.length,
    key_sets_equal: keysEqual,
    rows_byte_identical: identicalRows,
    cols_bit_equal: bitEqual.length,
    cols_divergent: Object.entries(perCol).filter(([, d]) => d > 0).map(([c, d]) => [c, d]),
    final_state_diffs: perCol["final_state"] ?? null,
    shelters_rows: sKey.length,
    shelters_cols_compared: sShared.length,
    shelters_cols_divergent: Object.entries(sPerCol).filter(([, d]) => d > 0).map(([c, d]) => [c, d]),
  };
}

// --- main ------------------------------------------------------------------

const out = { schema: "websim/wp8-clause3-gate3/v1", generated: new Date().toISOString(), runs: [] };
const missing = [];

for (const c of CASES) {
  const pd = path.join(PORT_ROOT, c.run);
  const ad = path.join(ARCH_ROOT, c.archive, c.run);
  if (!existsSync(path.join(pd, "agents.csv"))) { missing.push(c.run); continue; }
  const port = measure(pd);
  const arch = measure(ad);
  const id = identity(port, arch);

  const strip = (m) => {
    const { _startTick, _arrTick, _manifest, _agents, _shelters, ...rest } = m;
    return rest;
  };
  out.runs.push({
    run: c.run,
    archive: c.archive,
    seed: c.seed,
    port: strip(port),
    archived: strip(arch),
    identity: id,
    archived_closures: arch._manifest.closures ?? null,
    port_closures_manifest: port._manifest.closures ?? null,
    port_closure_census: existsSync(path.join(pd, "closure-census.json"))
      ? JSON.parse(readFileSync(path.join(pd, "closure-census.json"), "utf8"))
      : null,
    _port: port,
    _arch: arch,
  });
}

if (missing.length) console.log(`MISSING PORT RUNS: ${missing.join(", ")}`);

// Table 1 — the four requested quantities.
const pad = (v, w) => String(v).padStart(w);
console.log("\n=== TABLE 1 — sheltered / policy_refusals / unreachable / gate (l) ===");
console.log(
  "run                     shelt(port) shelt(arch)  pol(port) pol(arch)  unre(port) unre(arch)  " +
    "l:blk/psh/rrt/stk port    archive      l1bad l2bad  oor",
);
for (const r of out.runs) {
  const p = r.port, a = r.archived;
  console.log(
    r.run.padEnd(22) +
      pad(p.sheltered_csv, 10) + pad(a.sheltered_csv, 12) +
      pad(p.policy_refusals, 11) + pad(a.policy_refusals, 10) +
      pad(p.unreachable_csv, 12) + pad(a.unreachable_csv, 11) + "  " +
      `${p.l_blk}/${p.l_psh}/${p.l_rrt}/${p.l_stk}`.padStart(12) +
      `${a.l_blk}/${a.l_psh}/${a.l_rrt}/${a.l_stk}`.padStart(12) +
      pad(p.l1_bad_rows, 7) + pad(p.l2_bad_rows, 6) + pad(String(p.out_of_range_lookups), 5),
  );
}

console.log("\n=== TABLE 2 — 4-way sheltered identity (gate b) on the PORT side ===");
console.log("run                     csv  manifest  reached_yes  sum(final_occupancy)  agree");
for (const r of out.runs) {
  const p = r.port;
  const agree =
    p.sheltered_csv === p.sheltered_manifest &&
    p.sheltered_csv === p.sheltered_reached_yes &&
    p.sheltered_csv === p.sheltered_occupancy;
  console.log(
    r.run.padEnd(22) + pad(p.sheltered_csv, 5) + pad(p.sheltered_manifest, 10) +
      pad(p.sheltered_reached_yes, 13) + pad(p.sheltered_occupancy, 22) + "  " + (agree ? "YES" : "NO"),
  );
}

console.log("\n=== TABLE 3 — decision-layer liveness witnesses (port | archive) ===");
console.log("run                     aware_ne     aware=1    theta_distinct   pet=1     dep=1    heavy=1");
for (const r of out.runs) {
  const p = r.port, a = r.archived;
  console.log(
    r.run.padEnd(22) +
      `${p.aware_nonempty}|${a.aware_nonempty}`.padStart(12) +
      `${p.aware_one}|${a.aware_one}`.padStart(12) +
      `${p.theta_distinct}|${a.theta_distinct}`.padStart(14) +
      `${p.has_pet_one}|${a.has_pet_one}`.padStart(12) +
      `${p.has_dep_one}|${a.has_dep_one}`.padStart(10) +
      `${p.heavy_one}|${a.heavy_one}`.padStart(12),
  );
}

console.log("\n=== TABLE 4 — terminal-state histogram (port vs archive) ===");
for (const r of out.runs) {
  const k = [...new Set([...Object.keys(r.port.state_hist), ...Object.keys(r.archived.state_hist)])].sort();
  console.log(
    r.run.padEnd(22) +
      k.map((s) => `${s}=${r.port.state_hist[s] ?? 0}|${r.archived.state_hist[s] ?? 0}`).join(" "),
  );
}

console.log("\n=== TABLE 5 — trajectory set (departures/arrivals/window, ticks) ===");
console.log("run                     side     departures arrivals  firstDep  lastDep  lastArr");
for (const r of out.runs) {
  for (const [side, m] of [["port", r.port], ["archive", r.archived]]) {
    console.log(
      r.run.padEnd(22) + side.padEnd(9) + pad(m.departures, 10) + pad(m.arrivals, 9) +
        pad(m.first_departure_tick, 10) + pad(m.last_departure_tick, 9) + pad(m.last_arrival_tick, 9),
    );
  }
}

console.log("\n=== TABLE 6 — per-agent / per-column identity vs the archive ===");
console.log("run                     cols_cmp  bit_equal  rows_identical  final_state_diffs  keysEq");
for (const r of out.runs) {
  const i = r.identity;
  console.log(
    r.run.padEnd(22) + pad(i.compared_cols, 8) + pad(i.cols_bit_equal, 11) +
      pad(`${i.rows_byte_identical}/${i.rows}`, 16) + pad(i.final_state_diffs, 19) +
      pad(String(i.key_sets_equal), 8),
  );
}

console.log("\n=== TABLE 7 — divergent columns per run (agents.csv) ===");
for (const r of out.runs) {
  console.log(`${r.run}: ` + (r.identity.cols_divergent.length === 0
    ? "NONE — every compared column bit-equal"
    : r.identity.cols_divergent.map(([c, d]) => `${c}:${d}`).join(" ")));
}

console.log("\n=== TABLE 8 — divergent columns per run (shelters.csv) ===");
for (const r of out.runs) {
  console.log(`${r.run}: ` + (r.identity.shelters_cols_divergent.length === 0
    ? "NONE — every compared column bit-equal"
    : r.identity.shelters_cols_divergent.map(([c, d]) => `${c}:${d}`).join(" ")));
}

console.log("\n=== TABLE 9 — in-transit residents at each wave instant ===");
for (const r of out.runs) {
  const cl = r.archived_closures;
  if (!cl || !cl.wave_hours) continue;
  const tpH = 60; // minutesPerTick = 1.0 in every archived E run
  const line = cl.wave_hours.map((h) => {
    const t = h * tpH;
    return `h${h}: port=${inTransitAt(r._port, t)} arch=${inTransitAt(r._arch, t)}`;
  });
  console.log(`${r.run} (code ${cl.code}) ` + line.join("  "));
}

console.log("\n=== TABLE 10 — three-different-answers check (seed 42) ===");
for (const r of out.runs.filter((x) => x.seed === 42)) {
  console.log(
    `${r.run.padEnd(22)} port sheltered=${r.port.sheltered_csv}  archive=${r.archived.sheltered_csv}` +
      `  (2060 = the layer-off E0 value)`,
  );
}

for (const r of out.runs) { delete r._port; delete r._arch; }
const outPath = path.join(PORT_ROOT, "clause3-gate3.json");
writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
console.log(`\nwrote ${outPath}`);
