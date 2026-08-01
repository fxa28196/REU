/**
 * gate-k-closures.ts — gate (k), closure census vs the schedule CSV.
 *
 * Source: `scripts/verify_E_runs.py`, `check_se_closures()` (lines 672–715).
 * Spec: `websim/docs/WP8-SPEC-archive-gates.md` §3.4.
 *
 * The manifest's `closures` block is the model's own report of what it did to
 * the street network. This gate cross-examines that report against the file it
 * claims to have read — six independent statements, each of which fails a
 * different way:
 *
 * | # | check | what a red means |
 * |---|---|---|
 * | k.1 | `closures.code == closuresCode` | the writer and the parameter disagree |
 * | k.2 | code 0 ⇒ key set is exactly `{code}` | a no-closure run is carrying closure state |
 * | k.3 | `scheduled_undirected_edges == CSV rows` | the parser dropped or duplicated rows |
 * | k.4 | `matching_graph_edges == CSV rows` | node-id drift between schedule and graph |
 * | k.5 | `blocked_edges_at_end == distinct pairs` | an edge was closed twice, or unclosed |
 * | k.6 | `closure_version_at_end == distinct hours` | a wave failed to fire |
 * | k.7 | `wave_hours == sorted distinct hours` | the waves fired at the wrong times |
 *
 * ── k.5's semantics are the subtle one ─────────────────────────────────────
 *
 * `blocked_edges_at_end` is read from the **live network** at export time and
 * must equal the number of **distinct undirected pairs** in the CSV —
 * `len(pairs)`, not `n_rows`. The two coincide throughout the archive because
 * the builder's own "no duplicate closed edge" gate guarantees it, but a port
 * that computed `blocked_edges_at_end` from the file instead of from the
 * network would turn k.5 into a tautology. The gate is transcribed to compare
 * the manifest's number against the file; producing that number correctly is
 * the engine's job, and this is the check that catches it if it does not.
 *
 * Likewise `closure_version_at_end` is the count of **distinct** activation
 * hours, and k.7 requires the manifest list to equal that sorted distinct list
 * exactly — order included.
 *
 * ── Reading the schedule ───────────────────────────────────────────────────
 *
 * The Python reads `ROOT / "Geography" / cl["schedule_file"]` with
 * `pd.read_csv(csv_path, dtype=str)` — note: **without** `keep_default_na`,
 * unlike the output frames, because the frame is only used for counts and int
 * conversions. The port takes a {@link ClosureScheduleSource} instead of
 * hard-coding the path, so the identical gate can be pointed at the read-only
 * `Geography/` tree (archived runs) or at the schedule the browser actually
 * loaded (engine output). All five committed schedules are unquoted, CRLF and
 * exactly 5 fields wide, so the archive reader parses them without a dialect
 * exception.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import type { Checks } from "./checks.js";
import { readFrame } from "./frame.js";
import { intParam, showValue, type ManifestJson, type RunView } from "./run-view.js";

/** How a run's `closures.schedule_file` is resolved to CSV text. */
export interface ClosureScheduleSource {
  /**
   * Resolve a `schedule_file` value. Return `null` when the file is absent —
   * that is a FAIL inside the gate, not an exception, because "the manifest
   * names a schedule that does not exist" is exactly the sort of thing the gate
   * is for.
   */
  resolve(scheduleFile: string): { readonly path: string; readonly text: string } | null;
}

/**
 * Read schedules from the read-only certified instrument tree, exactly as the
 * Python does (`ROOT / "Geography" / <schedule_file>`).
 */
export function geographyScheduleSource(geographyDir: string): ClosureScheduleSource {
  return {
    resolve(scheduleFile: string) {
      const full = path.join(geographyDir, ...scheduleFile.split("/"));
      try {
        return { path: full, text: readFileSync(full, "utf8") };
      } catch {
        return null;
      }
    },
  };
}

/** In-memory schedules, for engine output and for corrosion fixtures. */
export function inMemoryScheduleSource(
  files: Readonly<Record<string, string>>,
): ClosureScheduleSource {
  return {
    resolve(scheduleFile: string) {
      const text = files[scheduleFile];
      return text === undefined ? null : { path: `<memory>/${scheduleFile}`, text };
    },
  };
}

export interface ScheduleCensus {
  readonly rows: number;
  /** Distinct undirected node pairs, keyed `min:max` by string order. */
  readonly distinctPairs: number;
  /** Sorted distinct activation hours. */
  readonly hours: readonly number[];
}

/**
 * `n_rows`, `pairs` and `hours_csv` from a schedule CSV.
 *
 * `tuple(sorted((a, b)))` in the Python sorts the two node ids as **strings**
 * (the frame is `dtype=str`), so the port does too — for the all-digit ids in
 * every committed schedule the two orderings agree, and pinning the string
 * ordering keeps the pair key stable if an id ever gains a prefix.
 *
 * `int(h)` raises in Python on a non-integer activation hour; the port throws
 * for the same reason. A schedule whose hours cannot be read is not a run this
 * gate can adjudicate, and inventing a value would be worse than stopping.
 */
