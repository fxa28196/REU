package websim.exporter.decision;

/**
 * WP8 decision-layer trace probe: the <b>only</b> class the instrumented copy of
 * {@code geography.agents.GisAgent} calls.
 *
 * <p><b>It computes nothing.</b> Every argument handed to every hook below is an
 * existing local variable, field, method parameter or pure certified accessor
 * <i>already evaluated by the certified statement immediately above the
 * insertion point</i>. No hook re-derives, re-associates or re-evaluates a model
 * expression; the patch audit written by {@link Instrument} lists every inserted
 * line so that claim is checkable line by line. The probe's own arithmetic is
 * limited to (a) integer branch counters and (b) IEEE-754 bit formatting.
 *
 * <p><b>It must not perturb behaviour.</b> No hook mutates a model object, calls
 * a mutating certified method ({@code Shelter.admit}, {@code recordPolicyRefusal},
 * {@code blockEdge}, ...), or consumes randomness. That claim is checked
 * empirically, not asserted: {@code dump-decision-trace.ps1 -Neutrality} runs the
 * identical driver twice in two JVMs — once against the certified
 * {@code geo-classes}, once against the instrumented {@code geo-inst-classes} —
 * and requires the end-of-run per-agent state dumps to be byte-identical.
 *
 * <p><b>Zero geography dependency.</b> Agents and shelters cross the boundary as
 * {@code Object} / {@code String} / primitives, so this class compiles before the
 * Geography sources do (which is what makes the instrumented compile possible at
 * all).
 */
public final class DecisionProbe {

	private DecisionProbe() { }

	// ------------------------------------------------------------- emitter

	/** Sink for formatted rows; implemented by {@link DecisionTrace}. */
	public interface Emitter {
		void row(int stream, String line);
	}

	public static final int S_HOUR = 0;
	public static final int S_DRAW = 1;
	public static final int S_TRANSITION = 2;
	public static final int S_CHOICE = 3;
	public static final int S_DOOR = 4;
	public static final int S_CLOSURE = 5;
	public static final int S_ARM = 6;
	public static final int STREAM_COUNT = 7;

	// ------------------------------------------------------------ branches
	// The branch register of WP8-SPEC-decision.md, one counter each. Names are
	// dumped verbatim as the coverage table; order is the dump order.

