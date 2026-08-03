/**
 * run-mutation-gate.ts — WP9's mutation gate, as a CI-blocking command.
 *
 * > **Plan §5.2 (graft, CI-blocking).** "A CI job injects a seed perturbation
 * > (and one formatter perturbation) into a replay and asserts the gate suite
 * > goes **red** — the gates are proven able to fail, never
 * > observed-green-by-vacuity."
 *
 * ## The contract, in the direction that matters
 *
 * This command FAILS when an injected defect leaves the suite GREEN. That is the
 * inversion that makes it a gate rather than a diagnostic: an ordinary test says
 * "the code is right"; this says "the tests can tell when the code is wrong".
 *
 * Three things must hold for the run to be reported green:
 *
 *  1. **the negative control stays green.** A comment-only edit must leave the
 *     suite passing. If it does not, the tree is red for an unrelated reason and
 *     every "detected" verdict in the run is unattributable, so the run is VOID
 *     — not passed, not failed on the injections, void.
 *  2. **every injection turns the suite red at its declared magnitude**, and
 *  3. **the named detector is among the failing tests.** Exit code alone is not
 *     enough: an injection that broke the TypeScript transform would exit
 *     non-zero and look exactly like a caught defect. The report names the test.
 *
 * ## Modes
 *
 *   --gate        (default) run each injection at its catalogued smallest
 *                 DETECTED magnitude and require red + the named detector.
 *   --measure     walk every rung of every ladder and report the finest rung
 *                 that is still detected, and by what. This is how the
 *                 catalogue's measured fields are produced; it is slow.
 *   --prove-can-fail
 *                 run the gate against a deliberately inert "injection" that the
 *                 catalogue claims is detected. The gate MUST report failure;
 *                 this command exits 0 exactly when it does. It is the gate's own
 *                 can-fail proof, and it is a step in the CI job.
 *   --restore-only
 *                 crash recovery. Copy every parked original back over its
 *                 source and print the digests. Needed because a Node process
 *                 blocked in `spawnSync` cannot service SIGTERM until the child
 *                 returns, so a hard kill during a long child run CAN leave a
 *                 source mutated. Every other mode REFUSES to start while a
 *                 parked original exists, so a crash cannot be certified as a
 *                 clean baseline.
 *
 * ## Flags
 *
 *   --scope fast|wide|full
 *                       fast = the catalogued per-injection file selection
 *                       (seconds). wide = every project but `validation`
 *                       (~2.5 min). full = the entire suite (~11 min).
 *   --only <id>[,<id>]  restrict to these injection ids.
 *   --rung <id>[,<id>]  restrict `--measure` to these ladder rungs.
 *   --filter <p>[,<p>]  override the scope with explicit vitest file filters.
 *   --require-artifacts run children with WEBSIM_REQUIRE_ARTIFACTS=1.
 *   --json <path>       write the machine-readable report here.
 *
 * ## Safety
 *
 * Source files are edited in place. A SHA-256 manifest is taken before anything
 * is written; original bytes are parked under `pipeline/out/test-tmp/` (the
 * sanctioned scratch root); restoration runs from `finally`, from SIGINT/SIGTERM
 * and from `process.on("exit")`; and the final act of the command is to re-verify
 * every file against the pre-experiment manifest and exit non-zero — loudly, with
 * the digests printed — if a single byte differs. `git` is never invoked: a
 * `git checkout` would "restore" by discarding whatever else was in the working
 * tree, which is not restoration.
 */

import { writeFileSync } from "node:fs";
import path from "node:path";

import {
  INJECTIONS,
  NEGATIVE_CONTROL,
  catalogueFiles,
  rungById,
  type Injection,
  type Rung,
} from "./catalogue.js";
import {
  EditSession,
  WEBSIM_ROOT,
  buildManifest,
  leftoverBackups,
  manifestDrift,
  recoverFromBackups,
  runSuite,
  type SuiteResult,
} from "./harness.js";

// ---------------------------------------------------------------------------
// argv
// ---------------------------------------------------------------------------

interface Args {
  readonly mode: "gate" | "measure" | "prove-can-fail" | "restore-only";
  readonly scope: Scope;
  readonly only: readonly string[];
  /** Restrict `--measure` to these rung ids (empty = the whole ladder). */
  readonly rungs: readonly string[];
  /**
   * Override the scope with an explicit vitest filter list. Used to answer
   * "does THIS file, on its own, catch it?" — which is how a clean-clone
   * detector is proved when the machine happens to hold the artifacts.
   */
  readonly filter: readonly string[];
  readonly requireArtifacts: boolean;
  readonly json: string | null;
}

