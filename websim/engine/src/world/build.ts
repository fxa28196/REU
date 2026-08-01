/**
 * `ContextCreator.build()` — the 12-step world build, once, before tick 0
 * (PORT_MAP §1.3, plan §3.2 `world/build.ts`).
 *
 * ## Why the step ORDER is the port, not a detail
 *
 * Every step that consumes randomness does so from a stream whose position is
 * decided by the steps before it. Steps 1–9 consume **no** RNG at all — the
 * registry, the graph, the smoke field, the shelters and their Dijkstra trees,
 * and the closure schedule are all deterministic — and that is precisely what
 * makes Tier-1 identity achievable: the only build-time draws are step 10's one
 * `nextIntFromTo` per resident on the Repast default stream, step 10's
 * `PopulationSampler.sample()` on its own stream, and step 11's
 * `ELayerSampler.sample()` on a third. No shuffle has happened yet.
 *
 * Three orderings inside those steps are outcome-relevant and are preserved
 * literally:
 *
 * 1. **Shelter CSV file order.** The shelter list drives closure-wave tree
 *    recomputation, and `context.getObjects` order is unspecified, so the
 *    certified model keeps its own ordered list. So does this.
 * 2. **Resident creation order.** The default-stream draw, the population draw
 *    and (in step 11) the E-layer draw are all indexed by it, and the per-agent
 *    decision seed is derived from it.
 * 3. **The E-layer SECOND PASS.** Step 11 is a separate loop after placement has
 *    finished. Fusing it into step 10 would not change the E stream's own
 *    sequence, but the certified model does not fuse it, and "identical output
 *    today" is not a licence to restructure a stream contract.
 *
 * ## What this port does NOT do here
 *
 * - **Step 4, `ScienceRegistry.load`** is an asset-build-time gate in the web
 *   port (`pipeline/scripts/build-registry.ts` fails the asset build on a bad
 *   registry). It draws no RNG and creates no model object, so moving it offline
 *   cannot move a number. {@link WorldBuildInput.registryValidated} records that
 *   the gate ran.
 * - **Steps 5–6, geography + streets.** The graph is baked offline (the
 *   corrupt-node correction depends on shapefile record order; re-running it in
 *   the browser would be pointless risk). The build consumes the packed asset.
 * - **Step 7, `SmokeField`.** Built offline into `smoke-{0,1,2}.json`. The build
 *   needs only `smokeHours` — for `min(simulationHours, hours())` and the
 *   closure inert-warning boundary.
 * - **Step 12's Repast scheduling.** `endTick` is computed and returned; wiring
 *   `OutcomeLogger` is WP7's.
 *
 * Everything else is here, including the fail-fasts and the deliberate ABSENCE
 * of a `scenarioCode` fail-fast.
 */

import { computeTree, makeScratch, retainTree, type SsspScratch } from "../graph/dijkstra.js";
import type { RoutingGraph } from "../graph/csr.js";
import { DegreeSpaceNodeIndex } from "../graph/strtreeSnap.js";
import { geodesicDistanceM } from "../geo/geodesic.js";
import { javaDoubleThrows, javaParseDouble, javaTrim, type CsvRow } from "../loader/csv.js";
import {
  ELayerSampler,
  type DecisionAttributes,
  type DecisionMarginals,
} from "../agents/eLayerSampler.js";
import {
  decisionConfigPositional,
  petPolicyAdmitDefaultFrom,
  type DecisionConfig,
} from "../decision/config.js";
import {
  PopulationSampler,
  type PopulationAttributes,
  type PopulationMarginals,
} from "../agents/populationSampler.js";
import { StreamRegistry } from "../rng/streams.js";
import { Shelter } from "../shelters/shelter.js";
import { parseClosureSchedule, type ClosureSchedule } from "../closures/schedule.js";
import {
  BuildFailFastError,
  checkSelectorCodes,
  resolveClosuresCsv,
  resolveScenario,
  SMOKE_SERIES_CSV,
  type ResolvedScenario,
} from "./scenario.js";
import { checkRunWindow, tickForDate, ticksPerHour as ticksPerHourOf } from "./time.js";