	public static final String[] BRANCHES = {
		/* 00 */ "BR-01 build: awareInitial=true -> PRE_EVAC, awareTick=0",
		/* 01 */ "BR-02 build: awareInitial=false -> UNAWARE, awareTick=NaN",
		/* 02 */ "BR-03 block3 group pace APPLIED (groupSpeedDeltaMps > 0)",
		/* 03 */ "BR-04 block3 group pace SKIPPED (groupSpeedDeltaMps == 0)",
		/* 04 */ "BR-05 block6b newHour == true",
		/* 05 */ "BR-06 block6b newHour == false",
		/* 06 */ "BR-07 block6c zR increment FIRES (cNow >= 55.5)",
		/* 07 */ "BR-08 block6c zR increment ZERO (cNow < 55.5)",
		/* 08 */ "BR-09 departure block entered while UNAWARE",
		/* 09 */ "BR-10 D1 outreach draw CONSUMED",
		/* 10 */ "BR-11 D1 skipped: lambdaOutreachPerDay == 0",
		/* 11 */ "BR-12 D1 skipped: !newHour",
		/* 12 */ "BR-13 outreach conversion UNAWARE -> PRE_EVAC",
		/* 13 */ "BR-14 UNAWARE return (still unaware)",
		/* 14 */ "BR-15 hazard branch entered (enableHazardDeparture == 1)",
		/* 15 */ "BR-16 hazard: open == true",
		/* 16 */ "BR-17 hazard: open == false (D2 suppressed by short-circuit)",
		/* 17 */ "BR-18 hazard: vulnerable == true (gammaVuln applied)",
		/* 18 */ "BR-19 hazard: vulnerable == false",
		/* 19 */ "BR-20 D2 hazard draw CONSUMED",
		/* 20 */ "BR-21 hazard departure FIRED (-> EN_ROUTE)",
		/* 21 */ "BR-22 hazard 'still waiting' return",
		/* 22 */ "BR-23 latch site A (layer on, hazard off) FIRED",
		/* 23 */ "BR-24 latch site A returned (waiting)",
		/* 24 */ "BR-25 latch site B (layer OFF) FIRED",
		/* 25 */ "BR-26 latch site B returned (waiting)",
		/* 26 */ "BR-27 same agent-tick D1 then D2 (two draws)",
		/* 27 */ "BR-28 REFUSED_ALL_FULL re-entry evaluated under L1",
		/* 28 */ "BR-29 REFUSED_ALL_FULL re-entry evaluated under L0/legacy",
		/* 29 */ "BR-30 REFUSED_ALL_FULL re-entry BLOCKED (return)",
		/* 30 */ "BR-31 REFUSED_ALL_FULL re-entry GRANTED (-> EN_ROUTE, counter reset)",
		/* 31 */ "BR-32 stuck HELD (tick < stuckUntilTick, return)",
		/* 32 */ "BR-33 stuck delay SERVED (stuckUntilTick cleared)",
		/* 33 */ "BR-34 closure scan: NO hit (version consumed, return)",
		/* 34 */ "BR-35 closure scan: HIT (blockagesEncountered++)",
		/* 35 */ "BR-36 push rule TRUE",
		/* 36 */ "BR-37 push rule FALSE (reroute)",
		/* 37 */ "BR-38 D3 stuck draw CONSUMED",
		/* 38 */ "BR-39 stuck event SET (draw < pStuck)",
		/* 39 */ "BR-40 push through WITHOUT stuck",
		/* 40 */ "BR-41 reroute executed (currentNodeId rewound)",
		/* 41 */ "BR-42 planning: chooseShelterByUtility (L1)",
		/* 42 */ "BR-43 planning: chooseNetworkNearestShelter (L0/legacy)",
		/* 43 */ "BR-44 candidate skipped: !isOperating",
		/* 44 */ "BR-45 candidate skipped: !isOpenAt(tick)",
		/* 45 */ "BR-46 candidate skipped: routeTree == null",
		/* 46 */ "BR-47 candidate skipped: distanceTo == +Infinity (unreachable)",
		/* 47 */ "BR-48 candidate skipped: believedFull (L1)",
		/* 48 */ "BR-49 candidate skipped: excludedByBelief (L0)",
		/* 49 */ "BR-50 L1 candidate capacity == null -> UNCAPPED_CAPACITY_PRIOR",
		/* 50 */ "BR-51 L1 candidate capacity != null",
		/* 51 */ "BR-52 L1 selection by strict v > bestV",
		/* 52 */ "BR-53 L1 selection by TIE-BREAK (v == bestV && id.compareTo < 0)",
		/* 53 */ "BR-54 L1 tie at bestV NOT taken (id.compareTo >= 0)",
		/* 54 */ "BR-55 L0 candidate has space and dM < bestDistM (selected)",
		/* 55 */ "BR-56 L0 candidate has NO space",
		/* 56 */ "BR-57 chooser -> REFUSED_ALL_FULL (anyReachable, none selectable)",
		/* 57 */ "BR-58 chooser -> UNREACHABLE (nothing reachable)",
		/* 58 */ "BR-59 networkDistToShelterM FIRST write (V11 NaN guard)",
		/* 59 */ "BR-60 networkDistToShelterM already set (retarget leg)",
		/* 60 */ "BR-61 routeNodes ALLOCATED (hasClosureSchedule)",
		/* 61 */ "BR-62 routeNodes null (no closure schedule)",
		/* 62 */ "BR-63 door: ADMITTED -> SHELTERED",
		/* 63 */ "BR-64 door: policyRefused via PET",
		/* 64 */ "BR-65 door: policyRefused via DEPENDENTS (adults-only site)",
		/* 65 */ "BR-66 door: refused because !isOpenAt (closed; NO counter)",
		/* 66 */ "BR-67 door: refused on CAPACITY (admit() returned false)",
		/* 67 */ "BR-68 door: belief recorded under L1",
		/* 68 */ "BR-69 door: belief recorded under L0 (policy refusal only)",
		/* 69 */ "BR-70 door: NO belief recorded (L0 capacity/closed refusal)",
		/* 70 */ "BR-71 door: L0 cap fired (retargetCount > 8 -> REFUSED_ALL_FULL)",
		/* 71 */ "BR-72 door: priority arrival (isPriorityForAdmission == true)",
	};

