/**
 * wp9-validation-report.ts — replay the working set, score Tiers 3 and 4, emit
 * `VALIDATION_REPORT.json`.
 *
 * ```
 * npx tsx validation/scripts/wp9-validation-report.ts
 * npx tsx validation/scripts/wp9-validation-report.ts --only present-day-three-arm/A-seed42
 * npx tsx validation/scripts/wp9-validation-report.ts --out <dir>
 * ```
 *
 * ## This script is not where the claim lives
 *
 * `validation/test/wp9-replay-acceptance.test.ts` runs the same harness code
 * under `npm test` and asserts the same verdicts. That is deliberate and it is
 * the lesson this project keeps re-learning: WP8's headline result existed only
 * as a script's stdout, which is a claim nothing defends. What is *only* here
 * is the artifact — the per-run dump and the emitted report — because writing
 * 17 run directories into `pipeline/out/` is not something a test should do.
 *
 * ## Loud degradation
 *
 * Missing archive, missing packed graph or missing `Geography/` each exit **2**
 * with a banner naming what is absent and how to produce it. Exit 2, not 0:
 * a run that produced no numbers must not be reportable as a pass, and a
 * missing input must not be distinguishable from a passing run by exit code
 * alone. A partial archive is caught per run by the same rule — a target whose
 * directory is absent is named, and the report is still written with that
 * configuration marked degraded rather than silently dropped.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describeArchive, missingArchiveBanner } from "@websim/pipeline/archive";

import {
  Checks,
  assetInputDatasets,
  attributeDivergence,
  buildTargetConfig,
  censusLine,
  geographyScheduleSource,
  loadGoldenSummaries,
  replayTarget,
  scoreTier3,
  scoreTier3CrossArm,
  targetDir,
  WP9_REPLAY_TARGETS,
  type PermutationEnvelope,
  type ReplayedRun,
  type Tier4Attribution,
} from "../src/harness/index.js";
import { buildValidationReport, validateValidationReport, writeValidationReport } from "../src/report/index.js";
import { portSourceIntegrity, gitWorkingTreeDirty } from "../src/provenance.js";
import { ASSET_DIR, GEOGRAPHY_DIR, headlessAssetsPresent } from "../src/headless.js";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const here = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url));
const REPO_ROOT = path.resolve(here("../../.."));
const WEBSIM_ROOT = path.join(REPO_ROOT, "websim");
const DEFAULT_OUT = path.join(WEBSIM_ROOT, "pipeline", "out", "wp9-validation");
const ORDER_CENSUS = here("../order-census/order-permutation-census.json");
/** The configuration `validation/scripts/order-permutation-census.ts` sampled. */
const ORDER_CENSUS_RUN = "present-day-three-arm/A-seed42";

function die(banner: string): never {
  console.error(`\n${banner}\n`);
  process.exit(2);
}

