/**
 * blind-spots.test.ts — the two assertions the WP9 mutation sweep proved were
 * missing, and the executable evidence that neither is redundant.
 *
 * Neither of these is a tidy-up. Each was written against a specific injected
 * defect that the existing suite passed, and each is asserted in the only form
 * that can catch that defect. The injections are named so a future reader can
 * re-run them rather than trust this file:
 *
 *     npx tsx validation/test/mutation/run-mutation-gate.ts --measure \
 *       --only exposure.walking-ventilation --rung 1ulp --scope full
 *     npx tsx validation/test/mutation/run-mutation-gate.ts --measure \
 *       --only decision.brisk-coefficient --scope full
 *
 * ## Blind spot 1 — a 1-ULP error in the walking ventilation rate
 *
 * `INHALATION_WALKING_M3H = 1.62` reaches the outputs through exactly two
 * accumulators, `airVolumeBreathedM3 += v * dtHours` and
 * `inhaledDoseUg += c * v * dtHours`. The FIX-A movement oracle compares both of
 * those bit for bit against the certified `GisAgent.step()`, which is why the
 * 0.012 % error that once passed the whole suite is caught today — and it is
 * still not enough, because **the accumulator absorbs a one-ULP perturbation of
 * the constant**. That is not a guess; the arithmetic is executed below. Over
 * the oracle's own 5,760-tick window the two running sums come out
 * bit-identical, so no test built on those columns can ever separate 1.62 from
 * its successor double. The only assertion that can is one on the constant.
 *
 * ## Blind spot 2 — a decision-layer coefficient drift on a clean clone
 *
 * The sweep found that `effectiveBRisk` scaled by 1.01, 1.0001, 1 + 1e-9 or a
 * single ULP was caught by exactly ONE file,
 * `engine/test/decision/oracle.trace.test.ts`, and that file is gated on
 * `pipeline/out/decision-fixtures/` — 477 MB, git-ignored, produced by hours of
 * headless Repast. On a clean clone, and therefore in the hosted CI job, a 1 %
 * drift in the hazard coefficient was detected by **nothing**. That is WP8's
 * failure shape exactly: a layer bit-verified where the data lives and unguarded
 * everywhere else.
 *
 * The fix follows the precedent `engine/test/fixtures/graph-slice/` already set:
 * commit a small, stratified, provenance-stamped slice of the certified dump and
 * check the same bits against it. Every number in
 * `fixtures/decision-hz-slice.tsv` was written by
 * `websim.exporter.decision.DecisionTrace` out of the certified
 * `geography.agents.GisAgent.step()`. The port's `DecisionConfig` is NOT read
 * from the slice — it comes from `engine/test/decision/configs.ts`, which
 * declares the trace configurations from the specification, so a mis-resolved
 * coefficient cannot be handed the right answer.
 *
 * `bRiskEff` and `u` are pure IEEE arithmetic and are asserted BIT FOR BIT over
 * all 424 rows. `p` is not, and is not claimed to be: it goes through `exp`, and
 * DR-S1 §5.4 fixed the target there as JS === JS across engines rather than
 * JS === HotSpot's intrinsic. It is held to the same 4-ULP cap
 * `engine/test/decision/oracle.trace.test.ts` uses, plus the measured worst case
 * (2 ULP over 38 of the 424 rows) so the budget cannot absorb a real regression.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  INHALATION_RESTING_M3H,
  INHALATION_WALKING_M3H,
  ventilationM3h,
} from "../../../engine/src/agents/stateMachine.js";
import {
  effectiveBRisk,
  hazardLogOdds,
  logistic,
} from "../../../engine/src/decision/hazard.js";
import { TRACE_CONFIGS } from "../../../engine/test/decision/configs.js";

/** `Double.doubleToRawLongBits` as an unsigned 64-bit integer. */
function rawBits(x: number): bigint {
  const b = new DataView(new ArrayBuffer(8));
  b.setFloat64(0, x);
  return b.getBigUint64(0);
}

/** `%016x` of `Double.doubleToRawLongBits`, the encoding every dump uses. */
function bits(x: number): string {
  return rawBits(x).toString(16).padStart(16, "0");
}

function fromBits(hex: string): number {
  const b = new DataView(new ArrayBuffer(8));
  b.setBigUint64(0, BigInt(`0x${hex}`));
  return b.getFloat64(0);
}

// ===========================================================================
// Blind spot 1 — the ventilation constants, pinned by their bits
// ===========================================================================