	public static final int BR_AWARE_INIT = 0;
	public static final int BR_UNAWARE_INIT = 1;
	public static final int BR_PACE_ON = 2;
	public static final int BR_PACE_OFF = 3;
	public static final int BR_NEWHOUR = 4;
	public static final int BR_SAMEHOUR = 5;
	public static final int BR_CUE_FIRES = 6;
	public static final int BR_CUE_ZERO = 7;
	public static final int BR_UNAWARE_BLOCK = 8;
	public static final int BR_D1 = 9;
	public static final int BR_D1_SKIP_LAMBDA = 10;
	public static final int BR_D1_SKIP_HOUR = 11;
	public static final int BR_CONVERTED = 12;
	public static final int BR_UNAWARE_RETURN = 13;
	public static final int BR_HAZARD_BRANCH = 14;
	public static final int BR_OPEN_TRUE = 15;
	public static final int BR_OPEN_FALSE = 16;
	public static final int BR_VULN_TRUE = 17;
	public static final int BR_VULN_FALSE = 18;
	public static final int BR_D2 = 19;
	public static final int BR_HAZARD_FIRED = 20;
	public static final int BR_HAZARD_WAIT = 21;
	public static final int BR_LATCH_A_FIRE = 22;
	public static final int BR_LATCH_A_WAIT = 23;
	public static final int BR_LATCH_B_FIRE = 24;
	public static final int BR_LATCH_B_WAIT = 25;
	public static final int BR_D1_THEN_D2 = 26;
	public static final int BR_REENTRY_L1 = 27;
	public static final int BR_REENTRY_L0 = 28;
	public static final int BR_REENTRY_BLOCKED = 29;
	public static final int BR_REENTRY_GRANTED = 30;
	public static final int BR_STUCK_HELD = 31;
	public static final int BR_STUCK_SERVED = 32;
	public static final int BR_SCAN_NOHIT = 33;
	public static final int BR_SCAN_HIT = 34;
	public static final int BR_PUSH_TRUE = 35;
	public static final int BR_PUSH_FALSE = 36;
	public static final int BR_D3 = 37;
	public static final int BR_STUCK_SET = 38;
	public static final int BR_PUSH_NO_STUCK = 39;
	public static final int BR_REROUTE = 40;
	public static final int BR_PLAN_L1 = 41;
	public static final int BR_PLAN_L0 = 42;
	public static final int BR_SKIP_OPERATING = 43;
	public static final int BR_SKIP_OPENAT = 44;
	public static final int BR_SKIP_TREE = 45;
	public static final int BR_SKIP_INF = 46;
	public static final int BR_SKIP_BELIEF_L1 = 47;
	public static final int BR_SKIP_BELIEF_L0 = 48;
	public static final int BR_CAP_NULL = 49;
	public static final int BR_CAP_SET = 50;
	public static final int BR_PICK_STRICT = 51;
	public static final int BR_PICK_TIE = 52;
	public static final int BR_TIE_NOT_TAKEN = 53;
	public static final int BR_L0_SPACE = 54;
	public static final int BR_L0_NOSPACE = 55;
	public static final int BR_TERM_REFUSED = 56;
	public static final int BR_TERM_UNREACH = 57;
	public static final int BR_V11_FIRST = 58;
	public static final int BR_V11_STALE = 59;
	public static final int BR_ROUTENODES_ON = 60;
	public static final int BR_ROUTENODES_OFF = 61;
	public static final int BR_DOOR_ADMIT = 62;
	public static final int BR_DOOR_PET = 63;
	public static final int BR_DOOR_DEP = 64;
	public static final int BR_DOOR_CLOSED = 65;
	public static final int BR_DOOR_CAPACITY = 66;
	public static final int BR_BELIEF_L1 = 67;
	public static final int BR_BELIEF_L0 = 68;
	public static final int BR_BELIEF_NONE = 69;
	public static final int BR_CAP_FIRED = 70;
	public static final int BR_PRIORITY = 71;

	private static final long[] COUNT = new long[BRANCHES.length];

	public static long count(int branch) {
		return COUNT[branch];
	}

	public static void resetCounts() {
		java.util.Arrays.fill(COUNT, 0L);
	}

	/**
	 * Sets a counter the instrumentation cannot observe directly. Used for exactly
	 * one branch: BR-60 ("V11 already set") has no statement of its own — it is the
	 * complement of BR-59 inside the {@code isNaN} guard — so the driver derives it
	 * as {@code picks - firsts} rather than the probe inventing a hook for a branch
	 * the certified code does not execute.
	 */
	public static void setCount(int branch, long value) {
		COUNT[branch] = value;
	}

	private static void hit(int branch) {
		COUNT[branch]++;
	}

	// ---------------------------------------------------------- run state

	/** Master switch; false makes every hook a two-instruction no-op. */
	public static boolean enabled;

	private static Emitter emitter;
	/** Resident creation index currently being stepped (set by the driver). */
	private static int agentIdx = -1;
	/** The object the driver says is being stepped; hooks assert identity. */
	private static Object agentRef;
	/** True when this resident's rows are wanted for the whole run (cohort). */
	private static boolean cohort;
	/** Config/seed prefix written into every row. */
	private static String runPrefix = "";
	/** Hours below this are dumped for EVERY resident. */
	public static int earlyHours = 12;
	/** Cohort selector modulus (see {@link #inCohort}). */
	public static int cohortMod = 64;