export function censusSchedule(text: string, label: string): ScheduleCensus {
  const frame = readFrame(text, label);
  const a = frame.column("node_a");
  const b = frame.column("node_b");
  const pairs = new Set<string>();
  for (const [i, left] of a.entries()) {
    const right = b[i] ?? "";
    pairs.add(left <= right ? `${left}:${right}` : `${right}:${left}`);
  }
  const hours = new Set<number>();
  for (const raw of frame.column("activation_hour")) {
    const value = Number(raw.trim());
    if (!Number.isInteger(value)) {
      throw new Error(`${label}: activation_hour '${raw}' is not an integer`);
    }
    hours.add(value);
  }
  return {
    rows: frame.rows.length,
    distinctPairs: pairs.size,
    hours: [...hours].sort((x, y) => x - y),
  };
}

/** `list(cl.get("wave_hours", [])) == hours_csv` with Python's `==`. */
function waveHoursEqual(manifestValue: unknown, hours: readonly number[]): boolean {
  if (!Array.isArray(manifestValue)) {
    // `list(<non-list>)` would raise in Python for a scalar and produce the
    // key list for a dict; neither can equal a list of ints, so the honest
    // reading of the comparison's outcome is "not equal".
    return false;
  }
  if (manifestValue.length !== hours.length) {
    return false;
  }
  return manifestValue.every((v, i) => typeof v === "number" && v === hours[i]);
}

function intField(block: ManifestJson, key: string, fallback: number): number {
  const raw = block[key];
  if (raw === undefined) {
    return fallback;
  }
  if (typeof raw === "number") {
    return Math.trunc(raw);
  }
  if (typeof raw === "string" && /^\s*[+-]?\d+\s*$/u.test(raw)) {
    return Number.parseInt(raw, 10);
  }
  // Python's `int()` raises here; the gate cannot compare what it cannot read.
  throw new Error(`closures.${key}: cannot read ${JSON.stringify(raw)} as an int`);
}

/**
 * Gate (k). Registers 1 check when the closures block is absent, 2 for a
 * closure-free run, 2 when the schedule file cannot be found, and 6 for a run
 * that actually closed streets.
 */
export function checkSeClosures(
  ck: Checks,
  run: RunView,
  schedules: ClosureScheduleSource,
): void {
  const code = intParam(run.params, "closuresCode", 0);
  const raw = run.manifest["closures"];
  if (raw === undefined || raw === null) {
    ck.add(
      `(k) [${run.name}] closures block present`,
      false,
      "simulation.json has no closures key (pre-Scenario-E writer?)",
    );
    return;
  }
  const cl = raw as ManifestJson;

  ck.add(
    `(k) [${run.name}] closures.code == closuresCode param`,
    intField(cl, "code", -1) === code,
    `closures.code=${showValue(cl["code"])} param=${code}`,
  );

  if (code === 0) {
    const keys = Object.keys(cl).sort();
    ck.add(
      `(k) [${run.name}] no-closure run carries the minimal block`,
      keys.length === 1 && keys[0] === "code",
      `keys=${JSON.stringify(keys)}`,
    );
    return;
  }

  const scheduleFile = typeof cl["schedule_file"] === "string" ? cl["schedule_file"] : "";
  const resolved = schedules.resolve(scheduleFile);
  if (resolved === null) {
    ck.add(
      `(k) [${run.name}] closure schedule file exists`,
      false,
      `${scheduleFile} not found`,
    );
    return;
  }

  const sched = censusSchedule(resolved.text, `${run.name}:${scheduleFile}`);

  ck.add(
    `(k) [${run.name}] scheduled edges == closure CSV rows`,
    intField(cl, "scheduled_undirected_edges", -1) === sched.rows,
    `manifest=${showValue(cl["scheduled_undirected_edges"])} csv=${sched.rows}`,
  );
  ck.add(
    `(k) [${run.name}] every scheduled closure matches a graph edge`,
    intField(cl, "matching_graph_edges", -1) === sched.rows,
    `matching=${showValue(cl["matching_graph_edges"])} of ${sched.rows} -- a mismatch ` +
      "means node-id drift between the schedule and the graph",
  );
  ck.add(
    `(k) [${run.name}] blocked_edges_at_end == distinct scheduled pairs`,
    intField(cl, "blocked_edges_at_end", -1) === sched.distinctPairs,
    `blocked_at_end=${showValue(cl["blocked_edges_at_end"])} ` +
      `distinct_pairs=${sched.distinctPairs} (rows=${sched.rows})`,
  );
  ck.add(
    `(k) [${run.name}] closure_version_at_end == wave count`,
    intField(cl, "closure_version_at_end", -1) === sched.hours.length,
    `version=${showValue(cl["closure_version_at_end"])} waves=${sched.hours.length}`,
  );
  ck.add(
    `(k) [${run.name}] wave_hours match the CSV activation hours`,
    waveHoursEqual(cl["wave_hours"], sched.hours),
    `manifest=${showValue(cl["wave_hours"])} csv=${JSON.stringify(sched.hours)}`,
  );
}