describe("walking ventilation: the constant itself, because no accumulator can", () => {
  it("INHALATION_WALKING_M3H is the double nearest 1.62, bit for bit", () => {
    // `GisAgent.INHALATION_WALKING_M3H = 1.62` (EPA EFH 2011 ch. 6, moderate
    // activity). The injection this catches and nothing else does:
    //   engine/src/agents/stateMachine.ts   1.62 -> 1.6200000000000003
    expect(bits(INHALATION_WALKING_M3H)).toBe("3ff9eb851eb851ec");
    expect(INHALATION_WALKING_M3H).toBe(1.62);
  });

  it("INHALATION_RESTING_M3H is the double nearest 0.61, bit for bit", () => {
    // The same exposure block's other branch, and the 0.61 in the Tier-3
    // `dose == exposure x 0.61` identity.
    expect(bits(INHALATION_RESTING_M3H)).toBe("3fe3851eb851eb85");
    expect(INHALATION_RESTING_M3H).toBe(0.61);
  });

  it("the switch returns those exact doubles for all four state/stuck cases", () => {
    expect(bits(ventilationM3h("EN_ROUTE", false))).toBe("3ff9eb851eb851ec");
    // A stuck pusher is EN_ROUTE but waiting, so it breathes at the RESTING rate.
    expect(bits(ventilationM3h("EN_ROUTE", true))).toBe("3fe3851eb851eb85");
    expect(bits(ventilationM3h("PRE_EVAC", false))).toBe("3fe3851eb851eb85");
    expect(bits(ventilationM3h("UNREACHABLE", false))).toBe("3fe3851eb851eb85");
  });

  it("PROVES the assertions above are not redundant: the accumulator absorbs 1 ULP", () => {
    // The exact arithmetic of `airVolumeBreathedM3 += v * dtHours` at the FIX-A
    // movement oracle's own settings: minutes_per_tick = 1.0, end_tick = 5,760.
    const dtHours = 1.0 / 60;
    const nextUp = fromBits("3ff9eb851eb851ed");
    expect(nextUp).not.toBe(INHALATION_WALKING_M3H);

    // One tick apart: the per-tick increment DOES differ, so a naive reading
    // says "any bit-exact oracle will catch this".
    expect(bits(INHALATION_WALKING_M3H * dtHours)).not.toBe(bits(nextUp * dtHours));

    // 5,760 ticks apart: it does not. The running sums are bit-identical,
    // because the accumulated discrepancy stays below half an ULP of the total.
    let good = 0;
    let bad = 0;
    for (let tick = 0; tick < 5760; tick++) {
      good += INHALATION_WALKING_M3H * dtHours;
      bad += nextUp * dtHours;
    }
    expect(bits(good)).toBe(bits(bad));
  });
});

// ===========================================================================
// Blind spot 2 — the hazard coefficients, from a committed oracle slice
// ===========================================================================

interface HzRow {
  readonly config: string;
  readonly agent: number;
  readonly hour: number;
  readonly open: boolean;
  readonly vulnerable: boolean;
  readonly bRiskEff: string;
  readonly zR: number;
  readonly thetaScaled: number;
  readonly barrierCost: number;
  readonly u: string;
  readonly p: string;
}

const SLICE = fileURLToPath(new URL("./fixtures/decision-hz-slice.tsv", import.meta.url));

function loadSlice(): readonly HzRow[] {
  const text = readFileSync(SLICE, "utf8");
  if (text.includes("\r")) {
    // `websim/.gitattributes` sets `* -text` precisely so this cannot happen.
    // Named explicitly because the alternative symptom is a bit mismatch on the
    // last column only, which reads as "the port is wrong" rather than "git
    // rewrote the fixture on checkout".
    throw new Error(
      "decision-hz-slice.tsv contains CR: git rewrote the fixture's line endings. " +
        "websim/.gitattributes must keep `* -text` for every byte-fidelity fixture.",
    );
  }
  const rows: HzRow[] = [];
  for (const line of text.split("\n")) {
    if (line.length === 0 || line.startsWith("#")) continue;
    const c = line.split("\t");
    if (c.length !== 14 || c[3] !== "hz") {
      throw new Error(`decision-hz-slice.tsv: malformed row (${c.length} cols): ${line}`);
    }
    rows.push({
      config: c[0] as string,
      agent: Number(c[2]),
      hour: Number(c[4]),
      open: c[6] === "1",
      vulnerable: c[7] === "1",
      bRiskEff: c[8] as string,
      zR: fromBits(c[9] as string),
      thetaScaled: fromBits(c[10] as string),
      barrierCost: fromBits(c[11] as string),
      u: c[12] as string,
      p: c[13] as string,
    });
  }
  return rows;
}

const slice = loadSlice();

function configFor(id: string): (typeof TRACE_CONFIGS)[number]["config"] {
  const t = TRACE_CONFIGS.find((c) => c.id === id);
  if (t === undefined) {
    throw new Error(`the slice names config '${id}', which TRACE_CONFIGS does not carry`);
  }
  return t.config;
}