	private static long rowsWritten;
	private static long rowBudget = Long.MAX_VALUE;
	private static boolean budgetTripped;

	/** Draw-site tag consumed by {@link RecordingRandom}; "?" means unaccounted. */
	static String drawSite = "?";
	// Draw attribution is measured across each site's OWN before/after hook pair,
	// never across a whole hour: `afterOutreach` fires on every tick an UNAWARE
	// resident is stepped (it sits inside `if (state == UNAWARE)`, not inside
	// `if (newHour)`), so an hour-scoped delta would re-count the same D1 draw on
	// each of the 59 following ticks.
	private static int outreachDrawsBefore;
	private static int hazardDrawsBefore;
	private static boolean d1FiredThisTick;

	public static void configure(Emitter e, String runPrefix, int earlyHours, int cohortMod,
			long rowBudget) {
		DecisionProbe.emitter = e;
		DecisionProbe.runPrefix = runPrefix;
		DecisionProbe.earlyHours = earlyHours;
		DecisionProbe.cohortMod = cohortMod;
		DecisionProbe.rowBudget = rowBudget;
		DecisionProbe.rowsWritten = 0;
		DecisionProbe.budgetTripped = false;
		DecisionProbe.drawSite = "?";
	}

	/**
	 * THE SAMPLING RULE, half 1. A resident is in the whole-run cohort iff
	 * {@code ((i * 2654435761) mod 2^32) mod cohortMod == 0}. Knuth's
	 * multiplicative constant scatters consecutive indices, so the cohort is not
	 * a stride artefact of camp assignment; the arithmetic stays exact in an IEEE
	 * double for every i &lt; 2^21, so a TypeScript port reproduces it with
	 * {@code ((i * 2654435761) % 4294967296) % mod === 0}.
	 */
	public static boolean inCohort(int index) {
		long h = ((long) index * 2654435761L) & 0xFFFFFFFFL;
		return h % cohortMod == 0L;
	}

	/** Called by the driver immediately before {@code agent.step()}. */
	public static void beginAgent(int index, Object agent, RecordingRandom rng) {
		agentIdx = index;
		agentRef = agent;
		cohort = inCohort(index);
		RecordingRandom.current = rng;
		if (rng != null) {
			rng.bind(index, cohort, runPrefix);
		}
	}

	public static void endAgent() {
		agentIdx = -1;
		agentRef = null;
		RecordingRandom.current = null;
	}

	public static int currentAgent() {
		return agentIdx;
	}

	public static boolean currentIsCohort() {
		return cohort;
	}

	public static long rowsWritten() {
		return rowsWritten;
	}

	public static boolean budgetTripped() {
		return budgetTripped;
	}

	private static void check(Object agent) {
		if (agent != agentRef) {
			throw new IllegalStateException("DecisionProbe: hook fired for an agent the driver "
					+ "did not announce (index " + agentIdx + ") -- the trace would be mislabelled");
		}
	}

	/** Per-draw row from {@link RecordingRandom}; same budget as every other row. */
	static void emitDraw(String line) {
		emit(S_DRAW, line);
	}

	private static void emit(int stream, String line) {
		if (emitter == null) {
			return;
		}
		if (rowsWritten >= rowBudget) {
			budgetTripped = true;
			return;
		}
		rowsWritten++;
		emitter.row(stream, line);
	}

	// ------------------------------------------------------------- hex I/O

	private static final char[] HEX = "0123456789abcdef".toCharArray();

	/** Raw IEEE-754 bits of a double as 16 lowercase hex digits. */
	public static String hx(double v) {
		return hxl(Double.doubleToRawLongBits(v));
	}

	/** Two's-complement bits of a long as 16 lowercase hex digits. */
	public static String hxl(long bits) {
		char[] c = new char[16];
		for (int i = 15; i >= 0; i--) {
			c[i] = HEX[(int) (bits & 0xFL)];
			bits >>>= 4;
		}
		return new String(c);
	}

	private static String b(boolean v) {
		return v ? "1" : "0";
	}

	// =====================================================================
	// HOOKS. Every argument below is a local/field/parameter already computed
	// by the certified statement above the insertion point, or a pure
	// certified accessor. Nothing here re-derives a model value.
	// =====================================================================

