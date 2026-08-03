/**
 * build-decision-hz-slice.mjs — re-cut `decision-hz-slice.tsv` from the full
 * WP8 decision-trace oracle.
 *
 * WHY THIS SLICE EXISTS. The mutation sweep measured that a
 * decision-layer coefficient drift — `effectiveBRisk` scaled by 1.01, by
 * 1.0001, by 1 + 1e-9, or by a single ULP — was caught by EXACTLY ONE test
 * file, `engine/test/decision/oracle.trace.test.ts`, and that file is gated on
 * `pipeline/out/decision-fixtures/` (477 MB, git-ignored, produced by hours of
 * headless Repast). On a clean clone, and therefore in the hosted CI job, a
 * 1 % drift in the hazard coefficient was detected by NOTHING. That is the WP8
 * failure mode exactly: a layer that is bit-verified where the data lives and
 * unguarded everywhere else.
 *
 * The remedy is the one `engine/test/fixtures/graph-slice/` already established
 * for the graph: commit a small, stratified, provenance-stamped slice of the
 * certified dump so the clean clone can check the same bits. Every number in
 * the slice was written by `websim.exporter.decision.DecisionTrace` out of the
 * certified `geography.agents.GisAgent.step()`; nothing here is re-derived.
 *
 * SELECTION (deterministic, no RNG): every 7th `hz` row of the dump, capped at
 * 40 rows per `(config, open, vulnerable)` stratum. All 16 strata are present.
 *
 * Usage (only on a runner that holds the dump):
 *   node validation/test/mutation/fixtures/build-decision-hz-slice.mjs
 *   node validation/test/mutation/fixtures/build-decision-hz-slice.mjs --check
 *
 * `--check` re-cuts and compares, exiting non-zero on any drift, so the slice
 * cannot silently stop representing the dump it claims to come from.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEBSIM_ROOT = path.resolve(HERE, "../../../..");
const SOURCE = path.join(WEBSIM_ROOT, "pipeline", "out", "decision-fixtures", "hour.tsv");
const TARGET = path.join(HERE, "decision-hz-slice.tsv");

const STRIDE = 7;
const PER_STRATUM = 40;

function build() {
  const raw = readFileSync(SOURCE);
  const sha = createHash("sha256").update(raw).digest("hex");
  const rows = [];
  const strata = new Map();
  let hzSeen = 0;
  for (const line of raw.toString("utf8").split("\n")) {
    if (line.length === 0 || line.startsWith("#")) continue;
    const c = line.split("\t");
    if (c[3] !== "hz") continue;
    hzSeen++;
    const key = `${c[0]}|${c[6]}|${c[7]}`;
    const seen = strata.get(key) ?? 0;
    if (seen < PER_STRATUM && hzSeen % STRIDE === 0) {
      strata.set(key, seen + 1);
      rows.push(c.join("\t"));
    }
  }
  const header = [
    "# decision-hz-slice.tsv — a COMMITTED slice of the WP8 decision-trace oracle.",
    "# Cut from pipeline/out/decision-fixtures/hour.tsv (kind = hz rows only) so that a CLEAN",
    "# CLONE can prove the hazard coefficients bit for bit. The full 477 MB dump is git-ignored,",
    "# which made a decision-layer coefficient drift undetectable on any runner without it —",
    "# the blind spot this file closes. See validation/test/mutation/catalogue.ts.",
    "# source: pipeline/out/decision-fixtures/hour.tsv",
    `# source_sha256: ${sha}`,
    `# source_hz_rows: ${hzSeen}   slice_rows: ${rows.length}   selection: every ${STRIDE}th hz row, capped at ${PER_STRATUM} per (config, open, vulnerable) stratum`,
    "# produced by: node validation/test/mutation/fixtures/build-decision-hz-slice.mjs",
    "# columns: config seed agent kind hour tick open vulnerable bRiskEff_hex zR_hex thetaScaled_hex barrierCost_hex u_hex p_hex",
    "# doubles are %016x of Double.doubleToRawLongBits, exactly as the certified exporter wrote them.",
  ].join("\n");
  return { text: `${header}\n${rows.join("\n")}\n`, rows: rows.length, strata: strata.size };
}

const check = process.argv.includes("--check");
const built = build();
if (check) {
  const current = readFileSync(TARGET, "utf8");
  if (current !== built.text) {
    process.stderr.write(
      "decision-hz-slice.tsv does NOT match a fresh cut of the dump. Re-run without --check.\n",
    );
    process.exit(1);
  }
  process.stdout.write(`slice matches the dump: ${built.rows} rows, ${built.strata} strata\n`);
} else {
  writeFileSync(TARGET, built.text, "utf8");
  process.stdout.write(`wrote ${TARGET}: ${built.rows} rows, ${built.strata} strata\n`);
}
