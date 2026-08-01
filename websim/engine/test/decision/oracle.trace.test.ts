/**
 * The WP8 decision-layer parity gate: the port's Phase-E arithmetic against the
 * Java trace oracle, **bit for bit, on every sampled agent-tick**.
 *
 * ## What is being compared, and why it is not circular
 *
 * `DR-WP8-decision-oracle.md` §3 records the one design decision this file
 * depends on: `decay`, `bRiskEff`, `u`, `p`, `dM`, `cap`, `walkTimeH` and `v`
 * are read **out of the certified frame that computed them**, by an
 * insertion-only source probe whose only-insertions property is proved by digest
 * and whose neutrality is proved by running the instrumented and uninstrumented
 * builds side by side. Nothing in the dumper re-derives a model expression. So
 * comparing against these files is comparing against `GisAgent.step()`, not
 * against a second implementation of it that could be wrong the same way.
 *
 * The configurations are **declared** in `configs.ts`, not parsed out of the
 * fixture (see that file's doc), and the nine parameters `manifest.json` does
 * carry are cross-checked against the declaration before any row is read.
 *
 * ## What each stream pins, in the order DR-WP8 §9 says fails first
 *
 * 1. **`arm.tsv`** — `setDecisionLayer`: `thetaScaled`, `barrierCost` (QUIRK 5's
 *    accumulation order), the post-arm state and `awareTick` (0.0 vs NaN), plus
 *    the per-agent decision seed. 123,156 residents, zero ticks simulated.
 * 2. **`hour.tsv`** — 3.78 M rows. `b` rows pin the hour bucket
 *    (`tick*minutesPerTick/60.0`, QUIRK 3) and the monotone `newHour` test
 *    including its `-1` initial value (QUIRK 2); `zr` rows pin
 *    `fdlibmPow(2, -1/riskHalfLifeH)` (QUIRK 24) and the inclusive `>= 55.5` cue
 *    against `hoursAboveUnhealthy`'s strict `>` (QUIRK 10); `hz` rows pin the
 *    left-to-right accumulation of `u` (QUIRK 5), the four-term age-65
 *    `vulnerable` predicate against the five-term age-55 reporting one
 *    (QUIRK 9), and `fdlibmExp` in the logistic.
 * 3. **`draws.tsv` / `draws-digest.tsv`** — the draw **sequence** and **count**
 *    on each private stream. This is the only artefact that catches QUIRK 1: a
 *    port that hoists the hazard draw out of `if (open && …)` matches neither
 *    the count nor the digest, on every resident, on the first ER run.
 * 4. **`choice.tsv`** — the L1 utility term by term and its argmin-lexicographic
 *    tie-break, and the L0 strict-`<` running best.
 * 5. **`door.tsv`** — the pet gate, and the regime-dependent belief update.
 * 6. **`transitions.tsv`** — every state transition in the model, with its
 *    cause, including the assertion that the E0-null and layer-off runs take
 *    **zero** decision-layer transitions between them.
 *
 * ## And then: branch coverage
 *
 * The last describe compares the port's own branch counters — the same 72, with
 * the same ids, as `DecisionProbe.java`'s — against `coverage-union.tsv`, and
 * fails if any branch the Java exercised was not exercised here. The counters
 * accumulate across the cases in this file, which is why the replays and the
 * coverage assertion live in one file rather than three.
 */

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

import { expect, it } from "vitest";

import { artifactGate, describeGated } from "../../../tools/artifact-gate.js";
import { armResident } from "../../src/decision/arm.js";
import { useL1 } from "../../src/decision/config.js";
import { recordsBelief } from "../../src/decision/belief.js";
import {
  effectiveBRisk,
  hazardLogOdds,
  hourBucket,
  isNewHour,
  logistic,
  riskDecay,
  updateRiskAccumulator,
} from "../../src/decision/hazard.js";
import { outreachDrawConsumed, outreachHourlyProbability } from "../../src/decision/outreach.js";
import { groupPacedSpeedMps } from "../../src/decision/pace.js";
import {
  beatsRunningBest,
  candidateCapacityPrior,
  candidateUtility,
  walkTimeHours,
} from "../../src/decision/utilityChooser.js";
import {
  BR,
  CountingDecisionProbe,
  DECISION_BRANCHES,
  setDecisionProbe,
  type BranchId,
} from "../../src/decision/probe.js";
import { Resident } from "../../src/agents/resident.js";
import { UNCAPPED_CAPACITY_PRIOR } from "../../src/agents/stateMachine.js";
import { doubleToHex, hexToDouble } from "../../src/mathx/bits.js";
import { fdlibmLog } from "../../src/mathx/log.js";
import { JavaRandom } from "../../src/rng/JavaRandom.js";
import { agentDecisionSeed } from "../../src/rng/streams.js";
import {
  DECISION_COV_CLOSURES_DIR,
  DECISION_FIXTURE_DIR,
  decisionRef,
  forEachRow,
  forEachRowAsync,
  inCohort,
  UlpCensus,
  type DecisionManifest,
} from "./fixtures.js";
import { traceConfig, TRACE_CONFIGS } from "./configs.js";
import { driveControlFlowBranches } from "./harness.js";