export const ENCAMPMENTS_CSV = "data/encampments/irp_campsite_reports_sample.csv";

/**
 * The parameters `ContextCreator.build()` reads. Names and types match the
 * certified parameter surface (PORT_MAP §2) exactly; the caller supplies a
 * complete set (`@websim/shared`'s `RunConfig` is one), because the batch
 * fallback ladder is a Repast artefact and R7 says presets must be explicit.
 */
export interface WorldBuildConfig {
  readonly numAgents: number;
  readonly minutesPerTick: number;
  readonly simulationHours: number;
  readonly randomSeed: number;
  readonly scenarioCode: number;
  readonly enableHeterogeneity: number;
  readonly respectShelterOpeningDates: number;
  readonly triageReserveFraction: number;
  readonly enableDecisionLayer: number;
  readonly pAwareInit: number;
  readonly pHeavyBelongings: number;
  readonly pHasPet: number;
  readonly pHasDependents: number;
  readonly groupSpeedDeltaMps: number;
  readonly shelterPolicyVariant: number;
  readonly smokeSeriesCode: number;
  readonly closuresCode: number;
  readonly closureDraw: number;

  // --- the 19 `GisAgent.DecisionConfig` coefficients -----------------------
  //
  // `ContextCreator.build()` reads every one of these and passes them, in this
  // order, to the positional `DecisionConfig` constructor at step 11
  // (`ContextCreator.java:781-788`). They are declared here rather than on
  // `SimulationOptions` because that is where the certified model reads them:
  // the config is a *build product*, constructed once, before any resident is
  // armed, and shared by reference with all of them.
  //
  // They are **required**, not optional-with-a-default. An optional coefficient
  // that silently fell back would be exactly the failure mode that let the
  // decision layer sit unreached for a whole work package: `RunConfig` names all
  // 41 parameters explicitly (plan Q2 / R7), so a caller that has a `RunConfig`
  // already satisfies this and a caller that does not must say what it means.
  readonly lambdaOutreachPerDay: number;
  readonly informationRegime: number;
  readonly enableHazardDeparture: number;
  readonly sigmaTheta: number;
  readonly alphaHazard: number;
  readonly bRisk: number;
  readonly wOfficial: number;
  readonly gammaVuln: number;
  readonly riskHalfLifeH: number;
  readonly barrierBelongings: number;
  readonly barrierPet: number;
  readonly barrierDependents: number;
  /** `int`, tested `== 1` at the call site — `2` means *refuse* (QUIRK 22). */
  readonly petPolicyDefault: number;
  readonly betaTravelTime: number;
  readonly betaCapacityPrior: number;
  readonly pushThetaThreshold: number;
  readonly kPush: number;
  readonly pStuck: number;
  readonly stuckDelayH: number;
}

/** Synchronous access to the data files, relative to the Geography data root. */
export interface WorldDataSource {
  exists(path: string): boolean;
  /** Rows produced by the ported `CsvLoader.read` — trim-all, padded, last-wins. */
  readCsv(path: string): readonly CsvRow[];
}

export interface WorldBuildInput {
  readonly graph: RoutingGraph;
  readonly data: WorldDataSource;
  /** Number of hourly slices in the selected series (`smokeField.hours()`). */
  readonly smokeHours: number;
  /** Reused across builds; constructed here when omitted. */
  readonly snapIndex?: DegreeSpaceNodeIndex;
  readonly scratch?: SsspScratch;
  /**
   * Compute one Dijkstra tree per shelter (step 8). Default `true` — that is
   * what the model does. Set `false` only for tests that are checking something
   * else and have said so out loud; a world without trees cannot route.
   */
  readonly computeShelterTrees?: boolean;
  /** Records that the offline `ScienceRegistry` gate ran (step 4). */
  readonly registryValidated?: boolean;
}