/**
 * `fast` — the catalogued per-injection file selection. Seconds, and it is what
 *          the CI gate runs: it names the specific test that owns the defect.
 * `wide`  — every project except `validation`. ~2.5 minutes. This is the scope
 *          the blind-spot search uses, because "nothing in the engine noticed"
 *          is a far stronger statement than "the six files I picked did not".
 * `full`  — the entire suite, including the archive replays. ~11 minutes.
 */
export type Scope = "fast" | "wide" | "full";

const WIDE_ARGV = [
  "--project",
  "engine",
  "--project",
  "shared",
  "--project",
  "pipeline",
  "--project",
  "tools",
] as const;

function parseArgs(argv: readonly string[]): Args {
  let mode: Args["mode"] = "gate";
  let scope: Args["scope"] = "fast";
  let only: string[] = [];
  let rungs: string[] = [];
  let filter: string[] = [];
  let requireArtifacts = false;
  let json: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    switch (a) {
      case "--gate":
        mode = "gate";
        break;
      case "--measure":
        mode = "measure";
        break;
      case "--prove-can-fail":
        mode = "prove-can-fail";
        break;
      case "--restore-only":
        mode = "restore-only";
        break;
      case "--scope": {
        const v = argv[++i];
        if (v !== "fast" && v !== "wide" && v !== "full") {
          throw new Error(`--scope must be 'fast', 'wide' or 'full', got ${String(v)}`);
        }
        scope = v;
        break;
      }
      case "--only":
        only = (argv[++i] ?? "").split(",").filter((s) => s.length > 0);
        break;
      case "--rung":
        rungs = (argv[++i] ?? "").split(",").filter((s) => s.length > 0);
        break;
      case "--filter":
        filter = (argv[++i] ?? "").split(",").filter((s) => s.length > 0);
        break;
      case "--require-artifacts":
        requireArtifacts = true;
        break;
      case "--json":
        json = argv[++i] ?? null;
        break;
      default:
        throw new Error(`unknown argument '${a}'`);
    }
  }
  return { mode, scope, only, rungs, filter, requireArtifacts, json };
}

// ---------------------------------------------------------------------------
// reporting types
// ---------------------------------------------------------------------------

interface RungResult {
  readonly injection: string;
  readonly rung: string;
  readonly label: string;
  readonly red: boolean;
  readonly exitCode: number;
  readonly failed: number;
  readonly passed: number;
  readonly skipped: number;
  readonly filesReporting: number;
  readonly durationMs: number;
  readonly firstFailures: readonly { file: string; test: string }[];
}

interface GateVerdict {
  readonly injection: string;
  readonly title: string;
  readonly rung: string | null;
  readonly ok: boolean;
  readonly reason: string;
  readonly detail: RungResult | null;
}

function summarise(injection: Injection, rung: Rung, r: SuiteResult): RungResult {
  return {
    injection: injection.id,
    rung: rung.id,
    label: rung.label,
    red: r.red,
    exitCode: r.exitCode,
    failed: r.failed,
    passed: r.passed,
    skipped: r.skipped,
    filesReporting: r.files.length,
    durationMs: r.durationMs,
    firstFailures: r.failures.slice(0, 12).map((f) => ({ file: f.file, test: f.name })),
  };
}

function filtersFor(injection: Injection, args: Args): readonly string[] {
  if (args.filter.length > 0) return args.filter;
  if (args.scope === "full") return [];
  if (args.scope === "wide") return [...WIDE_ARGV];
  if (injection.scope.length === 0) {
    // An empty positional filter list means "run the entire suite" to vitest.
    // In `fast` scope that is never what was meant, and it once turned a
    // no-injections-selected control run into an 11-minute whole-suite run that
    // then hit a harness timeout mid-injection. Fail fast instead.
    throw new Error(
      `injection '${injection.id}' has an empty fast scope; that would silently run the ` +
        "WHOLE suite. Give it explicit filters, or use --scope wide/full deliberately.",
    );
  }
  return injection.scope;
}

// ---------------------------------------------------------------------------
// the run
// ---------------------------------------------------------------------------

function line(s = ""): void {
  process.stdout.write(`${s}\n`);
}

function runOneRung(
  session: EditSession,
  injection: Injection,
  rung: Rung,
  args: Args,
  bail: boolean,
): SuiteResult {
  session.apply(injection.file, rung.find, rung.replace);
  try {
    return runSuite({
      filters: filtersFor(injection, args),
      requireArtifacts: args.requireArtifacts,
      bail,
    });
  } finally {
    session.restoreAll();
  }
}