	/** {@code setDecisionLayer} tail: the armed per-agent constants. */
	public static void armed(Object agent, boolean awareInitial, boolean heavyBelongings,
			boolean hasPet, boolean hasDependents, double thetaZ, double groupSpeedDeltaMps,
			long decisionSeed, double thetaScaled, double barrierCost, String state,
			double awareTick) {
		if (!enabled) {
			return;
		}
		check(agent);
		hit(awareInitial ? BR_AWARE_INIT : BR_UNAWARE_INIT);
		// BR-03 is owned by pace(); only its complement is counted here, once per
		// resident, because the skipped branch executes no statement to hook.
		if (groupSpeedDeltaMps <= 0.0) {
			hit(BR_PACE_OFF);
		}
		emit(S_ARM, runPrefix + agentIdx + "\t" + b(awareInitial) + "\t" + b(heavyBelongings)
				+ "\t" + b(hasPet) + "\t" + b(hasDependents) + "\t" + hx(thetaZ)
				+ "\t" + hx(groupSpeedDeltaMps) + "\t" + decisionSeed + "\t" + hx(thetaScaled)
				+ "\t" + hx(barrierCost) + "\t" + state + "\t" + hx(awareTick));
	}

	/** Block 3, inside the guard: the group-paced speed actually used this tick. */
	public static void pace(Object agent, double walkingSpeedMps, double delta) {
		if (!enabled) {
			return;
		}
		check(agent);
		hit(BR_PACE_ON);
	}

	/** Block 6b: the hour bucket, before {@code lastDecisionHour} advances. */
	public static void hourBucket(Object agent, double tick, int hour, boolean newHour,
			int lastDecisionHour, String state, double cNow, double zR) {
		if (!enabled) {
			return;
		}
		check(agent);
		d1FiredThisTick = false;
		hit(newHour ? BR_NEWHOUR : BR_SAMEHOUR);
		if (!newHour) {
			return;
		}
		if ("UNAWARE".equals(state)) {
			hit(BR_UNAWARE_BLOCK);
		}
		if (cohort || hour < earlyHours) {
			emit(S_HOUR, runPrefix + agentIdx + "\t" + hour + "\t" + (long) tick + "\t"
					+ lastDecisionHour + "\t" + state + "\t" + hx(cNow) + "\t" + hx(zR));
		}
	}

	/** Block 6c: {@code zR} after decay + increment, with the decay factor. */
	public static void riskUpdate(Object agent, double tick, int hour, double cNow, double decay,
			double zR) {
		if (!enabled) {
			return;
		}
		check(agent);
		hit(cNow >= 55.5 ? BR_CUE_FIRES : BR_CUE_ZERO);
		if (cohort || hour < earlyHours) {
			emit(S_HOUR, runPrefix + agentIdx + "\tzr\t" + hour + "\t" + hx(cNow) + "\t"
					+ hx(decay) + "\t" + hx(zR));
		}
	}

	/** Block 6d: about to evaluate the D1 short-circuit chain. */
	public static void beforeOutreach(Object agent, double tick, int hour, boolean newHour,
			double lambdaOutreachPerDay) {
		if (!enabled) {
			return;
		}
		check(agent);
		drawSite = "D1";
		outreachDrawsBefore = RecordingRandom.currentDrawCount();
		// Short-circuit order of GisAgent.java:385-386, counted exactly once per
		// UNAWARE agent-tick: this hook fires iff state == UNAWARE.
		if (!newHour) {
			hit(BR_D1_SKIP_HOUR);
		} else if (lambdaOutreachPerDay <= 0.0) {
			hit(BR_D1_SKIP_LAMBDA);
		}
	}

	/** Block 6d tail: the state after the outreach chain ran (or did not). */
	public static void afterOutreach(Object agent, double tick, int hour, String state,
			double awareTick) {
		if (!enabled) {
			return;
		}
		check(agent);
		d1FiredThisTick = RecordingRandom.currentDrawCount() - outreachDrawsBefore > 0;
		if (d1FiredThisTick) {
			hit(BR_D1);
		}
		if ("PRE_EVAC".equals(state)) {
			hit(BR_CONVERTED);
			emit(S_TRANSITION, runPrefix + agentIdx + "\t" + (long) tick + "\tUNAWARE\tPRE_EVAC"
					+ "\toutreach\t" + hx(awareTick));
		} else {
			hit(BR_UNAWARE_RETURN);
		}
		drawSite = "?";
	}