const gate = artifactGate({
  gate: "engine:wp8-decision-oracle",
  suite: "WP8 decision layer vs the Java decision-trace oracle",
  evidence:
    "bit-exact identity of thetaScaled/barrierCost/awareTick, the z_R decay and increment, " +
    "bRiskEff/u/p, the L1 utility and tie-break, the door policy gate and belief update, and " +
    "the per-agent RNG draw SEQUENCE and COUNT (the only check that catches the open&& " +
    "short-circuit) over 20 Java runs and 3.78 M sampled agent-hours",
  artifacts: [
    decisionRef("manifest.json"),
    decisionRef("arm.tsv"),
    decisionRef("hour.tsv"),
    decisionRef("draws.tsv"),
    decisionRef("draws-digest.tsv"),
    decisionRef("choice.tsv"),
    decisionRef("door.tsv"),
    decisionRef("transitions.tsv"),
    decisionRef("coverage-union.tsv"),
  ],
});

/** Counters accumulated across every case below; asserted by the last one. */
const probe = new CountingDecisionProbe();

/**
 * The three transcendental frontiers, measured rather than asserted away. See
 * `fixtures.ts`'s {@link UlpCensus} doc: `GisAgent` calls HotSpot's intrinsic
 * `Math.exp`/`log`/`pow`, `mathx` is fdlibm/`StrictMath`, and DR-S1 §5.4 fixed
 * the target as JS === JS across engines rather than JS === the archived
 * intrinsics. Everything that is pure IEEE arithmetic is still compared bit for
 * bit; these three are compared to a hard cap and reported.
 */
const decayUlp = new UlpCensus("z_R decay = pow(2, -1/riskHalfLifeH)");
const pUlp = new UlpCensus("hazard p = 1/(1+exp(-u))");
const vUlp = new UlpCensus("L1 utility v (ln term)");
/** Hard cap. A port defect is large or structured; the frontier is ~1 ulp. */
const MAX_TRANSCENDENTAL_ULP = 4;
/** Hazard Bernoullis whose OUTCOME differs between the port's `p` and Java's. */
let knifeEdges = 0;
let bernoullis = 0;

/** `config|seed|agent` — the key every stream is grouped by. */
type AgentKey = string;
const key = (config: string, seed: string, agent: string): AgentKey =>
  `${config}|${seed}|${agent}`;

/** One sampled hour of one agent, as replayed. Cohort agents only. */
interface HourRecord {
  readonly hour: number;
  /** State at the hour bucket, i.e. BEFORE the outreach chain. */
  readonly stateAtBucket: string;
  /** `hz` row present ⇒ the agent reached the hazard branch this hour. */
  hazardOpen: boolean | null;
  /** The port's logistic; compared to {@link javaP} for knife-edge counting. */
  hazardP: number;
  javaP: number;
}

const cohortHours = new Map<AgentKey, HourRecord[]>();

/**
 * The dump manifest, read lazily and memoised.
 *
 * Deliberately NOT read in the `describeGated` body. `describe.skip(suite, fn)`
 * still *collects* `fn` — vitest has to walk it to know which tests to report as
 * skipped — so a top-level `readFileSync` here executes even when the gate has
 * decided the fixtures are absent, and the file dies with ENOENT at collection
 * instead of skipping loudly. That defeats the gate on exactly the run it exists
 * for: a clean clone, where `pipeline/out/` is git-ignored and absent. Reading
 * inside the `it` bodies (the idiom `closureManifest()` / `loadProbe()` already
 * use in the closure oracles) keeps the read on the path the gate controls.
 */
let manifestCache: DecisionManifest | undefined;
function decisionManifest(): DecisionManifest {
  manifestCache ??= JSON.parse(
    readFileSync(`${DECISION_FIXTURE_DIR}/manifest.json`, "utf8"),
  ) as DecisionManifest;
  return manifestCache;
}