/** One resident, in creation order. */
export interface WorldResident {
  /** Creation index — the `i` in `"Site " + i`, and the decision-seed index. */
  readonly index: number;
  /** Index into the kept camp list; `-1` when the camp list is empty. */
  readonly campIndex: number;
  /** `inc_id` of the sampled campsite report, or `"none"` for the empty case. */
  readonly incId: string | null;
  readonly startLon: number;
  readonly startLat: number;
  /** Node **index** into the routing graph. */
  readonly startNode: number;
  /** Certified node id of `startNode`. */
  readonly startNodeId: number;
  /**
   * Build-time snap displacement in metres: geodesic distance from the raw
   * campsite coordinate to the node it snapped to.
   *
   * **Not** `GisAgent.snapGapM`, which starts at 0 and accumulates per route leg
   * (`GisAgent.java:519`) and is what `agents.csv` reports. DR-F1 §8.
   */
  readonly buildSnapGapM: number;
  readonly attributes: PopulationAttributes | null;
  readonly decision: DecisionAttributes | null;
}

export interface CampSite {
  readonly lon: number;
  readonly lat: number;
  readonly incId: string | null;
}

export interface WorldBuildResult {
  readonly config: WorldBuildConfig;
  readonly scenario: ResolvedScenario;
  readonly shelters: readonly Shelter[];
  /** The load-time census: how many of them carry `status == "operating"`. */
  readonly operatingShelters: number;
  readonly residents: readonly WorldResident[];
  /**
   * The ONE run-wide `GisAgent.DecisionConfig`, or `null` when
   * `enableDecisionLayer !== 1`.
   *
   * Constructed at step 11, before the arming loop, exactly as
   * `ContextCreator.java:781-788` does — outside the per-resident loop, so every
   * resident shares one instance by reference. `Simulation`'s constructor
   * completes step 11 by handing this to `armResident` for each resident in
   * creation order; `null` here is what keeps a legacy arm byte-identical,
   * because it is the value `Resident.decisionConfig` retains.
   */
  readonly decisionConfig: DecisionConfig | null;
  /** Camps kept after the silent malformed-row skip, in CSV order. */
  readonly camps: readonly CampSite[];
  readonly campRowsRead: number;
  readonly closures: ClosureSchedule | null;
  readonly ticksPerHour: number;
  readonly endHours: number;
  readonly endTick: number;
  /** Gotcha 3: `simulationHours > smokeHours − 1`. */
  readonly overrunsSmokeSeries: boolean;
  readonly smokeCsv: string;
  readonly populationMarginals: PopulationMarginals | null;
  readonly decisionMarginals: DecisionMarginals | null;
  /** The four-stream registry, positioned exactly as the build left it. */
  readonly streams: StreamRegistry;
  readonly snapIndex: DegreeSpaceNodeIndex;
  readonly warnings: readonly string[];
}

/** `Integer.valueOf(String)` strictness — sign then digits, nothing else. */
const JAVA_INT = /^[+-]?\d+$/u;