	/** Block 6e: the complete logistic, term inputs and result, before the draw. */
	public static void hazard(Object agent, double tick, int hour, boolean open, boolean vulnerable,
			double bRiskEff, double zR, double thetaScaled, double barrierCost, double u, double p) {
		if (!enabled) {
			return;
		}
		check(agent);
		hit(BR_HAZARD_BRANCH);
		hit(open ? BR_OPEN_TRUE : BR_OPEN_FALSE);
		hit(vulnerable ? BR_VULN_TRUE : BR_VULN_FALSE);
		drawSite = "D2";
		hazardDrawsBefore = RecordingRandom.currentDrawCount();
		if (cohort || hour < earlyHours) {
			emit(S_HOUR, runPrefix + agentIdx + "\thz\t" + hour + "\t" + (long) tick + "\t"
					+ b(open) + "\t" + b(vulnerable) + "\t" + hx(bRiskEff) + "\t" + hx(zR)
					+ "\t" + hx(thetaScaled) + "\t" + hx(barrierCost) + "\t" + hx(u) + "\t"
					+ hx(p));
		}
	}

	/** Block 6e tail: whether the Bernoulli fired, evaluated after the guard. */
	public static void afterHazard(Object agent, double tick, int hour, String state,
			double evacuationTick) {
		if (!enabled) {
			return;
		}
		check(agent);
		if (RecordingRandom.currentDrawCount() - hazardDrawsBefore > 0) {
			hit(BR_D2);
			if (d1FiredThisTick) {
				hit(BR_D1_THEN_D2);
			}
		}
		if ("EN_ROUTE".equals(state)) {
			hit(BR_HAZARD_FIRED);
			emit(S_TRANSITION, runPrefix + agentIdx + "\t" + (long) tick + "\tPRE_EVAC\tEN_ROUTE"
					+ "\thazard\t" + hx(evacuationTick));
		} else {
			hit(BR_HAZARD_WAIT);
		}
		drawSite = "?";
	}

	/** Latch sites A ({@code layer on, hazard off}) and B ({@code layer off}). */
	public static void latch(Object agent, double tick, String site, double cNow,
			double evacThreshold, boolean fired) {
		if (!enabled) {
			return;
		}
		check(agent);
		if ("A".equals(site)) {
			hit(fired ? BR_LATCH_A_FIRE : BR_LATCH_A_WAIT);
		} else {
			hit(fired ? BR_LATCH_B_FIRE : BR_LATCH_B_WAIT);
		}
		if (fired) {
			emit(S_TRANSITION, runPrefix + agentIdx + "\t" + (long) tick + "\tPRE_EVAC\tEN_ROUTE"
					+ "\tlatch" + site + "\t" + hx(cNow) + "\t" + hx(evacThreshold));
		}
	}

	/** Block 7: the L1/L0 fork of the REFUSED_ALL_FULL re-entry test. */
	public static void refusedReentry(Object agent, double tick, boolean useL1,
			boolean somewhereToTry, int retargetCount) {
		if (!enabled) {
			return;
		}
		check(agent);
		hit(useL1 ? BR_REENTRY_L1 : BR_REENTRY_L0);
		hit(somewhereToTry ? BR_REENTRY_GRANTED : BR_REENTRY_BLOCKED);
		if (somewhereToTry) {
			emit(S_TRANSITION, runPrefix + agentIdx + "\t" + (long) tick
					+ "\tREFUSED_ALL_FULL\tEN_ROUTE\treentry" + (useL1 ? "L1" : "L0") + "\t"
					+ retargetCount);
		}
	}

	public static void stuckHeld(Object agent, double tick, double stuckUntilTick) {
		if (!enabled) {
			return;
		}
		check(agent);
		hit(BR_STUCK_HELD);
	}

	public static void stuckServed(Object agent, double tick) {
		if (!enabled) {
			return;
		}
		check(agent);
		hit(BR_STUCK_SERVED);
		emit(S_CLOSURE, runPrefix + agentIdx + "\t" + (long) tick + "\tstuck-served");
	}

	/** Block 11: which chooser is about to run, at the group-paced speed. */
	public static void planning(Object agent, double tick, boolean useL1, double walkingSpeedMps,
			long currentNodeId, String state) {
		if (!enabled) {
			return;
		}
		check(agent);
		hit(useL1 ? BR_PLAN_L1 : BR_PLAN_L0);
		if (cohort) {
			emit(S_CHOICE, runPrefix + agentIdx + "\t" + (long) tick + "\tplan\t"
					+ (useL1 ? "L1" : "L0") + "\t" + hx(walkingSpeedMps) + "\t" + currentNodeId);
		}
	}

	// ---- choosers -------------------------------------------------------

	public static void candSeen(Object agent, double tick, String regime, String id,
			boolean operating, boolean openAt, boolean treeNull) {
		if (!enabled) {
			return;
		}
		check(agent);
		if (!operating) {
			hit(BR_SKIP_OPERATING);
		} else if (!openAt) {
			hit(BR_SKIP_OPENAT);
		} else if (treeNull) {
			hit(BR_SKIP_TREE);
		}
	}