function main(): number {
  const args = parseArgs(process.argv.slice(2));

  if (args.mode === "restore-only") {
    const stale = leftoverBackups();
    if (stale.length === 0) {
      line("nothing to recover: no parked originals under the mutation backup root.");
      return 0;
    }
    line(`recovering ${stale.length} parked original(s):`);
    for (const rec of recoverFromBackups()) {
      line(`  ${rec.sha256}  ${rec.rel}  ${rec.wasMutated ? "(WAS MUTATED)" : "(already clean)"}`);
    }
    line("recovery complete. Re-run the gate.");
    return 0;
  }

  const files = catalogueFiles();
  const manifest = buildManifest(files);

  line("=".repeat(78));
  line("WP9 MUTATION GATE — proving the validation harness itself can fail");
  line(`mode=${args.mode}  scope=${args.scope}  requireArtifacts=${args.requireArtifacts}`);
  line("=".repeat(78));
  line("pre-experiment SHA-256 manifest:");
  for (const [rel, sha] of manifest) {
    line(`  ${sha}  ${rel}`);
  }
  line();

  const session = new EditSession(manifest);
  const rungResults: RungResult[] = [];
  const verdicts: GateVerdict[] = [];
  let voided: string | null = null;
  let deferredIds: readonly string[] = [];

  try {
    const requested = (args.mode === "prove-can-fail" ? [INERT_LIE] : INJECTIONS).filter(
      (i) => args.only.length === 0 || args.only.includes(i.id),
    );
    // An injection whose only measured detectors are artifact-gated cannot be
    // proved on a runner without the artifacts: the detector reports as SKIPPED,
    // the suite stays green, and that is a fact about the runner rather than
    // about the gates. Rather than let it read as a sensitivity regression, such
    // rows are declared `needsArtifacts` and ANNOUNCED — never silently dropped —
    // exactly the way `tools/artifact-gate.ts` treats every other
    // artifact-dependent claim in this tree.
    const deferred = requested.filter((i) => i.needsArtifacts && !args.requireArtifacts);
    const selected = requested.filter((i) => !(i.needsArtifacts && !args.requireArtifacts));
    deferredIds = deferred.map((i) => i.id);
    if (deferred.length > 0) {
      line("!! NOT PROVABLE ON THIS RUNNER — artifact-gated detectors, deferred:");
      for (const i of deferred) {
        const d = i.detector;
        line(
          `!!   ${i.id} — only measured detector is ${d === null ? "(none)" : d.file}, ` +
            "which is gated on artifacts this run does not hold.",
        );
        line(`!!     evidence forgone: that an injected '${i.title}' turns the suite red.`);
        line(
          "!!     re-run with --require-artifacts on a runner holding pipeline/out and the " +
            "archive (the mutation-gate-full CI job does exactly that).",
        );
      }
      line();
    }

    // ------------------------------------------------------ negative control
    // Always first, always. It is the only thing that makes a later "red" mean
    // "the injection did it" — and its scope is the UNION of the scopes actually
    // exercised below, so the greenness being relied on is the greenness proved.
    const ctlRung = NEGATIVE_CONTROL.ladder[0] as Rung;
    const control: Injection = {
      ...NEGATIVE_CONTROL,
      scope: [...new Set(selected.flatMap((i) => i.scope))].sort(),
    };
    if (selected.length === 0) {
      line("nothing selected to inject — no control run, and no verdict to issue.");
      line();
    }
    line(`[control] ${control.title}`);
    line(`  scope: ${control.scope.length === 0 ? "(everything)" : control.scope.join(" ")}`);
    const ctl =
      selected.length === 0
        ? null
        : runOneRung(session, control, ctlRung, args, false);
    if (ctl === null) {
      line("  skipped: nothing to attribute.");
    }
    if (ctl !== null) rungResults.push(summarise(control, ctlRung, ctl));
    if (ctl !== null && ctl.red && args.mode === "measure") {
      // MEASURE issues no verdict, so a red control is recorded and reported but
      // does not abandon the sweep — the point of a sweep is the data.
      line(
        `  !! control is RED (exit ${ctl.exitCode}, ${ctl.failed} failing). Measurements below ` +
          "are still collected, but every one of them is confounded until this is explained.",
      );
      for (const f of ctl.failures.slice(0, 10)) {
        line(`     ${f.file} :: ${f.name}`);
      }
    } else if (ctl !== null && ctl.red) {
      voided =
        `NEGATIVE CONTROL WENT RED (exit ${ctl.exitCode}, ${ctl.failed} failing). ` +
        "The tree is failing for a reason that is not an injection, so no injection verdict " +
        "in this run is attributable. Run is VOID.";
      line(`  !! ${voided}`);
      for (const f of ctl.failures.slice(0, 10)) {
        line(`     ${f.file} :: ${f.name}`);
      }
    } else if (ctl !== null) {
      line(
        `  green as required — ${ctl.passed} passed, ${ctl.skipped} skipped, ` +
          `${ctl.files.length} files, ${(ctl.durationMs / 1000).toFixed(1)} s`,
      );
    }
    line();

    if (voided === null) {
      for (const injection of selected) {
        line("-".repeat(78));
        line(`[${injection.id}] ${injection.title}`);
        line(`  target: ${injection.file}`);

        if (args.mode === "measure") {
          let smallest: { rung: Rung; result: SuiteResult } | null = null;
          let blind: Rung | null = null;
          const ladder = injection.ladder.filter(
            (r) => args.rungs.length === 0 || args.rungs.includes(r.id),
          );
          for (const rung of ladder) {
            const r = runOneRung(session, injection, rung, args, false);
            rungResults.push(summarise(injection, rung, r));
            const verdict = r.red ? "RED (detected)" : "green (BLIND)";
            line(
              `  ${rung.id.padEnd(12)} ${rung.label.padEnd(44)} ${verdict}` +
                `  [${(r.durationMs / 1000).toFixed(0)} s]`,
            );
            if (r.red) {
              smallest = { rung, result: r };
              for (const f of r.failures.slice(0, 3)) {
                line(`      caught by ${f.file} :: ${f.name}`);
              }
            } else if (blind === null) {
              blind = rung;
            }
          }
          if (smallest === null) {
            line("  !! BLIND SPOT: every rung left the suite green.");
          } else {
            const f = smallest.result.failures[0];
            line(
              `  => smallest detected: ${smallest.rung.id} (${smallest.rung.label})` +
                (f === undefined ? "" : `, first detector ${f.file} :: ${f.name}`),
            );
          }
          if (blind !== null) {
            line(`  => blind at/below: ${blind.id} (${blind.label})`);
          }
          continue;
        }

        // ------------------------------------------------------------ gate
        if (injection.smallestDetected === null) {
          verdicts.push({
            injection: injection.id,
            title: injection.title,
            rung: null,
            ok: false,
            reason:
              "catalogue records NO detected magnitude for this injection — it is an open " +
              "BLIND SPOT and the gate refuses to report green while one is open. Either " +
              "close it with a targeted oracle assertion or delete the row deliberately.",
            detail: null,
          });
          line("  !! BLIND SPOT recorded in the catalogue — gate fails.");
          continue;
        }
        const rung = rungById(injection, injection.smallestDetected);
        line(`  magnitude: ${rung.label}`);
        // No `--bail`: the gate asserts a NAMED detector, and bail races mean the
        // named file may never have been collected. A complete failure list is the
        // difference between "red" and "red for the reason on record".
        const r = runOneRung(session, injection, rung, args, false);
        const summary = summarise(injection, rung, r);
        rungResults.push(summary);

        if (!r.red) {
          verdicts.push({
            injection: injection.id,
            title: injection.title,
            rung: rung.id,
            ok: false,
            reason:
              `THE SUITE STAYED GREEN under an injected defect (${r.passed} passed, ` +
              `${r.skipped} skipped, ${r.files.length} files). The catalogue says this ` +
              "magnitude was detected; it no longer is. Sensitivity has regressed.",
            detail: summary,
          });
          line(`  !! GREEN under injection — gate fails.`);
          continue;
        }

        const wanted = injection.detector;
        const named =
          wanted === null
            ? undefined
            : r.failures.find((f) => f.file === wanted.file && f.name.includes(wanted.test));
        if (wanted !== null && named === undefined) {
          verdicts.push({
            injection: injection.id,
            title: injection.title,
            rung: rung.id,
            ok: false,
            reason:
              `red, but NOT by the declared detector. Expected ${wanted.file} :: ` +
              `"${wanted.test}" among the failures; got ` +
              `${r.failures
                .slice(0, 5)
                .map((f) => `${f.file}::${f.name}`)
                .join(" | ")}. A red run whose cause is not the one on record could be a ` +
              "broken transform rather than a caught defect.",
            detail: summary,
          });
          line("  !! red, but the declared detector did not fire — gate fails.");
          continue;
        }
        verdicts.push({
          injection: injection.id,
          title: injection.title,
          rung: rung.id,
          ok: true,
          reason:
            `RED as required (${r.failed} failing)` +
            (wanted === null ? "" : `, caught by ${wanted.file} :: "${wanted.test}"`),
          detail: summary,
        });
        line(
          `  RED as required — ${r.failed} failing in ` +
            `${(r.durationMs / 1000).toFixed(1)} s` +
            (wanted === null ? "" : `; detector ${wanted.file} :: ${wanted.test}`),
        );
      }
    }
  } finally {
    session.disarm();
  }

  // ------------------------------------------------------------- restoration
  line();
  line("=".repeat(78));
  const drift = manifestDrift(manifest);
  if (drift.length > 0) {
    line("RESTORATION FAILED — the working tree does NOT match the pre-experiment manifest:");
    for (const d of drift) {
      line(`  ${d.rel}\n    expected ${d.expected}\n    actual   ${d.actual}`);
    }
  } else {
    line(`restoration verified by SHA-256: all ${manifest.size} catalogue files byte-identical`);
    for (const [rel, sha] of manifest) {
      line(`  ${sha}  ${rel}`);
    }
  }

  // ------------------------------------------------------------------ verdict
  line();
  let exit = 0;
  if (args.mode === "measure") {
    line("MEASURE run complete — no pass/fail verdict is issued in this mode.");
  } else if (voided !== null) {
    line(`VOID: ${voided}`);
    exit = 2;
  } else {
    const bad = verdicts.filter((v) => !v.ok);
    for (const v of verdicts) {
      line(`  ${v.ok ? "PASS" : "FAIL"}  ${v.injection.padEnd(30)} ${v.reason}`);
    }
    if (args.mode === "prove-can-fail") {
      // Inverted: the gate is required to FAIL on the inert injection.
      if (bad.length === 1 && bad[0]?.injection === INERT_LIE.id) {
        line();
        line(
          "CAN-FAIL PROOF PASSED: the gate reported FAIL for an injection that changes no " +
            "behaviour, so a green mutation-gate run is evidence and not ceremony.",
        );
        exit = 0;
      } else {
        line();
        line(
          "CAN-FAIL PROOF FAILED: the gate did NOT fail on an inert injection. " +
            "The mutation gate cannot be trusted to fail, so it cannot be trusted to pass.",
        );
        exit = 1;
      }
    } else {
      exit = bad.length === 0 ? 0 : 1;
      line();
      line(
        bad.length === 0
          ? `MUTATION GATE PASSED — ${verdicts.length} injected defects, all detected.` +
            (deferredIds.length === 0
              ? ""
              : ` ${deferredIds.length} deferred for missing artifacts: ${deferredIds.join(", ")}.`)
          : `MUTATION GATE FAILED — ${bad.length}/${verdicts.length} injected defects not ` +
            "detected by the suite.",
      );
    }
  }
  if (drift.length > 0) {
    exit = 3;
    line("EXIT 3: sources were not restored. DO NOT COMMIT. Restore by hand before continuing.");
  }

  if (args.json !== null) {
    const out = path.isAbsolute(args.json) ? args.json : path.join(WEBSIM_ROOT, args.json);
    if (out.includes(`${path.sep}test-tmp${path.sep}`)) {
      // `tools/check-scratch.ts` requires pipeline/out/test-tmp to be EMPTY when
      // a run ends, so a report parked there turns a passing gate into a failing
      // scratch guard. Loud rather than surprising; CI writes to the runner temp.
      line(
        "  !! WARNING: the report is being written under pipeline/out/test-tmp, which " +
          "`npm run check:scratch` requires to be empty at end of run. Delete it, or point " +
          "--json outside the repository (CI uses the runner's temp directory).",
      );
    }
    writeFileSync(
      out,
      `${JSON.stringify(
        {
          mode: args.mode,
          scope: args.scope,
          requireArtifacts: args.requireArtifacts,
          deferredForMissingArtifacts: deferredIds,
          manifest: Object.fromEntries(manifest),
          restored: drift.length === 0,
          drift,
          void: voided,
          rungs: rungResults,
          verdicts,
          exit,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    line(`report written to ${out}`);
  }
  return exit;
}

/**
 * The inert "injection" used by `--prove-can-fail`: it edits a comment and
 * claims a detector. Nothing can catch it, so the gate MUST report failure —
 * which is the only way to know the gate is capable of reporting failure at all.
 */
const INERT_LIE: Injection = {
  ...NEGATIVE_CONTROL,
  id: "control.inert-lie",
  title: "inert edit falsely catalogued as detected (the gate's own can-fail proof)",
  smallestDetected: "comment",
  detector: {
    file: "engine/test/oracle/movement.oracle.test.ts",
    test: "a test that cannot fail on a comment",
  },
};

process.exitCode = main();