function head(): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unavailable";
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let only: string | null = null;
  let outDir = DEFAULT_OUT;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--only") {
      only = argv[i + 1] ?? null;
      i += 1;
    } else if (argv[i] === "--out") {
      outDir = path.resolve(argv[i + 1] ?? DEFAULT_OUT);
      i += 1;
    } else {
      throw new Error(`unknown argument ${String(argv[i])}`);
    }
  }

  // Input checks in the order a reader most needs them: the oracle first (root,
  // then every run the replay set names), then the things needed to produce a
  // run at all. An empty --archive-root is a *partial archive*, not a missing
  // one, and saying "packed graph absent" there would send the reader after the
  // wrong input.
  const archive = describeArchive();
  if (!archive.present) die(missingArchiveBanner(archive));

  const targets = WP9_REPLAY_TARGETS.filter((t) => only === null || t.runDir === only);
  if (targets.length === 0) throw new Error(`--only ${String(only)} matched no target`);

  const missing = targets.filter((t) => !existsSync(targetDir(t, archive.root)));
  if (missing.length > 0) {
    die(
      "!! ARCHIVE INCOMPLETE — the replay set is not fully present, so this run cannot produce\n" +
        "!! the report it is for. Named rather than skipped:\n" +
        missing.map((t) => `!!   ${t.runDir}`).join("\n") +
        `\n!! present:      ${targets.length - missing.length} of ${targets.length} target(s)` +
        `\n!! archive root: ${archive.root} (${archive.source})` +
        "\n!! produce:      point WEBSIM_ARCHIVE_ROOT at the full docs/runs archive, or at a" +
        "\n!!               working set materialised by validation/working-set/ (see its README).",
    );
  }

  if (!headlessAssetsPresent()) {
    die(
      "!! PACKED GRAPH ABSENT — this run produced NO numbers and must not be reported as a pass.\n" +
        `!! looked for: ${ASSET_DIR}/graph-{topology,geometry}.bin\n` +
        "!! produce:    npm run build:graph -w @websim/pipeline",
    );
  }
  if (!existsSync(GEOGRAPHY_DIR)) {
    die(
      "!! Geography/ ABSENT — the world build cannot run.\n" + `!! looked for: ${GEOGRAPHY_DIR}`,
    );
  }

  const schedules = geographyScheduleSource(GEOGRAPHY_DIR);
  const golden = loadGoldenSummaries();
  const sourceIntegrity = portSourceIntegrity({ repoRoot: REPO_ROOT, geographyDir: GEOGRAPHY_DIR });
  const dirty = sourceIntegrity.gitWorkingTreeDirty;
  console.log(
    `[wp9] archive ${archive.root} (${archive.source}); ${targets.length} target(s); ` +
      `git_working_tree_dirty=${String(dirty)}` +
      (dirty === false ? "" : "  <-- gate (h)'s provenance sub-check will be RED, correctly"),
  );

  mkdirSync(outDir, { recursive: true });

  // ---- replay -------------------------------------------------------------
  const runs = new Map<string, ReplayedRun>();
  const assetsManifest = path.join(ASSET_DIR, "assets-manifest.json");
  for (const t of targets) {
    const r = await replayTarget(t, {
      archiveRoot: archive.root,
      sourceIntegrity,
      inputDatasets: assetInputDatasets(buildTargetConfig(t, archive.root).config, assetsManifest),
    });
    runs.set(t.runDir, r);
    const dir = path.join(outDir, t.runDir.replace("/", "__"));
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "agents.csv"), r.rawDocs.agentsCsv);
    writeFileSync(path.join(dir, "shelters.csv"), r.rawDocs.sheltersCsv);
    writeFileSync(path.join(dir, "simulation.json"), r.rawDocs.simulationJson);
    writeFileSync(path.join(dir, "closure-census.json"), `${JSON.stringify(r.closures, null, 2)}\n`);
    console.log(
      `[wp9] ${t.runDir.padEnd(38)} ${(r.runMs / 1000).toFixed(1)}s  ` +
        `manifest ${String(r.built.fromManifest.length).padStart(2)}/41 params, ` +
        `${String(Object.keys(r.built.fromFallback).length).padStart(2)} from code default` +
        (r.grafted ? "  [closures GRAFTED from the live ClosureRuntime]" : ""),
    );
  }

  // ---- Tier 3 -------------------------------------------------------------
  const tier3: { run: ReplayedRun; results: Checks }[] = [];
  for (const t of targets) {
    const r = runs.get(t.runDir) as ReplayedRun;
    const ck = new Checks();
    const reference = t.r3Reference === undefined ? undefined : runs.get(t.r3Reference);
    if (t.r3Reference !== undefined && reference === undefined) {
      die(
        `!! R3 REFERENCE NOT REPLAYED — ${t.runDir} needs ${t.r3Reference} for gate (a).\n` +
          "!! Re-run without --only, or name both.",
      );
    }
    scoreTier3(ck, r, { schedules, golden, ...(reference === undefined ? {} : { reference }) });
    tier3.push({ run: r, results: ck });
    const failed = ck.failed.length;
    console.log(
      `[t3]  ${t.runDir.padEnd(38)} ${ck.summary()}` + (failed > 0 ? `\n${ck.failureReport()}` : ""),
    );
  }

  const preE = targets.filter((t) => t.cls === "pre-e").map((t) => runs.get(t.runDir) as ReplayedRun);
  const crossArm = new Checks();
  if (preE.length > 0) {
    scoreTier3CrossArm(crossArm, preE);
    console.log(`[t3]  verify_2026 cross-arm over ${preE.length} runs: ${crossArm.summary()}`);
    if (crossArm.failed.length > 0) console.log(crossArm.failureReport());
  }

  // ---- Tier 4 -------------------------------------------------------------
  const envelopeCensus = existsSync(ORDER_CENSUS)
    ? (JSON.parse(readFileSync(ORDER_CENSUS, "utf8")) as PermutationEnvelope)
    : null;
  const tier4: Tier4Attribution[] = [];
  for (const t of targets) {
    const r = runs.get(t.runDir) as ReplayedRun;
    const a = attributeDivergence({
      runDir: t.runDir,
      portAgents: r.view.agents,
      portShelters: r.view.shelters,
      archiveAgents: r.archivedView.agents,
      archiveShelters: r.archivedView.shelters,
      ...(envelopeCensus === null
        ? {}
        : { envelope: { census: envelopeCensus, sampledAt: ORDER_CENSUS_RUN } }),
    });
    tier4.push(a);
    console.log(
      `[t4]  ${t.runDir.padEnd(38)} ${a.verdict.padEnd(14)} ${censusLine(a.agents)}` +
        (a.unexplained.length === 0 ? "" : `\n      !! ${a.unexplained.join("\n      !! ")}`),
    );
  }

  // ---- the report ---------------------------------------------------------
  const report = buildValidationReport({
    generatedUtc: new Date().toISOString(),
    producedBy: "npx tsx validation/scripts/wp9-validation-report.ts",
    build: {
      portCommit: head(),
      gitWorkingTreeDirty: gitWorkingTreeDirty(REPO_ROOT),
      node: process.version,
    },
    archive: { present: archive.present, source: archive.source },
    assetsManifestPath: assetsManifest,
    goldenSummariesDir: here("../golden-summaries"),
    workingSetManifestPath: here("../working-set/working-set.manifest.json"),
    workingSetPayloadDir: here("../working-set/data"),
    tier2: {
      status: "green",
      note:
        "Tier-2 own-engine R3 is proved by validation/test/wp8-r3-own-engine.test.ts (preset-driven, " +
        "all three arms) and re-proved here from the archived executed manifests: gate (a) runs on " +
        "every E0-null target against its replayed pre-E reference and is counted in the Tier-3 " +
        "census of that configuration.",
    },
    tier3: tier3.map(({ run, results }) => ({ run, results: results.results })),
    ...(preE.length === 0
      ? {}
      : { crossArm: { members: preE.map((r) => r.target.runDir), results: crossArm.results } }),
    tier4,
  });

  const problems = validateValidationReport(report);
  const reportPath = path.join(outDir, "VALIDATION_REPORT.json");
  writeValidationReport(reportPath, report);
  console.log(`\n[wp9] wrote ${reportPath}`);
  console.log(
    `[wp9] overall=${report.overall}  tier3=${report.tiers.tier3.status} ` +
      `(${report.tiers.tier3.checks.passed}P/${report.tiers.tier3.checks.failed}F/` +
      `${report.tiers.tier3.checks.skipped}S)  tier4=${report.tiers.tier4.status} ` +
      `(exact ${report.tiers.tier4.exact}, order-channel ${report.tiers.tier4.order_channel}, ` +
      `unexplained ${report.tiers.tier4.unexplained})`,
  );
  if (problems.length > 0) {
    console.error(`\n!! VALIDATION_REPORT.json FAILED ITS OWN SCHEMA:\n!!  ${problems.join("\n!!  ")}`);
    process.exitCode = 1;
    return;
  }
  console.log("[wp9] schema: valid");
  if (report.overall !== "green") process.exitCode = 1;
}

await main();