	public static void candReachable(Object agent, double tick, String regime, String id,
			double dM) {
		if (!enabled) {
			return;
		}
		check(agent);
	}

	public static void candSkipInfinite(Object agent, double tick, String regime, String id,
			double dM) {
		if (!enabled) {
			return;
		}
		check(agent);
		hit(BR_SKIP_INF);
	}

	public static void candBeliefSkip(Object agent, double tick, String regime, String id) {
		if (!enabled) {
			return;
		}
		check(agent);
		hit("L1".equals(regime) ? BR_SKIP_BELIEF_L1 : BR_SKIP_BELIEF_L0);
	}

	/** L1 utility for one candidate: every input local, plus the running best. */
	public static void candUtility(Object agent, double tick, String id, double dM, double cap,
			double ownSpeedMps, double walkTimeH, double v, double bestV, String bestId) {
		if (!enabled) {
			return;
		}
		check(agent);
		hit(cap == 10000.0 ? BR_CAP_NULL : BR_CAP_SET);
		if (v > bestV) {
			hit(BR_PICK_STRICT);
		} else if (v == bestV && !bestId.isEmpty()) {
			hit(id.compareTo(bestId) < 0 ? BR_PICK_TIE : BR_TIE_NOT_TAKEN);
		}
		if (cohort) {
			emit(S_CHOICE, runPrefix + agentIdx + "\t" + (long) tick + "\tv\t" + id + "\t"
					+ hx(dM) + "\t" + hx(cap) + "\t" + hx(ownSpeedMps) + "\t" + hx(walkTimeH)
					+ "\t" + hx(v) + "\t" + hx(bestV) + "\t" + bestId);
		}
	}

	/** L0 candidate after the belief filter, before the space + distance test. */
	public static void candL0(Object agent, double tick, String id, double dM, double bestDistM,
			boolean hasSpace) {
		if (!enabled) {
			return;
		}
		check(agent);
		hit(hasSpace ? BR_L0_SPACE : BR_L0_NOSPACE);
		if (cohort) {
			emit(S_CHOICE, runPrefix + agentIdx + "\t" + (long) tick + "\td\t" + id + "\t"
					+ hx(dM) + "\t" + hx(bestDistM) + "\t" + b(hasSpace));
		}
	}

	public static void chooserPicked(Object agent, double tick, String regime, String id,
			double bestDistM, double bestV, int pathSize, boolean routeNodes,
			double networkDistToShelterM, double plannedRouteM) {
		if (!enabled) {
			return;
		}
		check(agent);
		hit(routeNodes ? BR_ROUTENODES_ON : BR_ROUTENODES_OFF);
		emit(S_CHOICE, runPrefix + agentIdx + "\t" + (long) tick + "\tpick\t" + regime + "\t"
				+ id + "\t" + hx(bestDistM) + "\t" + hx(bestV) + "\t" + pathSize + "\t"
				+ b(routeNodes) + "\t" + hx(networkDistToShelterM) + "\t" + hx(plannedRouteM));
	}

	/** Inside the {@code Double.isNaN(networkDistToShelterM)} guard: V11's one write. */
	public static void v11First(Object agent) {
		if (!enabled) {
			return;
		}
		check(agent);
		hit(BR_V11_FIRST);
	}

	public static void chooserTerminal(Object agent, double tick, String regime, String state) {
		if (!enabled) {
			return;
		}
		check(agent);
		hit("UNREACHABLE".equals(state) ? BR_TERM_UNREACH : BR_TERM_REFUSED);
		emit(S_TRANSITION, runPrefix + agentIdx + "\t" + (long) tick + "\tEN_ROUTE\t" + state
				+ "\tchooser" + regime + "\t");
	}

	// ---- the door -------------------------------------------------------

	public static void doorArrival(Object agent, double tick, String id, boolean policyRefused,
			boolean openAt, boolean priority, Object petIntake, boolean adultsOnly, Object capacity,
			int occupancy, boolean hasPet, boolean hasDependents, boolean petAdmitted) {
		if (!enabled) {
			return;
		}
		check(agent);
		if (priority) {
			hit(BR_PRIORITY);
		}
		if (policyRefused) {
			if (hasPet && !petAdmitted) {
				hit(BR_DOOR_PET);
			}
			if (hasDependents && adultsOnly) {
				hit(BR_DOOR_DEP);
			}
		}
		emit(S_DOOR, runPrefix + agentIdx + "\t" + (long) tick + "\t" + id + "\t"
				+ b(policyRefused) + "\t" + b(openAt) + "\t" + b(priority) + "\t"
				+ (petIntake == null ? "unrecorded" : (Boolean.TRUE.equals(petIntake)
						? "admit" : "refuse")) + "\t" + b(adultsOnly) + "\t"
				+ (capacity == null ? "" : capacity.toString()) + "\t" + occupancy + "\t"
				+ b(hasPet) + "\t" + b(hasDependents) + "\t" + b(petAdmitted));
	}

