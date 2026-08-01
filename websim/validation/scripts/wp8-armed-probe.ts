/**
 * wp8-armed-probe.ts — how far does an ER/SE-configured run get once the
 * residents are actually armed?
 *
 * This probe was written against an engine in which `Simulation`'s constructor
 * built `Resident`s and never called `armResident`, so `decisionConfig` and
 * `decision` stayed `null`, every Phase-E branch in `stepResident` was
 * unreachable, and a full-engine run of the archived ER / SE / SE2
 * configurations quietly executed the WP7 legacy path. Its question was *is that
 * the only thing missing?*, and it answered it by arming the residents through
 * the `HeadlessOptions.beforeRun` harness seam and running a short window.
 *
 * `Simulation` performs step 11 itself now, so the arming below is no longer
 * what makes the layer live — a plain run of the same config is already armed.
 * The probe is still the cheapest way to ask the *next* version of its question:
 * take an archived ER/SE configuration, run a short window, and report which
 * engine surface it reaches or fails on before committing to a 312 h replay.
 *
 * It is a **diagnostic**, not a result. The numbers it produces come from glue
 * this file writes, so they are never compared to the archive and never
 * reported as a reproduction. The only thing it reports is *which* engine
 * surface the armed path reaches or fails on, and that answer is a property of
 * `engine/src/`, not of the glue.
 *
 * ```
 * npx tsx validation/scripts/wp8-armed-probe.ts            # 24 h, ER-A config
 * npx tsx validation/scripts/wp8-armed-probe.ts --hours 48 --regime 0
 * ```
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PARAM_NAMES, parseRunConfig } from "@websim/shared";
// Relative, not `@websim/engine/decision`: `engine/package.json` still declares
// no `./decision` subpath export, so the layer's own API is not reachable from
// outside the engine package. That no longer says anything about whether the
// layer *runs* — `Simulation` arms it from inside — but it is still why every
// caller here reaches it by path. `r3-own-engine.ts` does the same.
import { armResident } from "../../engine/src/decision/arm.js";
import { decisionConfig, petPolicyAdmitDefaultFrom } from "../../engine/src/decision/config.js";

import { runHeadless, headlessAssetsPresent } from "../src/headless.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function main(): void {
  const argv = process.argv.slice(2);
  let hours = 24;
  let regimeOverride: number | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--hours") hours = Number(argv[++i]);
    else if (argv[i] === "--regime") regimeOverride = Number(argv[++i]);
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  if (!headlessAssetsPresent()) {
    console.error("SKIP: packed graph assets absent");
    process.exit(2);
  }

  const params = (
    JSON.parse(
      readFileSync(
        path.join(REPO_ROOT, "docs", "runs", "phase-e", "ER-A-n6842-seed42", "simulation.json"),
        "utf8",
      ),
    ) as { reproducibility: { parameters: Record<string, number> } }
  ).reproducibility.parameters;

  const raw: Record<string, number> = {
    smokeSeriesCode: 0,
    smokeScale: 1.0,
    closuresCode: 0,
    pStuck: 0.3,
    stuckDelayH: 3.0,
    pushThetaThreshold: -0.25,
    kPush: 1.0,
    closureDraw: 1,
    ...params,
    simulationHours: hours,
  };
  if (regimeOverride !== null) raw["informationRegime"] = regimeOverride;
  const config = parseRunConfig(raw, "ER-A executed manifest (probe)");

  const cfg = decisionConfig({
    informationRegime: config.informationRegime,
    enableHazardDeparture: config.enableHazardDeparture,
    alphaHazard: config.alphaHazard,
    bRisk: config.bRisk,
    wOfficial: config.wOfficial,
    gammaVuln: config.gammaVuln,
    sigmaTheta: config.sigmaTheta,
    riskHalfLifeH: config.riskHalfLifeH,
    lambdaOutreachPerDay: config.lambdaOutreachPerDay,
    barrierBelongings: config.barrierBelongings,
    barrierPet: config.barrierPet,
    barrierDependents: config.barrierDependents,
    petPolicyAdmitDefault: petPolicyAdmitDefaultFrom(config.petPolicyDefault),
    betaTravelTime: config.betaTravelTime,
    betaCapacityPrior: config.betaCapacityPrior,
    pushThetaThreshold: config.pushThetaThreshold,
    kPush: config.kPush,
    pStuck: config.pStuck,
    stuckDelayH: config.stuckDelayH,
  });

  console.log(
    `[probe] ER-A executed config, informationRegime=${config.informationRegime}, ` +
      `enableHazardDeparture=${config.enableHazardDeparture}, ${hours} h, arming via beforeRun`,
  );

  let armed = 0;
  try {
    const result = runHeadless({
      config,
      paramNames: PARAM_NAMES,
      beforeRun: (sim, world) => {
        for (let i = 0; i < sim.residents.length; i++) {
          const da = world.residents[i]!.decision;
          if (da === null) continue;
          armResident(sim.residents[i]!, cfg, da);
          armed++;
        }
      },
    });
    const census = new Map<string, number>();
    for (const a of result.sim.residents) census.set(a.state, (census.get(a.state) ?? 0) + 1);
    console.log(`[probe] armed ${armed} residents; run COMPLETED`);
    console.log(`[probe] state census ${JSON.stringify(Object.fromEntries([...census].sort()))}`);
  } catch (err) {
    console.log(`[probe] armed ${armed} residents; run THREW`);
    console.log(`[probe] ${(err as Error).message}`);
    process.exitCode = 1;
  }
}

main();
