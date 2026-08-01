/**
 * WP8 flagship acceptance CLI — Tier-2 **own-engine R3 byte-identity**.
 *
 * ```
 * npx tsx validation/scripts/run-r3-own-engine.ts
 * npx tsx validation/scripts/run-r3-own-engine.ts --arms A --agents 2037
 * npx tsx validation/scripts/run-r3-own-engine.ts --write pipeline/out/r3-own-engine
 * ```
 *
 * Runs, at seed 42 and 312 h unless overridden:
 *
 *  1. **shipped** — E0-degenerate config vs no-layer config, arms A/B/C, exactly
 *     as `Simulation` executes them: its constructor performs `ContextCreator`
 *     step 11, so the decision layer is live on this path;
 *  2. **armed** — the same pair with the residents additionally put through the
 *     engine's own `armResident` before tick 1 by the caller. This used to be
 *     the only path with a live layer; it is now an explicit, countable arming
 *     of an already-armed run, kept so the CLI reports an arming census it
 *     performed rather than one it assumed (see `harness/r3-own-engine.ts`, "the
 *     arming seam"). Expect the two to agree;
 *  3. **closures-inert** — E0-degenerate with `closuresCode = 3` and a schedule
 *     whose every activation hour lands past the run end, vs the identical
 *     config with `closuresCode = 0`.
 *
 * Every pair is put through the ported `verify_E_runs` (a) comparator
 * (`harness/r3-identity.ts`, untouched) under three reference projections, and
 * the exact row/column counts and both SHA-256s are printed for each. Exit code
 * is 1 if any *required* verdict misses.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  Checks,
  R3_ARMS,
  R3_OUT_DIR,
  buildInertClosureSchedule,
  checkR3,
  overlayDataSource,
  projectReference,
  r3NegativeControlConfig,
  runOwnEngineR3Pair,
  runR3Configuration,
  unexpectedPresetDelta,
  type CheckResult,
  type OwnEngineR3Pair,
  type R3Arm,
  type R3Projection,
} from "../src/harness/index.js";
import { headlessAssetsPresent } from "../src/headless.js";

interface Args {
  readonly arms: readonly R3Arm[];
  readonly agents: number | undefined;
  readonly hours: number | undefined;
  readonly seed: number | undefined;
  readonly write: string | null;
}

function parseArgs(argv: readonly string[]): Args {
  let arms: readonly R3Arm[] = R3_ARMS;
  let agents: number | undefined;
  let hours: number | undefined;
  let seed: number | undefined;
  let write: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const next = (): string => {
      const v = argv[i + 1];
      if (v === undefined) throw new Error(`${a} needs a value`);
      i++;
      return v;
    };
    if (a === "--arms") arms = next().split(",") as R3Arm[];
    else if (a === "--agents") agents = Number(next());
    else if (a === "--hours") hours = Number(next());
    else if (a === "--seed") seed = Number(next());
    else if (a === "--write") write = next();
    else throw new Error(`unknown argument ${a}`);
  }
  return { arms, agents, hours, seed, write };
}

/**
 * `pass` — must be clean. `fail` — must NOT be clean (the negative control).
 * `diagnostic` — reported, never gating.
 */
type Expectation = "pass" | "fail" | "diagnostic";

interface Verdict {
  readonly scenario: string;
  readonly arm: R3Arm;
  readonly projection: R3Projection;
  readonly expectation: Expectation;
  readonly checks: readonly CheckResult[];
  readonly ok: boolean;
}

const verdicts: Verdict[] = [];