	public static void doorAdmitted(Object agent, double tick, String id, double arrivalTick) {
		if (!enabled) {
			return;
		}
		check(agent);
		hit(BR_DOOR_ADMIT);
		emit(S_TRANSITION, runPrefix + agentIdx + "\t" + (long) tick + "\tEN_ROUTE\tSHELTERED"
				+ "\tadmit\t" + id);
	}

	public static void doorRefused(Object agent, double tick, String id, boolean policyRefused,
			boolean openAt, boolean useL1) {
		if (!enabled) {
			return;
		}
		check(agent);
		if (!policyRefused && !openAt) {
			hit(BR_DOOR_CLOSED);
		} else if (!policyRefused) {
			hit(BR_DOOR_CAPACITY);
		}
		if (useL1) {
			hit(BR_BELIEF_L1);
		} else if (policyRefused) {
			hit(BR_BELIEF_L0);
		} else {
			hit(BR_BELIEF_NONE);
		}
		emit(S_DOOR, runPrefix + agentIdx + "\t" + (long) tick + "\trefused\t" + id + "\t"
				+ b(policyRefused) + "\t" + b(openAt) + "\t" + b(useL1));
	}

	public static void afterRefusal(Object agent, double tick, int retargetCount, boolean useL1,
			String state) {
		if (!enabled) {
			return;
		}
		check(agent);
		if ("REFUSED_ALL_FULL".equals(state)) {
			hit(BR_CAP_FIRED);
			emit(S_TRANSITION, runPrefix + agentIdx + "\t" + (long) tick
					+ "\tEN_ROUTE\tREFUSED_ALL_FULL\tretargetCap\t" + retargetCount);
		}
	}

	// ---- closure wave ---------------------------------------------------

	public static void closureScan(Object agent, double tick, boolean hitFound, int hitIndex,
			int seenClosureVersion) {
		if (!enabled) {
			return;
		}
		check(agent);
		hit(hitFound ? BR_SCAN_HIT : BR_SCAN_NOHIT);
		emit(S_CLOSURE, runPrefix + agentIdx + "\t" + (long) tick + "\tscan\t" + b(hitFound)
				+ "\t" + hitIndex + "\t" + seenClosureVersion);
	}

	public static void pushRule(Object agent, double tick, boolean push, double thetaScaled,
			double pushThetaThreshold, double kPush, double barrierCost, double mobilityPenalty) {
		if (!enabled) {
			return;
		}
		check(agent);
		hit(push ? BR_PUSH_TRUE : BR_PUSH_FALSE);
		emit(S_CLOSURE, runPrefix + agentIdx + "\t" + (long) tick + "\tpushrule\t" + b(push)
				+ "\t" + hx(thetaScaled) + "\t" + hx(pushThetaThreshold) + "\t" + hx(kPush)
				+ "\t" + hx(barrierCost) + "\t" + hx(mobilityPenalty));
	}

	public static void beforeStuckDraw(Object agent, double tick, double pStuck) {
		if (!enabled) {
			return;
		}
		check(agent);
		drawSite = "D3";
		hit(BR_D3);
	}

	public static void stuckSet(Object agent, double tick, double stuckUntilTick,
			double stuckDelayH, double minutesPerTick) {
		if (!enabled) {
			return;
		}
		check(agent);
		hit(BR_STUCK_SET);
		emit(S_CLOSURE, runPrefix + agentIdx + "\t" + (long) tick + "\tstuck\t"
				+ hx(stuckUntilTick) + "\t" + hx(stuckDelayH) + "\t" + hx(minutesPerTick));
	}

	public static void afterStuckDraw(Object agent, double tick, double stuckUntilTick) {
		if (!enabled) {
			return;
		}
		check(agent);
		if (Double.isNaN(stuckUntilTick)) {
			hit(BR_PUSH_NO_STUCK);
		}
		drawSite = "?";
	}

	public static void reroute(Object agent, double tick, int lastReached, long currentNodeId) {
		if (!enabled) {
			return;
		}
		check(agent);
		hit(BR_REROUTE);
		emit(S_CLOSURE, runPrefix + agentIdx + "\t" + (long) tick + "\treroute\t" + lastReached
				+ "\t" + currentNodeId);
	}
}