function parseCapacity(raw: string | undefined, shelterId: string): number | null {
  // Java: `capStr == null || capStr.isEmpty()` -> null (UNLIMITED). Note
  // `isEmpty()`, not `isBlank()` — but CsvLoader has already trimmed every field.
  if (raw === undefined || raw.length === 0) {
    return null;
  }
  if (!JAVA_INT.test(raw)) {
    // Integer.valueOf throws NumberFormatException, uncaught in build().
    throw new BuildFailFastError(`shelter ${shelterId}: capacity "${raw}" is not an integer`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > 2147483647 || value < -2147483648) {
    throw new BuildFailFastError(`shelter ${shelterId}: capacity "${raw}" overflows a Java int`);
  }
  return value;
}

function requireDouble(raw: string | undefined, what: string): number {
  if (raw === undefined || javaDoubleThrows(raw)) {
    // Double.parseDouble throws here, and build() does not catch it.
    throw new BuildFailFastError(`${what} is not a parseable double: "${raw ?? "(absent)"}"`);
  }
  return javaParseDouble(raw);
}

/**
 * Run the world build.
 *
 * Throws {@link BuildFailFastError} exactly where the certified model throws
 * `IllegalStateException` or lets a `NumberFormatException` escape.
 */
export function buildWorld(config: WorldBuildConfig, input: WorldBuildInput): WorldBuildResult {
  const warnings: string[] = [];
  const { graph, data } = input;

  // --- Step 1: parameters + seed -----------------------------------------
  const seed = BigInt(Math.trunc(config.randomSeed));
  const tph = ticksPerHourOf(config.minutesPerTick);

  // --- Step 2: selector fail-fasts (NOT scenarioCode — see scenario.ts) ---
  checkSelectorCodes(config);

  // --- Step 3: scenario name + shelters CSV, then the `_elayer` rewrite ---
  const scenario = resolveScenario(config, (p) => data.exists(p));
  if (scenario.fellThrough) {
    warnings.push(
      `[Scenario] scenarioCode ${config.scenarioCode} matched no branch and fell through to ` +
        `arm A (${scenario.scenarioName}) — certified behaviour, there is no fail-fast here`,
    );
  }
  if (scenario.severeLabelWithoutSevereSeries) {
    warnings.push(
      `[Scenario][WARN] scenarioCode ${config.scenarioCode} is a Scenario-E label but ` +
        `smokeSeriesCode=0 (observed series): this run is label-only, not the severe counterfactual.`,
    );
  }

  // --- Step 4: governance gate (offline; see the module header) ----------
  if (input.registryValidated === false) {
    throw new BuildFailFastError(
      "ScienceRegistry validation did not run: the certified build aborts before any model " +
        "object exists when the registry is bad, so the port refuses to build without the gate",
    );
  }
  if (input.registryValidated === undefined) {
    warnings.push(
      "[ScienceRegistry] the caller did not state whether the governance gate ran; the " +
        "certified build validates the registries before any model object exists",
    );
  }

  // --- Steps 5-6: geography + streets: the packed graph asset ------------
  const snapIndex = input.snapIndex ?? new DegreeSpaceNodeIndex(graph);
  const scratch: SsspScratch = input.scratch ?? makeScratch(graph);

  // --- Step 7: SmokeField (offline) --------------------------------------
  const smokeCsv = SMOKE_SERIES_CSV[config.smokeSeriesCode]!;
  const runWindow = checkRunWindow(config.simulationHours, input.smokeHours, config.minutesPerTick);
  if (runWindow.overrunsSmokeSeries) {
    warnings.push(
      `[SmokeField][WARN] simulationHours=${config.simulationHours} needs ` +
        `${config.simulationHours + 1} slices but the series has ${input.smokeHours}: the ` +
        `inclusive final tick reads hour ${config.simulationHours} and books fabricated zeros ` +
        `(gotcha 3 — expected out_of_range_lookups > 0)`,
    );
  }

  // --- Step 8: shelters, in CSV FILE ORDER -------------------------------
  const shelterRows = data.readCsv(scenario.sheltersCsv);
  const shelters: Shelter[] = [];
  const computeTrees = input.computeShelterTrees !== false;
  let operatingCount = 0;

  for (const r of shelterRows) {
    const id = r.get("shelter_id") ?? "";
    const capacity = parseCapacity(r.get("capacity"), id);
    const operating = (r.get("status") ?? "").toLowerCase() === "operating";
    const lon = requireDouble(r.get("lon"), `shelter ${id} lon`);
    const lat = requireDouble(r.get("lat"), `shelter ${id} lat`);
    const shelter = new Shelter(id, r.get("name") ?? "", capacity, operating, lon, lat);

    if (config.respectShelterOpeningDates === 1) {
      shelter.setOpenWindowTicks(
        tickForDate(r.get("opened") ?? null, tph, Number.NEGATIVE_INFINITY, 0),
        tickForDate(r.get("closed") ?? null, tph, Number.POSITIVE_INFINITY, 1),
      );
    }

    // FLOOR, not round, and only when both guards hold. At fraction 0 no call
    // is made at all — which is why arms A/B/C are bit-identical to pre-arm-D.
    if (capacity !== null && config.triageReserveFraction > 0) {
      shelter.setReservedForPriority(Math.floor(capacity * config.triageReserveFraction));
    }

    // Optional Phase-E policy columns. Absent column -> no value -> the run-wide
    // petPolicyDefault applies at the door. Tri-state, never collapsed.
    const petCol = r.get("pet_intake");
    if (petCol !== undefined && javaTrim(petCol).length > 0) {
      shelter.petIntake = javaTrim(petCol).toLowerCase() === "admit";
    }
    const adultsCol = r.get("adults_only");
    if (adultsCol !== undefined && javaTrim(adultsCol).length > 0) {
      const v = javaTrim(adultsCol);
      shelter.adultsOnly = v === "1" || v.toLowerCase() === "true" || v.toLowerCase() === "yes";
    }

    const snap = snapIndex.nearest(lon, lat);
    shelter.graphNode = snap.node;
    shelter.graphNodeId = graph.nodeId[snap.node]!;
    shelter.snapGapM = geodesicDistanceM(
      lon,
      lat,
      graph.nodeLon[snap.node]!,
      graph.nodeLat[snap.node]!,
    );
    if (computeTrees) {
      // `computeTree` hands back views over the shared scratch, so a tree that
      // outlives the next call must own its arrays.
      shelter.routeTree = retainTree(computeTree(graph, snap.node, scratch));
    }
    shelters.push(shelter);
    if (operating) {
      operatingCount++;
    }
  }

  // --- Step 9: closures (only when closuresCode != 0) --------------------
  let closures: ClosureSchedule | null = null;
  const closuresCsv = resolveClosuresCsv(config.closuresCode, config.closureDraw);
  if (closuresCsv !== null) {
    closures = parseClosureSchedule({
      rows: data.readCsv(closuresCsv),
      csvPath: closuresCsv,
      graph,
      ticksPerHour: tph,
      runEndHours: runWindow.endHours,
    });
    if (closures.inertRows > 0) {
      warnings.push(
        `[Closures][WARN] ${closures.inertRows} row(s) activate at or after the run end ` +
          `(${runWindow.endHours} h) — scheduled but inert`,
      );
    }
    if (closures.matchingGraphEdges < closures.scheduledEdges) {
      warnings.push(
        `[Closures][WARN] ${closures.scheduledEdges - closures.matchingGraphEdges} scheduled ` +
          `closure(s) match no graph edge (corrupt-id correction or filtered feature): they ` +
          `block nothing.`,
      );
    }
    if (config.enableDecisionLayer === 0) {
      warnings.push(
        "[Closures][WARN] closures active with the decision layer OFF: every blocked resident " +
          "reroutes (no push-through trait exists).",
      );
    }
  }

  // --- Step 10: residents at real encampment locations -------------------
  const campRows = data.readCsv(ENCAMPMENTS_CSV);
  warnings.push(
    "[WARN] Encampment start locations are REAL City-of-Portland campsite reports but from " +
      "2025-2026; they are a spatial proxy for the Sept 2020 distribution (A-03, DATA_SOURCES D2b). " +
      "Complaint-driven -> visibility bias.",
  );

  // Malformed rows are skipped SILENTLY (Java catches Exception and continues),
  // and nothing is appended when either coordinate fails to parse — the
  // Coordinate is constructed before the list add, so both parses must succeed.
  const camps: CampSite[] = [];
  for (const r of campRows) {
    const lonRaw = r.get("lon");
    const latRaw = r.get("lat");
    if (lonRaw === undefined || latRaw === undefined) {
      continue;
    }
    if (javaDoubleThrows(lonRaw) || javaDoubleThrows(latRaw)) {
      continue;
    }
    camps.push({
      lon: javaParseDouble(lonRaw),
      lat: javaParseDouble(latRaw),
      incId: r.get("inc_id") ?? null,
    });
  }

  const streams = new StreamRegistry({
    runSeed: seed,
    enableHeterogeneity: config.enableHeterogeneity === 1,
    enableDecisionLayer: config.enableDecisionLayer === 1,
  });
  const sampler =
    streams.populationSampler === null ? null : new PopulationSampler(streams.populationSampler);

  // Snapping is a pure function of the coordinate, so caching by camp index is
  // not a behaviour change — it is the same STRtree query Java repeats per
  // resident. Nothing else in this loop is memoised.
  const campSnap = new Int32Array(camps.length).fill(-1);
  const campGap = new Float64Array(camps.length);

  const residents: WorldResident[] = [];
  for (let i = 0; i < config.numAgents; i++) {
    // THE ONLY build-time draw on the Repast default stream.
    const idx = camps.length === 0 ? -1 : streams.defaultStream.nextIntFromTo(0, camps.length - 1);
    const lon = idx < 0 ? 0 : camps[idx]!.lon;
    const lat = idx < 0 ? 0 : camps[idx]!.lat;
    const incId = idx < 0 ? "none" : camps[idx]!.incId;

    let node: number;
    let gap: number;
    if (idx >= 0 && campSnap[idx]! >= 0) {
      node = campSnap[idx]!;
      gap = campGap[idx]!;
    } else {
      const snap = snapIndex.nearest(lon, lat);
      node = snap.node;
      gap = geodesicDistanceM(lon, lat, graph.nodeLon[node]!, graph.nodeLat[node]!);
      if (idx >= 0) {
        campSnap[idx] = node;
        campGap[idx] = gap;
      }
    }

    residents.push({
      index: i,
      campIndex: idx,
      incId,
      startLon: lon,
      startLat: lat,
      startNode: node,
      startNodeId: graph.nodeId[node]!,
      buildSnapGapM: gap,
      attributes: sampler === null ? null : sampler.sample(),
      decision: null,
    });
  }

  // --- Step 11: Phase-E second pass, in CREATION order -------------------
  //
  // `ContextCreator.java:772-804`, in its order: the sampler is constructed
  // first, then the ONE shared `DecisionConfig`, then the loop that samples and
  // arms each resident. Neither construction consumes randomness, so their
  // relative order cannot move a number — they are kept in the certified order
  // anyway, because "identical output today" is not a licence to restructure.
  //
  // The port splits the loop across a build/run seam the certified model does
  // not have: `GisAgent`s exist by step 11 in Java, whereas here the `Resident`
  // objects are constructed by `Simulation`. So this loop does the sampling half
  // (which is what positions the E stream) and `Simulation`'s constructor does
  // the `setDecisionLayer` half, over the same list in the same creation order,
  // before tick 1. `armResident` consumes no randomness, so the split is
  // stream-neutral by construction.
  let eSampler: ELayerSampler | null = null;
  let decisionCfg: DecisionConfig | null = null;
  if (config.enableDecisionLayer === 1) {
    eSampler = new ELayerSampler(streams.eLayerSampler!, {
      runSeed: seed,
      pAware: config.pAwareInit,
      pHeavy: config.pHeavyBelongings,
      pPet: config.pHasPet,
      pDependents: config.pHasDependents,
      groupSpeedDeltaMps: config.groupSpeedDeltaMps,
    });
    // The 19 arguments in `GisAgent.DecisionConfig`'s declaration order. The
    // positional form is used deliberately: it is the shape of the certified
    // call site, so a transcription error is a compile error rather than a
    // silently rewired model.
    decisionCfg = decisionConfigPositional(
      config.informationRegime,
      config.enableHazardDeparture,
      config.alphaHazard,
      config.bRisk,
      config.wOfficial,
      config.gammaVuln,
      config.sigmaTheta,
      config.riskHalfLifeH,
      config.lambdaOutreachPerDay,
      config.barrierBelongings,
      config.barrierPet,
      config.barrierDependents,
      petPolicyAdmitDefaultFrom(config.petPolicyDefault),
      config.betaTravelTime,
      config.betaCapacityPrior,
      config.pushThetaThreshold,
      config.kPush,
      config.pStuck,
      config.stuckDelayH,
    );
    for (let i = 0; i < residents.length; i++) {
      const r = residents[i]!;
      residents[i] = { ...r, decision: eSampler.sample() };
    }
  }

  // --- Step 12: run window ------------------------------------------------
  return {
    config,
    scenario,
    shelters,
    operatingShelters: operatingCount,
    residents,
    decisionConfig: decisionCfg,
    camps,
    campRowsRead: campRows.length,
    closures,
    ticksPerHour: tph,
    endHours: runWindow.endHours,
    endTick: runWindow.endTick,
    overrunsSmokeSeries: runWindow.overrunsSmokeSeries,
    smokeCsv,
    populationMarginals: sampler === null ? null : sampler.marginals(),
    decisionMarginals: eSampler === null ? null : eSampler.marginals(),
    streams,
    snapIndex,
    warnings,
  };
}
