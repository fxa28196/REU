/**
 * SPIKE WP2-S1 (plan Q12) CLI — geodesic `Direct` parity: stock geographiclib-js vs
 * the certified GeographicLib-Java 1.49.
 *
 * Measurement core lives in `validation/src/geodesic-parity.ts`; this file is a thin
 * reporting shell. Fixtures come from
 *   websim/pipeline/java-exporter/build-and-dump.ps1
 *
 * This measures ALGORITHM + LIBM agreement on ONE engine. It deliberately does NOT
 * measure cross-browser stability (that is WP3's fdlibm module) — see
 * websim/docs/DR-S1-geodesic.md.
 *
 *   npx tsx validation/scripts/spike-s1-geodesic-parity.ts
 *   npx tsx validation/scripts/spike-s1-geodesic-parity.ts --roundtrip --json out.json
 *   npx tsx validation/scripts/spike-s1-geodesic-parity.ts --dir <alternate fixture dir>
 */

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  compareFixture,
  maxRoundTripClosureM,
  parseFixture,
  type ParityReport,
} from "../src/geodesic-parity.js";

const here = dirname(fileURLToPath(import.meta.url));

function flagValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

const dirArg = flagValue("--dir");
const fixtureDir = dirArg === undefined ? resolve(here, "../../pipeline/java-exporter/fixtures") : resolve(dirArg);

const MODES = ["uniform", "prodshape"] as const;
const reports: ParityReport[] = [];

for (const mode of MODES) {
  const path = resolve(fixtureDir, `geodesic-direct-${mode}.tsv`);
  const fixture = parseFixture(path);
  const report = compareFixture(mode, fixture);
  reports.push(report);

  console.log(`\n=== SPIKE S1 — mode="${mode}" (${report.n} tuples) ===`);
  for (const m of fixture.meta) console.log(`  fixture: ${m}`);
  console.log(`  js engine: node ${process.version}`);
  console.log(`  bit-exact lat2      : ${report.bitExactLat2} / ${report.n}`);
  console.log(`  bit-exact lon2      : ${report.bitExactLon2} / ${report.n}`);
  console.log(
    `  bit-exact lat2+lon2 : ${report.bitExactBoth} / ${report.n}  (${(report.bitExactFraction * 100).toFixed(4)}%)`,
  );
  console.log(`  bit-exact azi2      : ${report.bitExactAzi2} / ${report.n}`);
  console.log(`  max ULP lat2/lon2/azi2 : ${report.maxUlpLat2} / ${report.maxUlpLon2} / ${report.maxUlpAzi2}`);
  console.log(`  ULP histogram (max of lat2,lon2): ${JSON.stringify(report.ulpHistogramBoth)}`);
  console.log(
    `  position error m: max=${report.maxErrorM.toExponential(6)} mean=${report.meanErrorM.toExponential(6)}` +
      ` p50=${report.p50ErrorM.toExponential(6)} p99=${report.p99ErrorM.toExponential(6)}`,
  );
  console.log(`  worst ${report.worst.length} rows:`);
  for (const w of report.worst) {
    console.log(
      `    #${w.index} err=${w.errorM.toExponential(6)} m  s12=${w.s12.toFixed(3)} azi1=${w.azi1.toFixed(6)}` +
        ` lat2 java=${w.javaLat2Hex} js=${w.jsLat2Hex} (${w.ulpLat2} ulp)` +
        ` lon2 java=${w.javaLon2Hex} js=${w.jsLon2Hex} (${w.ulpLon2} ulp)`,
    );
  }
}

let roundTripM: number | undefined;
if (process.argv.includes("--roundtrip")) {
  roundTripM = maxRoundTripClosureM(parseFixture(resolve(fixtureDir, "geodesic-direct-prodshape.tsv")));
  console.log(`\n=== round-trip probe (prodshape) ===`);
  console.log(`  max |Inverse(p1, Direct(p1,azi,s)) - s| = ${roundTripM.toExponential(6)} m`);
}

const jsonPath = flagValue("--json");
if (jsonPath !== undefined) {
  const payload = {
    generatedBy: "validation/scripts/spike-s1-geodesic-parity.ts",
    node: process.version,
    fixtureDir,
    ...(roundTripM === undefined ? {} : { maxRoundTripClosureM: roundTripM }),
    reports,
  };
  writeFileSync(resolve(jsonPath), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`\nwrote ${resolve(jsonPath)}`);
}