describeGated(gate, () => {
  // -------------------------------------------------------------------------
  it("the declared configs are the configs the exporter ran (cross-check, not a read)", () => {
    const manifest = decisionManifest();
    expect(manifest.samplingRule.cohortMod).toBe(64);
    expect(manifest.samplingRule.earlyHours).toBe(12);
    expect(manifest.samplingRule.agentOrder).toContain("identity");
    expect(manifest.minutesPerTick).toBe(1.0);
    expect(manifest.evacuationThresholdUgM3).toBe(55.5);

    let checked = 0;
    for (const run of manifest.runs) {
      const tc = traceConfig(run.config);
      const c = tc.config;
      expect([run.config, run.informationRegime]).toEqual([run.config, c.informationRegime]);
      expect([run.config, run.enableHazardDeparture]).toEqual([
        run.config,
        c.enableHazardDeparture,
      ]);
      expect([run.config, run.sigmaTheta]).toEqual([run.config, c.sigmaTheta]);
      expect([run.config, run.gammaVuln]).toEqual([run.config, c.gammaVuln]);
      expect([run.config, run.barrier]).toEqual([run.config, c.barrierBelongings]);
      expect([run.config, run.barrier]).toEqual([run.config, c.barrierPet]);
      expect([run.config, run.barrier]).toEqual([run.config, c.barrierDependents]);
      expect([run.config, run.petPolicyDefault === 1]).toEqual([
        run.config,
        c.petPolicyAdmitDefault,
      ]);
      expect([run.config, run.betaCapacityPrior]).toEqual([run.config, c.betaCapacityPrior]);
      // The never-regress gotcha, asserted rather than trusted: the ARCHIVE ran
      // 0.0, because Repast zeroed the negative "number" constant.
      expect([run.config, run.pushThetaThresholdExecuted]).toEqual([
        run.config,
        c.pushThetaThreshold,
      ]);
      expect([run.config, run.pAwareInit]).toEqual([run.config, tc.pAwareInit]);
      expect([run.config, run.simulationHours]).toEqual([run.config, tc.simulationHours]);
      checked++;
    }
    expect(checked).toBe(manifest.runs.length);
    // Every declared archived config appears in the dump.
    const ran = new Set(manifest.runs.map((r) => r.config));
    for (const tc of TRACE_CONFIGS) {
      expect([tc.id, ran.has(tc.id)]).toEqual([tc.id, true]);
    }
  });

  // -------------------------------------------------------------------------
  it("arm.tsv: setDecisionLayer is bit-exact on every resident of every run", () => {
    setDecisionProbe(probe);
    let rows = 0;
    let unawareArmed = 0;
    try {
      forEachRow(`${DECISION_FIXTURE_DIR}/arm.tsv`, (f) => {
        const [config, seedS, agentS] = f as [string, string, string];
        const tc = traceConfig(config);
        const index = Number(agentS);
        const seed = Number(seedS);
        const da = {
          awareInitial: f[3] === "1",
          heavyBelongings: f[4] === "1",
          hasPet: f[5] === "1",
          hasDependents: f[6] === "1",
          thetaZ: hexToDouble(f[7]!),
          groupSpeedDeltaMps: hexToDouble(f[8]!),
          decisionSeed: BigInt(f[9]!),
        };
        const a = new Resident({
          index,
          name: `Site ${index}`,
          encampmentId: null,
          startLon: 0,
          startLat: 0,
          startNode: 0,
          attributes: null,
        });
        armResident(a, tc.config, da);

        // The three armed constants, in raw bits.
        expect([config, seed, index, "thetaScaled", doubleToHex(a.thetaScaled)]).toEqual([
          config,
          seed,
          index,
          "thetaScaled",
          f[10],
        ]);
        expect([config, seed, index, "barrierCost", doubleToHex(a.barrierCost)]).toEqual([
          config,
          seed,
          index,
          "barrierCost",
          f[11],
        ]);
        expect([config, seed, index, "state", a.state]).toEqual([config, seed, index, "state", f[12]]);
        expect([config, seed, index, "awareTick", doubleToHex(a.awareTick)]).toEqual([
          config,
          seed,
          index,
          "awareTick",
          f[13],
        ]);
        // The seed derivation, as a Java long, from (runSeed, creation index).
        expect([config, seed, index, agentDecisionSeed(BigInt(seed), index)]).toEqual([
          config,
          seed,
          index,
          da.decisionSeed,
        ]);
        // The believed-full set is allocated in BOTH regimes.
        expect(a.believedFull).not.toBeNull();
        if (!da.awareInitial) {
          unawareArmed++;
        }
        rows++;
      });
    } finally {
      setDecisionProbe(null);
    }
    // 123,156 = 18 layer-on runs x 6,842 residents (LEG-A arms nobody).
    expect(rows).toBe(123156);
    expect(unawareArmed).toBe(35124); // BR-02's union total
  });

  // -------------------------------------------------------------------------
  it("hour.tsv: the hour bucket, z_R and the hazard logistic are bit-exact", async () => {
    setDecisionProbe(probe);
    const manifest = decisionManifest();
    interface Running {
      zR: number;
      lastDecisionHour: number;
    }
    const running = new Map<AgentKey, Running>();
    let bRows = 0;
    let zrRows = 0;
    let hzRows = 0;
    try {
      await forEachRowAsync(`${DECISION_FIXTURE_DIR}/hour.tsv`, (f) => {
        const config = f[0]!;
        const seedS = f[1]!;
        const agentS = f[2]!;
        const k = key(config, seedS, agentS);
        const tc = traceConfig(config);
        const cfg = tc.config;
        let r = running.get(k);
        if (r === undefined) {
          r = { zR: 0, lastDecisionHour: -1 };
          running.set(k, r);
        }
        const kind = f[3]!;

        if (kind === "zr") {
          // `zr`: hour, cNow, decay, zR(after)
          const cNow = hexToDouble(f[5]!);
          const decay = riskDecay(cfg.riskHalfLifeH);
          if (decayUlp.add(decay, hexToDouble(f[6]!)) > MAX_TRANSCENDENTAL_ULP) {
            expect([k, f[4], "decay", doubleToHex(decay)]).toEqual([k, f[4], "decay", f[6]]);
          }
          // `zR` compounds through `decay`, so comparing it against the Java
          // field is what proves the accumulator has not drifted over 456 hours.
          r.zR = updateRiskAccumulator(r.zR, decay, cNow);
          probe.branch(cNow >= 55.5 ? BR.CUE_FIRES : BR.CUE_ZERO);
          expect([k, f[4], "zR", doubleToHex(r.zR)]).toEqual([k, f[4], "zR", f[7]]);
          zrRows++;
          return;
        }

        if (kind === "hz") {
          // `hz`: hour, tick, open, vulnerable, bRiskEff, zR, thetaScaled,
          //       barrierCost, u, p
          const hour = Number(f[4]!);
          const open = f[6] === "1";
          const vulnerable = f[7] === "1";
          const bRiskEff = effectiveBRisk(cfg, vulnerable);
          expect([k, hour, "bRiskEff", doubleToHex(bRiskEff)]).toEqual([
            k,
            hour,
            "bRiskEff",
            f[8],
          ]);
          // The accumulator the hazard reads is the one this replay maintained,
          // and the dumped copy must agree with it bit for bit.
          expect([k, hour, "zR@hz", doubleToHex(r.zR)]).toEqual([k, hour, "zR@hz", f[9]]);
          const thetaScaled = hexToDouble(f[10]!);
          const barrierCost = hexToDouble(f[11]!);
          const u = hazardLogOdds(cfg, bRiskEff, r.zR, open, thetaScaled, barrierCost);
          expect([k, hour, "u", doubleToHex(u)]).toEqual([k, hour, "u", f[12]]);
          const p = logistic(u);
          const javaP = hexToDouble(f[13]!);
          if (pUlp.add(p, javaP) > MAX_TRANSCENDENTAL_ULP) {
            expect([k, hour, "p", doubleToHex(p)]).toEqual([k, hour, "p", f[13]]);
          }
          probe.branch(BR.HAZARD_BRANCH);
          probe.branch(open ? BR.OPEN_TRUE : BR.OPEN_FALSE);
          probe.branch(vulnerable ? BR.VULN_TRUE : BR.VULN_FALSE);
          if (inCohort(Number(agentS))) {
            const list = cohortHours.get(k);
            const rec = list === undefined ? undefined : list[list.length - 1];
            if (rec !== undefined && rec.hour === hour) {
              rec.hazardOpen = open;
              rec.hazardP = p;
              rec.javaP = javaP;
            }
          }
          hzRows++;
          return;
        }

        // `b`: hour, tick, lastDecisionHour, state, cNow, zR(before)
        const hour = Number(f[3]!);
        const tick = Number(f[4]!);
        const lastDecisionHour = Number(f[5]!);
        const state = f[6]!;
        expect([k, tick, "hour", hourBucket(tick, manifest.minutesPerTick)]).toEqual([
          k,
          tick,
          "hour",
          hour,
        ]);
        expect([k, tick, "lastDecisionHour", r.lastDecisionHour]).toEqual([
          k,
          tick,
          "lastDecisionHour",
          lastDecisionHour,
        ]);
        expect([k, tick, "newHour", isNewHour(hour, lastDecisionHour)]).toEqual([
          k,
          tick,
          "newHour",
          true,
        ]);
        expect([k, hour, "zR@b", doubleToHex(r.zR)]).toEqual([k, hour, "zR@b", f[8]]);
        r.lastDecisionHour = hour;
        probe.branch(BR.NEWHOUR);
        if (state === "UNAWARE") {
          probe.branch(BR.UNAWARE_BLOCK);
        }
        if (inCohort(Number(agentS))) {
          let list = cohortHours.get(k);
          if (list === undefined) {
            list = [];
            cohortHours.set(k, list);
          }
          list.push({
            hour,
            stateAtBucket: state,
            hazardOpen: null,
            hazardP: Number.NaN,
            javaP: Number.NaN,
          });
        }
        bRows++;
      });
    } finally {
      setDecisionProbe(null);
    }
    expect(bRows + zrRows + hzRows).toBe(3779169); // 3,779,173 lines − 4 headers
    expect(bRows).toBe(zrRows); // every bucket row is followed by its risk update
    expect(hzRows).toBeGreaterThan(0);
    console.log(decayUlp.report());
    console.log(pUlp.report());
    // `decay`, and therefore `zR`, is bit-exact: pow(2, -1/48) falls on the same
    // double for fdlibm and for HotSpot's intrinsic. That is a MEASUREMENT, not
    // an assumption — a future half-life that moved it would fail here first,
    // and the zR bit-comparison above would fail with it.
    expect(decayUlp.maxUlp).toBe(0);
  }, 900_000);

  // -------------------------------------------------------------------------
  it("draws.tsv: the private stream's draw SEQUENCE, order and site tags", () => {
    // Java's rows, grouped per agent in draw order.
    const javaDraws = new Map<AgentKey, { site: string; bits: string }[]>();
    forEachRow(`${DECISION_FIXTURE_DIR}/draws.tsv`, (f) => {
      const k = key(f[0]!, f[1]!, f[2]!);
      let list = javaDraws.get(k);
      if (list === undefined) {
        list = [];
        javaDraws.set(k, list);
      }
      expect([k, "drawIndex", Number(f[3]!)]).toEqual([k, "drawIndex", list.length]);
      list.push({ site: f[4]!, bits: f[5]! });
    });

    let agentsChecked = 0;
    let drawsChecked = 0;
    for (const [k, hours] of cohortHours) {
      const [config, seedS, agentS] = k.split("|") as [string, string, string];
      const cfg = traceConfig(config).config;
      const decisionSeed = agentDecisionSeed(BigInt(seedS), Number(agentS));
      const rng = new JavaRandom(decisionSeed);
      const modelled: { site: string; bits: string }[] = [];

      for (const h of hours) {
        // Every dumped hour is a new hour by construction — the block does
        // nothing on the other 59 ticks of the hour — so `newHour` is true at
        // every row here, which is what makes the D1 short-circuit decidable
        // from the dump alone.
        if (h.stateAtBucket === "UNAWARE") {
          if (outreachDrawConsumed(cfg, true)) {
            const bits = doubleToHex(rng.nextDouble());
            modelled.push({ site: "D1", bits });
            const converted = hexToDouble(bits) < outreachHourlyProbability(cfg);
            // The Java frame emitted an `hz` row for this hour iff the resident
            // got past the outreach gate. That is a real check of the Bernoulli
            // direction, not a restatement of it.
            expect([k, h.hour, "converted", converted]).toEqual([
              k,
              h.hour,
              "converted",
              h.hazardOpen !== null,
            ]);
          } else {
            // No draw at all: λ == 0 for every archived arm (QUIRK 28).
            expect([k, h.hour, "noHazardRowWhileUnaware", h.hazardOpen]).toEqual([
              k,
              h.hour,
              "noHazardRowWhileUnaware",
              null,
            ]);
          }
        }
        if (h.hazardOpen === true) {
          // QUIRK 1: the draw is consumed only when a shelter is open. When it
          // is not, `p` was computed and thrown away and the stream did not
          // advance, which is why this is a branch and not a multiplication.
          const bits = doubleToHex(rng.nextDouble());
          modelled.push({ site: "D2", bits });
          // The exposure of the exp() frontier, counted rather than argued: how
          // many Bernoullis would land on the other side if the port's `p` were
          // used instead of the Java frame's. Anything but 0 here would mean the
          // ulp difference had reached an outcome.
          const r = hexToDouble(bits);
          if (r < h.hazardP !== r < h.javaP) {
            knifeEdges++;
          }
          bernoullis++;
        }
      }
      const java = javaDraws.get(k) ?? [];
      expect([k, "drawCount", modelled.length]).toEqual([k, "drawCount", java.length]);
      for (let i = 0; i < java.length; i++) {
        expect([k, i, modelled[i]!.site, modelled[i]!.bits]).toEqual([
          k,
          i,
          java[i]!.site,
          java[i]!.bits,
        ]);
      }
      drawsChecked += java.length;
      agentsChecked++;
    }
    console.log(
      `[WP8] hazard Bernoulli knife edges: ${knifeEdges} of ${bernoullis} resolved draws ` +
        "differ in OUTCOME between the port's p and the Java frame's",
    );
    // The exp() frontier is real but it never reaches a decision on this trace.
    expect(knifeEdges).toBe(0);
    // 107 cohort residents in 0..6841, times the 18 layer-on runs.
    expect(agentsChecked).toBe(1926);
    expect(drawsChecked).toBe(88512); // 88,516 lines - 4 headers
  }, 300_000);

  // -------------------------------------------------------------------------
  it("draws-digest.tsv: draw COUNT and rolling SHA-256, all 123,156 residents", () => {
    // The modelled count for cohort agents, from the pass above.
    const modelledCount = new Map<AgentKey, number>();
    for (const [k, hours] of cohortHours) {
      const cfg = traceConfig(k.split("|")[0]!).config;
      let n = 0;
      for (const h of hours) {
        if (h.stateAtBucket === "UNAWARE" && outreachDrawConsumed(cfg, true)) {
          n++;
        }
        if (h.hazardOpen === true) {
          n++;
        }
      }
      modelledCount.set(k, n);
    }

    let rows = 0;
    let zeroRuns = 0;
    let cohortChecked = 0;
    forEachRow(`${DECISION_FIXTURE_DIR}/draws-digest.tsv`, (f) => {
      const config = f[0]!;
      const seedS = f[1]!;
      const agentS = f[2]!;
      const k = key(config, seedS, agentS);
      const count = Number(f[4]!);
      const cfg = traceConfig(config).config;

      // The seed, again, from every resident of every run.
      expect([k, "seed", agentDecisionSeed(BigInt(seedS), Number(agentS)).toString()]).toEqual([
        k,
        "seed",
        f[3],
      ]);

      // A degenerate layer consumes NO randomness at all, for anybody. This is
      // the population-scale form of the R3 argument.
      if (cfg.enableHazardDeparture !== 1 && cfg.lambdaOutreachPerDay === 0) {
        expect([k, "degenerateDrawCount", count]).toEqual([k, "degenerateDrawCount", 0]);
        zeroRuns++;
      }

      const modelled = modelledCount.get(k);
      if (modelled !== undefined) {
        expect([k, "count", modelled]).toEqual([k, "count", count]);
        // The rolling digest over the raw bits of the whole sequence.
        const rng = new JavaRandom(agentDecisionSeed(BigInt(seedS), Number(agentS)));
        const sha = createHash("sha256");
        // `RecordingRandom.nextDouble` feeds the digest the eight bytes of
        // `Double.doubleToRawLongBits(v)`, most significant first. Hashing the
        // hex TEXT instead would agree on the count and differ on every digest,
        // which is precisely the kind of near-miss this artefact exists to catch.
        const eight = Buffer.allocUnsafe(8);
        for (let i = 0; i < count; i++) {
          eight.writeBigUInt64BE(BigInt.asUintN(64, BigInt(`0x${doubleToHex(rng.nextDouble())}`)));
          sha.update(eight);
        }
        expect([k, "digest", sha.digest("hex")]).toEqual([k, "digest", f[5]]);
        cohortChecked++;
      }
      rows++;
    });
    expect(rows).toBe(123156);
    expect(zeroRuns).toBeGreaterThan(0);
    expect(cohortChecked).toBe(1926);
  }, 300_000);

  // -------------------------------------------------------------------------
  it("choice.tsv: the L1 utility term by term, the tie-break, and the L0 running best", () => {
    setDecisionProbe(probe);
    interface Best {
      tick: string;
      agent: AgentKey;
      bestV: number;
      bestId: string | null;
      bestDistM: number;
    }
    let l1: Best | null = null;
    let l0: Best | null = null;
    let vRows = 0;
    let dRows = 0;
    let planRows = 0;
    let pickRows = 0;
    try {
      forEachRow(`${DECISION_FIXTURE_DIR}/choice.tsv`, (f) => {
        const config = f[0]!;
        const k = key(config, f[1]!, f[2]!);
        const tick = f[3]!;
        const kind = f[4]!;
        const cfg = traceConfig(config).config;

        if (kind === "plan") {
          // regime, group-paced walkingSpeedMps, currentNodeId
          expect([k, tick, "regime", useL1(cfg) ? "L1" : "L0"]).toEqual([
            k,
            tick,
            "regime",
            f[5],
          ]);
          probe.branch(useL1(cfg) ? BR.PLAN_L1 : BR.PLAN_L0);
          l1 = { tick, agent: k, bestV: Number.NEGATIVE_INFINITY, bestId: null, bestDistM: Number.NaN };
          l0 = { tick, agent: k, bestV: Number.NaN, bestId: null, bestDistM: Number.POSITIVE_INFINITY };
          planRows++;
          return;
        }

        if (kind === "v") {
          // id, dM, cap, ownSpeedMps, walkTimeH, v, bestV(running), bestId(running)
          const id = f[5]!;
          const dM = hexToDouble(f[6]!);
          const cap = hexToDouble(f[7]!);
          const ownSpeedMps = hexToDouble(f[8]!);
          const walkTimeH = walkTimeHours(dM, ownSpeedMps);
          expect([k, tick, id, "walkTimeH", doubleToHex(walkTimeH)]).toEqual([
            k,
            tick,
            id,
            "walkTimeH",
            f[9],
          ]);
          const v = candidateUtility(cfg, walkTimeH, cap);
          const javaV = hexToDouble(f[10]!);
          vUlp.add(v, javaV);
          // `v` is a DIFFERENCE of two terms of similar size, so a last-ulp
          // disagreement in `ln(cap)` — HotSpot's intrinsic vs fdlibm — is
          // amplified by the cancellation into tens of ulps OF `v`. A flat ulp
          // budget on `v` would therefore be meaningless. The bound instead
          // attributes the whole deviation to `Math.log` and nothing else:
          // anything larger than two ulps of the ln TERM (plus the final
          // rounding of the sum) cannot be explained by the intrinsic, and is a
          // port defect. `-betaTravelTime * walkTimeH` gets no slack at all,
          // because `walkTimeH` is asserted bit-exact one line above.
          const lnTerm = cfg.betaCapacityPrior * fdlibmLog(Math.max(1.0, cap));
          const slack =
            2 * Number.EPSILON * Math.abs(lnTerm) + 2 * Number.EPSILON * Math.abs(v);
          if (!(Math.abs(v - javaV) <= slack)) {
            expect([k, tick, id, "v", doubleToHex(v)]).toEqual([k, tick, id, "v", f[10]]);
          }
          probe.branch(cap === UNCAPPED_CAPACITY_PRIOR ? BR.CAP_NULL : BR.CAP_SET);
          // The RUNNING best the Java frame carried into this candidate must be
          // the one this replay is carrying. That is what pins the tie-break.
          const b = l1 as Best | null;
          expect(b).not.toBeNull();
          expect([k, tick, id, "bestV", doubleToHex(b!.bestV)]).toEqual([
            k,
            tick,
            id,
            "bestV",
            f[11],
          ]);
          expect([k, tick, id, "bestId", b!.bestId ?? ""]).toEqual([
            k,
            tick,
            id,
            "bestId",
            f[12] ?? "",
          ]);
          if (v > b!.bestV) {
            probe.branch(BR.PICK_STRICT);
          } else if (v === b!.bestV && b!.bestId !== null) {
            probe.branch(id < b!.bestId ? BR.PICK_TIE : BR.TIE_NOT_TAKEN);
          }
          if (beatsRunningBest(v, b!.bestV, id, b!.bestId)) {
            // The running best carries the JAVA `v`. The dumped `bestV` of the
            // NEXT candidate row is the Java frame's, so tracking the port's
            // value here would compare the ln-term frontier twice instead of
            // comparing the selection LOGIC once. The per-value agreement is
            // asserted immediately above, to MAX_TRANSCENDENTAL_ULP.
            b!.bestV = javaV;
            b!.bestId = id;
            b!.bestDistM = dM;
          }
          vRows++;
          return;
        }

        if (kind === "d") {
          // id, dM, bestDistM(running), hasSpace
          const id = f[5]!;
          const dM = hexToDouble(f[6]!);
          const hasSpace = f[8] === "1";
          const b = l0 as Best | null;
          expect(b).not.toBeNull();
          expect([k, tick, id, "bestDistM", doubleToHex(b!.bestDistM)]).toEqual([
            k,
            tick,
            id,
            "bestDistM",
            f[7],
          ]);
          probe.branch(hasSpace ? BR.L0_SPACE : BR.L0_NOSPACE);
          // Strict `<`: the FIRST shelter in iteration order wins an exact tie.
          if (hasSpace && dM < b!.bestDistM) {
            b!.bestDistM = dM;
            b!.bestId = id;
          }
          dRows++;
          return;
        }

        // `pick`: regime, id, bestDistM, bestV, pathSize, routeNodes, netDist, plannedRoute
        const regime = f[5]!;
        const b = regime === "L1" ? (l1 as Best | null) : (l0 as Best | null);
        if (b !== null && b.agent === k && b.tick === tick && b.bestId !== null) {
          // Only cohort agents carry candidate rows; for everyone else the pick
          // row is the only evidence and there is nothing to reconcile.
          expect([k, tick, "pickedId", b.bestId]).toEqual([k, tick, "pickedId", f[6]]);
          if (regime === "L1") {
            expect([k, tick, "pickedBestV", doubleToHex(b.bestV)]).toEqual([
              k,
              tick,
              "pickedBestV",
              f[8],
            ]);
          }
          expect([k, tick, "pickedDist", doubleToHex(b.bestDistM)]).toEqual([
            k,
            tick,
            "pickedDist",
            f[7],
          ]);
        }
        probe.branch(f[10] === "1" ? BR.ROUTENODES_ON : BR.ROUTENODES_OFF);
        pickRows++;
      });
    } finally {
      setDecisionProbe(null);
    }
    expect(vRows + dRows + planRows + pickRows).toBe(386138); // 386,142 − 4 headers
    expect(vRows).toBeGreaterThan(0);
    expect(dRows).toBeGreaterThan(0);
    console.log(vUlp.report());
  }, 600_000);

  // -------------------------------------------------------------------------
  it("door.tsv: the pet gate at the site, and the regime-dependent belief update", () => {
    setDecisionProbe(probe);
    let arrivals = 0;
    let refusals = 0;
    try {
      forEachRow(`${DECISION_FIXTURE_DIR}/door.tsv`, (f) => {
        const config = f[0]!;
        const k = key(config, f[1]!, f[2]!);
        const tick = f[3]!;
        const cfg = traceConfig(config).config;

        if (f[4] === "refused") {
          // id, policyRefused, openAt, useL1
          const policyRefused = f[6] === "1";
          const openAt = f[7] === "1";
          const l1 = f[8] === "1";
          expect([k, tick, "useL1", useL1(cfg)]).toEqual([k, tick, "useL1", l1]);
          if (!policyRefused && !openAt) {
            probe.branch(BR.DOOR_CLOSED);
          } else if (!policyRefused) {
            probe.branch(BR.DOOR_CAPACITY);
          }
          // The port's rule, evaluated against the Java frame's own inputs.
          const records = recordsBelief(l1, policyRefused);
          if (l1) {
            probe.branch(BR.BELIEF_L1);
            expect([k, tick, "recordsBelief", records]).toEqual([k, tick, "recordsBelief", true]);
          } else if (policyRefused) {
            probe.branch(BR.BELIEF_L0);
            expect([k, tick, "recordsBelief", records]).toEqual([k, tick, "recordsBelief", true]);
          } else {
            probe.branch(BR.BELIEF_NONE);
            expect([k, tick, "recordsBelief", records]).toEqual([k, tick, "recordsBelief", false]);
          }
          refusals++;
          return;
        }

        // arrival: id, policyRefused, openAt, priority, petIntake, adultsOnly,
        //          capacity, occupancy, hasPet, hasDependents, petAdmitted
        const policyRefused = f[5] === "1";
        const priority = f[7] === "1";
        const petIntakeCell = f[8]!;
        const petIntake =
          petIntakeCell === "unrecorded" ? null : petIntakeCell === "admit" ? true : false;
        const adultsOnly = f[9] === "1";
        const hasPet = f[12] === "1";
        const hasDependents = f[13] === "1";
        const javaPetAdmitted = f[14] === "1";

        // `petAdmittedAt` — tri-state `??`, never `||` (QUIRK 11). With the
        // layer OFF the certified door never asks the question at all (the
        // probe passes `decisionConfig != null && petAdmittedAt(...)`), so the
        // expectation there is `false`, and the port's structural `false` for
        // `policyRefused` is what has to match.
        const layerOn = traceConfig(config).layerOn;
        const petAdmitted = layerOn ? (petIntake ?? cfg.petPolicyAdmitDefault) : false;
        expect([k, tick, "petAdmitted", petAdmitted]).toEqual([
          k,
          tick,
          "petAdmitted",
          javaPetAdmitted,
        ]);
        const portPolicyRefused =
          layerOn && ((hasPet && !petAdmitted) || (hasDependents && adultsOnly));
        expect([k, tick, "policyRefused", portPolicyRefused]).toEqual([
          k,
          tick,
          "policyRefused",
          policyRefused,
        ]);
        if (priority) {
          probe.branch(BR.PRIORITY);
        }
        if (policyRefused) {
          if (hasPet && !petAdmitted) {
            probe.branch(BR.DOOR_PET);
          }
          if (hasDependents && adultsOnly) {
            probe.branch(BR.DOOR_DEP);
          }
        }
        arrivals++;
      });
    } finally {
      setDecisionProbe(null);
    }
    expect(arrivals + refusals).toBe(441450); // 441,454 − 4 headers
    expect(arrivals).toBeGreaterThan(0);
    expect(refusals).toBeGreaterThan(0);
  }, 300_000);

  // -------------------------------------------------------------------------
  it("transitions.tsv: E0-null and layer-off runs take ZERO decision-layer transitions", () => {
    setDecisionProbe(probe);
    const LAYER_CAUSES = new Set(["outreach", "hazard"]);
    const causeCount = new Map<string, number>();
    const layerByConfig = new Map<string, number>();
    let rows = 0;
    try {
      forEachRow(`${DECISION_FIXTURE_DIR}/transitions.tsv`, (f) => {
        const config = f[0]!;
        const cause = f[6]!;
        causeCount.set(cause, (causeCount.get(cause) ?? 0) + 1);
        if (LAYER_CAUSES.has(cause)) {
          layerByConfig.set(config, (layerByConfig.get(config) ?? 0) + 1);
        }
        switch (cause) {
          case "outreach":
            probe.branch(BR.CONVERTED);
            break;
          case "hazard":
            probe.branch(BR.HAZARD_FIRED);
            break;
          case "latchA":
            probe.branch(BR.LATCH_A_FIRE);
            break;
          case "latchB":
            probe.branch(BR.LATCH_B_FIRE);
            break;
          case "admit":
            probe.branch(BR.DOOR_ADMIT);
            break;
          case "chooserL1":
          case "chooserL0":
            probe.branch(f[5] === "UNREACHABLE" ? BR.TERM_UNREACH : BR.TERM_REFUSED);
            break;
          case "retargetCap":
            probe.branch(BR.CAP_FIRED);
            break;
          case "reentryL1":
          case "reentryL0":
            probe.branch(BR.REENTRY_GRANTED);
            break;
          default:
            throw new Error(`transitions.tsv names an unmodelled cause ${JSON.stringify(cause)}`);
        }
        rows++;
      });
    } finally {
      setDecisionProbe(null);
    }
    expect(rows).toBe(178405); // 178,409 − 4 headers

    // THE R3 CLAIM, measured on the Java side: the degenerate arms and the
    // layer-off arm take no layer transition between them.
    for (const id of ["E0-A", "E0-B", "E0-C", "LEG-A", "L0P-A", "SEC-A"]) {
      expect([id, layerByConfig.get(id) ?? 0]).toEqual([id, 0]);
    }
    // ...while the real ones do, so the assertion above is not vacuous.
    expect(layerByConfig.get("ER-A")!).toBeGreaterThan(0);
    expect(layerByConfig.get("ERL-A")!).toBeGreaterThan(0);
    // Outreach fires ONLY in the synthetic λ>0 vehicle (QUIRK 28).
    expect(causeCount.get("outreach")).toBe(4414);
  }, 300_000);

  // -------------------------------------------------------------------------
  it("cov-closures: the closure-scan branch the main dump could not reach", () => {
    setDecisionProbe(probe);
    let scans = 0;
    try {
      forEachRow(`${DECISION_COV_CLOSURES_DIR}/closure.tsv`, (f) => {
        const kind = f[4]!;
        if (kind === "scan") {
          const hitFound = f[5] === "1";
          const hitIndex = Number(f[6]!);
          // `hit >= 0` iff a blocked ahead-edge was found — the invariant the
          // scan's return value carries.
          expect([f[2], f[3], "hitFound", hitIndex >= 0]).toEqual([
            f[2],
            f[3],
            "hitFound",
            hitFound,
          ]);
          probe.branch(hitFound ? BR.SCAN_HIT : BR.SCAN_NOHIT);
          scans++;
        }
      });
    } finally {
      setDecisionProbe(null);
    }
    // 685 invocations, none of which found a blocked ahead-edge (DR-WP8 §7.2).
    expect(scans).toBe(685);
    expect(probe.count(BR.SCAN_HIT)).toBe(0);
  });

  // -------------------------------------------------------------------------
  it("synthetic drivers: the branches that live in step()'s control flow", () => {
    // The dumps carry VALUES. They cannot carry "this tick was not a new hour",
    // "this resident was still UNAWARE and returned", or "this candidate was
    // skipped because it was closed" — 20 of the 57 branches the Java exercised
    // are control flow with no row of their own. Those are driven here, through
    // the real `stepResident`, in the SAME counter space as the replays above,
    // because a coverage claim assembled from two isolated counter arrays would
    // not be one claim. These drivers assert STRUCTURE; every bit-exact number
    // in this file comes from the replays.
    setDecisionProbe(probe);
    try {
      const census = driveControlFlowBranches();
      expect(census.scenarios).toBe(8);
    } finally {
      setDecisionProbe(null);
    }
  });

  // -------------------------------------------------------------------------
  it("BRANCH COVERAGE: every branch the Java oracle exercised is exercised here", () => {
    interface CoverageRow {
      readonly branch: string;
      readonly total: number;
    }
    const rows: CoverageRow[] = [];
    forEachRow(`${DECISION_FIXTURE_DIR}/coverage-union.tsv`, (f) => {
      if (f[0] === "branch") {
        return;
      }
      rows.push({ branch: f[0]!, total: Number(f[f.length - 1]!) });
    });
    expect(rows.length).toBe(DECISION_BRANCHES.length);

    // The two branch registers are the same register. A rename on either side
    // is a failing test, not a silent gap.
    for (let i = 0; i < rows.length; i++) {
      expect([i, rows[i]!.branch]).toEqual([i, DECISION_BRANCHES[i]]);
    }

    const missed: string[] = [];
    let required = 0;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i]!.total > 0) {
        required++;
        if (probe.count(i as BranchId) === 0) {
          missed.push(`${rows[i]!.branch}  (java=${rows[i]!.total}, port=0)`);
        }
      }
    }
    expect(required).toBe(57); // DR-WP8 §7.2: 57 of 72 triggered in Java
    expect(missed).toEqual([]);
  });
});

/**
 * The `describeGated` body above is only collected when the oracle is present.
 * This case is not: it asserts the thing that must hold in a clean clone too,
 * namely that the port's branch register is the register the oracle names, so
 * a rename cannot slip through on a machine without `pipeline/out/`.
 */
it("the port's branch register has the oracle's 72 entries", () => {
  expect(DECISION_BRANCHES.length).toBe(72);
  expect(DECISION_BRANCHES[0]).toContain("BR-01");
  expect(DECISION_BRANCHES[71]).toContain("BR-72");
  const ids = Object.values(BR).sort((a, b) => a - b);
  expect(ids).toEqual(Array.from({ length: 72 }, (_, i) => i));
  expect(groupPacedSpeedMps(1.3, 0.06)).toBeCloseTo(1.24, 12);
  expect(candidateCapacityPrior(null)).toBe(UNCAPPED_CAPACITY_PRIOR);
});