describe("decision-layer hazard coefficients vs a committed slice of the Java oracle", () => {
  it("the slice is non-vacuous: every stratum, and enough spread to bind", () => {
    expect(slice.length).toBeGreaterThanOrEqual(400);
    // 4 configs x open x vulnerable. A slice that lost a stratum would silently
    // stop exercising gammaVuln or the wOfficial term.
    const strata = new Set(slice.map((r) => `${r.config}|${r.open}|${r.vulnerable}`));
    expect(strata.size).toBe(16);
    // Two distinct bRiskEff values means `gammaVuln` actually participates; one
    // would mean every row happened to be the non-vulnerable branch.
    expect(new Set(slice.map((r) => r.bRiskEff)).size).toBeGreaterThanOrEqual(2);
    expect(new Set(slice.map((r) => bits(r.zR))).size).toBeGreaterThanOrEqual(20);
    expect(new Set(slice.map((r) => bits(r.thetaScaled))).size).toBeGreaterThanOrEqual(100);
    expect(new Set(slice.map((r) => bits(r.barrierCost))).size).toBeGreaterThanOrEqual(2);
    // Both branches of `open ? 1.0 : 0.0` are present.
    expect(new Set(slice.map((r) => r.open)).size).toBe(2);
  });

  it("effectiveBRisk reproduces every row's bRiskEff bit for bit", () => {
    // The injection this catches ON A CLEAN CLONE, which nothing else did:
    //   engine/src/decision/hazard.ts   bRisk * (...) -> bRisk * 1.01 * (...)
    // and the same at 1.0001, at 1 + 1e-9, and at one ULP.
    let checked = 0;
    for (const row of slice) {
      expect(
        bits(effectiveBRisk(configFor(row.config), row.vulnerable)),
        `${row.config} agent ${row.agent} hour ${row.hour} vulnerable=${row.vulnerable}`,
      ).toBe(row.bRiskEff);
      checked++;
    }
    expect(checked).toBe(slice.length);
  });

  it("hazardLogOdds reproduces every row's u BIT FOR BIT", () => {
    // Pure IEEE arithmetic, so bit-exact is the right bar: this pins
    // alphaHazard, wOfficial, the left-to-right association of the sum and the
    // barrier subtraction. `u` is also where a coefficient drift lands after
    // `bRiskEff * zR`, which is why the assertion above and this one are both
    // needed: a drift that happened to leave bRiskEff alone would still move u.
    for (const row of slice) {
      const u = hazardLogOdds(
        configFor(row.config),
        fromBits(row.bRiskEff),
        row.zR,
        row.open,
        row.thetaScaled,
        row.barrierCost,
      );
      expect(bits(u), `${row.config} agent ${row.agent} hour ${row.hour} u`).toBe(row.u);
    }
  });

  it("the logistic reproduces every row's p inside the documented exp frontier", () => {
    // NOT bit-exact, and deliberately not claimed to be. `GisAgent` calls
    // HotSpot's intrinsic `Math.exp`; `mathx` is fdlibm/`StrictMath`, and DR-S1
    // §5.4 fixed the target as JS === JS across engines rather than JS === the
    // archived intrinsic. `engine/test/decision/oracle.trace.test.ts` caps the
    // same frontier at 4 ULP; this file uses the same cap for the same reason,
    // and additionally pins the MEASURED worst case so a real regression in
    // `fdlibmExp` cannot hide inside the budget.
    const MAX_TRANSCENDENTAL_ULP = 4n;
    let worst = 0n;
    let differing = 0;
    for (const row of slice) {
      const u = hazardLogOdds(
        configFor(row.config),
        fromBits(row.bRiskEff),
        row.zR,
        row.open,
        row.thetaScaled,
        row.barrierCost,
      );
      const mine = rawBits(logistic(u));
      const java = rawBits(fromBits(row.p));
      const d = mine > java ? mine - java : java - mine;
      if (d > 0n) differing++;
      if (d > worst) worst = d;
      expect(d, `${row.config} agent ${row.agent} hour ${row.hour} p`).toBeLessThanOrEqual(
        MAX_TRANSCENDENTAL_ULP,
      );
    }
    // Measured over this slice on 2026-08-02: 38 of 424 rows differ, worst 2 ULP.
    expect(worst).toBeLessThanOrEqual(2n);
    process.stdout.write(
      `[blind-spot] hazard p vs Java Math.exp: ${differing}/${slice.length} rows differ, ` +
        `worst ${worst} ULP (cap ${MAX_TRANSCENDENTAL_ULP})\n`,
    );
  });
});