function evaluate(
  scenario: string,
  pair: OwnEngineR3Pair,
  projection: R3Projection,
  expectation: Expectation,
  note = "",
): Verdict {
  const ck = new Checks();
  checkR3(ck, pair.nullRun.view, projectReference(pair.refRun, projection));
  const v: Verdict = {
    scenario,
    arm: pair.arm,
    projection,
    expectation,
    checks: ck.results,
    ok: ck.failed.length === 0,
  };
  verdicts.push(v);
  console.log(
    `\n--- ${scenario}  arm ${pair.arm}  projection=${projection}  ` +
      `expect ${expectation.toUpperCase()}${note === "" ? "" : ` (${note})`} ---`,
  );
  for (const c of ck.results) {
    console.log(`  ${c.status.padEnd(4)} ${c.name}${c.detail === "" ? "" : `  --  ${c.detail}`}`);
    for (const line of c.lines) {
      console.log(`         ${line}`);
    }
  }
  return v;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (!headlessAssetsPresent()) {
    console.error(
      "SKIP: pipeline/out/assets/graph-{topology,geometry}.bin absent. This run produced NO " +
        "numbers and must not be reported as a pass.",
    );
    process.exit(2);
  }

  const cfg = {
    ...(args.agents === undefined ? {} : { numAgents: args.agents }),
    ...(args.hours === undefined ? {} : { simulationHours: args.hours }),
    ...(args.seed === undefined ? {} : { seed: args.seed }),
  };

  console.log("=== premise: the two presets of each arm differ only in enableDecisionLayer ===");
  for (const arm of args.arms) {
    const bad = unexpectedPresetDelta(arm);
    console.log(`  arm ${arm}: unexpected preset deltas = ${JSON.stringify(bad)}`);
    if (bad.length > 0) {
      throw new Error(`arm ${arm} presets differ in ${bad.join(", ")} — R3 would be meaningless`);
    }
  }

  const outDir = args.write === null ? null : path.resolve(args.write);
  const inert = buildInertClosureSchedule(outDir === null ? {} : { writeTo: outDir });
  console.log(
    `\n=== closures-inert schedule ===\n  source ${inert.sourcePath}\n` +
      `  source sha256 ${inert.sourceSha256}\n` +
      `  derived ${inert.derivedPath ?? "(in memory)"}\n` +
      `  derived sha256 ${inert.derivedSha256}\n` +
      `  ${inert.rows} rows; hours ${JSON.stringify(inert.sourceHours)} -> ` +
      `${JSON.stringify(inert.derivedHours)}`,
  );
  const inertData = overlayDataSource(inert.overlayPath, inert.derivedText);

  const written: { readonly label: string; readonly docs: unknown }[] = [];

  for (const arm of args.arms) {
    // 1. shipped path -------------------------------------------------------
    const shipped = runOwnEngineR3Pair({ arm, armDecisionLayer: false, ...cfg });
    console.log(
      `\n[shipped]  arm ${arm}  null census ${JSON.stringify(shipped.nullRun.census)}  ` +
        `armed residents in the E0-null run = ${shipped.armedResidents}`,
    );
    // Downgraded from a REQUIRED pass to a diagnostic when `Simulation` gained
    // its `ContextCreator` step-11 call site. It used to be clean because the
    // shipped path armed nobody and the six Phase-E columns were blank on both
    // sides — a vacuous pass. The shipped path now arms every resident, so those
    // six columns differ exactly as they do under `armed` below, and the strict
    // projection is a report rather than a verdict. The flagship verdicts are
    // the `armed` e-appended and archive-shaped passes.
    evaluate(
      "shipped",
      shipped,
      "strict",
      "diagnostic",
      "the 6 Phase-E columns MUST differ here too: Simulation arms the run itself",
    );

    // 2. armed --------------------------------------------------------------
    const armed = runOwnEngineR3Pair({ arm, armDecisionLayer: true, ...cfg });
    console.log(
      `\n[armed]    arm ${arm}  null census ${JSON.stringify(armed.nullRun.census)}  ` +
        `armed residents in the E0-null run = ${armed.armedResidents}`,
    );
    evaluate(
      "armed",
      armed,
      "strict",
      "diagnostic",
      "the 6 Phase-E columns MUST differ here — the layer-off writer emits them empty",
    );
    evaluate("armed", armed, "e-appended", "pass");
    evaluate("armed", armed, "archive-shaped", "pass");

    // 3. closures-inert -----------------------------------------------------
    // Both sides are the SAME armed E0-degenerate config; only closuresCode
    // moves, so the strict 57-column projection is the right one and it must be
    // clean.
    const closures = runOwnEngineR3Pair({
      arm,
      armDecisionLayer: true,
      referenceKind: "same-config",
      closuresCode: 3,
      referenceClosuresCode: 0,
      data: inertData,
      labelSuffix: "closures-inert",
      ...cfg,
    });
    console.log(
      `\n[closures] arm ${arm}  null census ${JSON.stringify(closures.nullRun.census)}  ` +
        `armed residents = ${closures.armedResidents}`,
    );
    console.log(`           null closure witness  ${JSON.stringify(closures.nullRun.closures)}`);
    console.log(`           ref  closure witness  ${JSON.stringify(closures.refRun.closures)}`);
    evaluate("closures-inert", closures, "strict", "pass");

    const produced = [shipped, armed, closures];

    // 4. negative control ---------------------------------------------------
    // Arming a NON-degenerate layer must break the identity. Without this the
    // `armed` pass could mean "armResident reaches nothing" rather than "the
    // degenerate layer changes nothing".
    //
    // The regime stays L0 so the control moves the layer's coefficients and
    // nothing else. `Simulation` declares `anyUntriedReachableShelter` now, so
    // regime 1 completes; it changes which predicate `stepResident` consults,
    // which is a different mechanism and is probed separately below.
    const control = runOwnEngineR3Pair({
      arm,
      armDecisionLayer: true,
      nullKind: "negative-control",
      informationRegime: 0,
      labelSuffix: "negctl",
      ...cfg,
    });
    console.log(
      `\n[negctl]   arm ${arm}  null census ${JSON.stringify(control.nullRun.census)}  ` +
        `armed residents = ${control.armedResidents}`,
    );
    evaluate(
      "negative-control",
      control,
      "archive-shaped",
      "fail",
      "the ER decision layer on the same geometry MUST move the outcome",
    );
    produced.push(control);

    // 5. the L1 regime, probed and reported ---------------------------------
    if (arm === "A") {
      let l1Error: string | null = null;
      try {
        runR3Configuration({
          config: r3NegativeControlConfig(arm, { ...cfg, informationRegime: 1 }),
          label: `TS-ERlayer-${arm}-L1probe`,
          armDecisionLayer: true,
        });
      } catch (err) {
        l1Error = err instanceof Error ? err.message : String(err);
      }
      console.log(
        `\n[L1 probe] informationRegime=1 => ${
          l1Error === null
            ? "COMPLETED (Simulation now declares anyUntriedReachableShelter)"
            : `THREW: ${l1Error.split("\n")[0]}`
        }`,
      );
    }

    for (const r of produced) {
      written.push({ label: r.nullRun.label, docs: r.nullRun.docs });
      written.push({ label: r.refRun.label, docs: r.refRun.docs });
    }
  }

  // --- dump the runs so the evidence is inspectable --------------------------
  //
  // Only on `--write`: `tools/check-scratch.ts` treats an unlisted child of
  // pipeline/out/ as a leftover that can flip an artifact gate's verdict, so
  // nothing lands on disk unless an operator asked for it.
  if (outDir === null) {
    console.log(
      `\n(no --write given; ${written.length} run directories were NOT dumped. ` +
        `Suggested target: ${R3_OUT_DIR})`,
    );
  } else {
    for (const { label, docs } of written) {
      const d = docs as { agentsCsv: string; sheltersCsv: string; simulationJson: string };
      const dir = path.join(outDir, label);
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, "agents.csv"), d.agentsCsv);
      writeFileSync(path.join(dir, "shelters.csv"), d.sheltersCsv);
      writeFileSync(path.join(dir, "simulation.json"), d.simulationJson);
    }
    console.log(`\nwrote ${written.length} run directories to ${outDir}`);
  }

  // --- summary ---------------------------------------------------------------
  console.log("\n=== SUMMARY ===");
  console.log("scenario          arm  projection        expect      got     checks(P/F/S)");
  for (const v of verdicts) {
    const pass = v.checks.filter((c) => c.status === "PASS").length;
    const fail = v.checks.filter((c) => c.status === "FAIL").length;
    const skip = v.checks.filter((c) => c.status === "SKIP").length;
    console.log(
      `${v.scenario.padEnd(17)} ${v.arm}    ${v.projection.padEnd(17)} ` +
        `${v.expectation.padEnd(11)} ${(v.ok ? "clean" : "differs").padEnd(7)} ` +
        `${pass}/${fail}/${skip}`,
    );
  }
  const missed = verdicts.filter(
    (v) =>
      (v.expectation === "pass" && !v.ok) || (v.expectation === "fail" && v.ok),
  );
  if (missed.length > 0) {
    console.error(
      `\n${missed.length} verdict(s) did not meet expectation: ` +
        missed.map((m) => `${m.scenario}/${m.arm}/${m.projection}`).join(", "),
    );
    process.exit(1);
  }
  console.log("\nevery verdict met its expectation");
}

main();
