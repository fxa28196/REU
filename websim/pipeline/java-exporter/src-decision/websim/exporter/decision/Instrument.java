package websim.exporter.decision;

import java.io.File;
import java.io.IOException;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;

/**
 * Generates the <b>instrumented</b> copy of {@code geography/agents/GisAgent.java}
 * under {@code websim/pipeline/java-exporter/gen-src/}.
 *
 * <p><b>Why a source probe rather than a re-implementation.</b> Three of the
 * quantities WP8 has to compare bit-for-bit — the hazard log-odds {@code u}, the
 * logistic {@code p}, and the per-candidate L1 utility {@code v} — are
 * <i>step-local variables</i>. They are never stored on the agent and never
 * exported, so no amount of reflection can read them from outside. The only two
 * ways to obtain them are (a) to recompute them in the dumper, which is exactly
 * the circular oracle this project forbids, or (b) to read them out of the
 * certified frame that computed them. This class does (b).
 *
 * <p><b>The patch contract, enforced here, not asserted:</b>
 * <ol>
 *   <li>The certified source is opened <b>read-only</b>; the generated copy lands
 *       under {@code websim/} and is regenerated from scratch every build.</li>
 *   <li>Every rule is anchored by <b>line number AND the exact trimmed text of a
 *       2–3 line context window</b>. If the certified file moves by one line, or
 *       one character of an anchored statement changes, the build fails loudly
 *       instead of silently probing the wrong expression.</li>
 *   <li>Every inserted line is a single call to
 *       {@code websim.exporter.decision.DecisionProbe.*} and nothing else.</li>
 *   <li><b>Only insertions.</b> After writing, the generated file is re-read, the
 *       lines that begin with the probe prefix are removed, and the remainder is
 *       compared to the certified source <b>byte for byte</b>. A single altered
 *       or deleted certified byte fails the build.</li>
 *   <li>An audit file lists every inserted line beside its anchor, so a reviewer
 *       can check rule 3 by eye in one screen.</li>
 * </ol>
 *
 * <p>Behaviour-neutrality is not claimed on the strength of the above: the driver
 * is run twice, against the certified classes and against these, and the
 * end-of-run per-agent state dumps must be byte-identical
 * ({@code dump-decision-trace.ps1 -Neutrality}).
 */
public final class Instrument {

	private Instrument() { }

	private static final String PROBE = "websim.exporter.decision.DecisionProbe.";

	/** One insertion: after {@code line}, whose trailing context must match. */
	private static final class Rule {
		final int line;
		final String[] context;
		final String insert;

		Rule(int line, String[] context, String insert) {
			this.line = line;
			this.context = context;
			this.insert = insert;
		}
	}

	private static final List<Rule> RULES = new ArrayList<Rule>();

	private static void r(int line, String[] context, String insert) {
		RULES.add(new Rule(line, context, insert));
	}

	static {
		// ---- setDecisionLayer: the armed per-agent constants -----------------
		r(958, new String[] {
			"this.state = State.UNAWARE;",
			"this.awareTick = Double.NaN;",
			"}" },
			PROBE + "armed(this, decisionAttributes.awareInitial, decisionAttributes.heavyBelongings,"
			+ " decisionAttributes.hasPet, decisionAttributes.hasDependents, decisionAttributes.thetaZ,"
			+ " decisionAttributes.groupSpeedDeltaMps, decisionAttributes.decisionSeed, thetaScaled,"
			+ " barrierCost, state.name(), awareTick);");

		// ---- block 3: group pace (V34) --------------------------------------
		r(323, new String[] {
			"&& decisionAttributes.groupSpeedDeltaMps > 0.0) {",
			"walkingSpeedMps = Math.max(0.40,",
			"walkingSpeedMps - decisionAttributes.groupSpeedDeltaMps);" },
			PROBE + "pace(this, walkingSpeedMps, decisionAttributes.groupSpeedDeltaMps);");

		// ---- block 6b: the hour bucket --------------------------------------
		r(372, new String[] {
			"int hour = (int) Math.floor(tick * minutesPerTick / 60.0);",
			"boolean newHour = hour > lastDecisionHour;" },
			PROBE + "hourBucket(this, tick, hour, newHour, lastDecisionHour, state.name(), cNow, zR);");

		// ---- block 6c: z_R decay + increment --------------------------------
		r(379, new String[] {
			"double decay = Math.pow(2.0, -1.0 / decisionConfig.riskHalfLifeH);",
			"zR = zR * decay + (cNow >= UNHEALTHY_UGM3 ? 1.0 / 24.0 : 0.0);" },
			PROBE + "riskUpdate(this, tick, hour, cNow, decay, zR);");

		// ---- block 6d: D1 outreach ------------------------------------------
		r(384, new String[] {
			"// on this agent's private stream.",
			"if (state == State.UNAWARE) {" },
			PROBE + "beforeOutreach(this, tick, hour, newHour, decisionConfig.lambdaOutreachPerDay);");
		r(389, new String[] {
			"state = State.PRE_EVAC;   // now aware (spec: AWARE_IDLE)",
			"awareTick = tick;",
			"}" },
			PROBE + "afterOutreach(this, tick, hour, state.name(), awareTick);");

		// ---- block 6e: the logistic hazard and D2 ---------------------------
		r(413, new String[] {
			"+ decisionConfig.wOfficial * (open ? 1.0 : 0.0)",
			"+ thetaScaled - barrierCost;",
			"double p = 1.0 / (1.0 + Math.exp(-u));" },
			PROBE + "hazard(this, tick, hour, open, vulnerable, bRiskEff, zR, thetaScaled,"
			+ " barrierCost, u, p);");
		r(417, new String[] {
			"state = State.EN_ROUTE;",
			"evacuationTick = tick;",
			"}" },
			PROBE + "afterHazard(this, tick, hour, state.name(), evacuationTick);");

		// ---- block 6f/6g: latch sites A (layer on) and B (layer off) --------
		r(428, new String[] {
			"if (cNow >= evacThreshold && anyShelterOpen(context, tick)) {",
			"state = State.EN_ROUTE;",
			"evacuationTick = tick;" },
			PROBE + "latch(this, tick, \"A\", cNow, evacThreshold, true);");
		r(429, new String[] {
			"evacuationTick = tick;",
			"} else {" },
			PROBE + "latch(this, tick, \"A\", cNow, evacThreshold, false);");
		r(443, new String[] {
			"if (cNow >= evacThreshold && anyShelterOpen(context, tick)) {",
			"state = State.EN_ROUTE;",
			"evacuationTick = tick;" },
			PROBE + "latch(this, tick, \"B\", cNow, evacThreshold, true);");
		r(444, new String[] {
			"evacuationTick = tick;",
			"} else {" },
			PROBE + "latch(this, tick, \"B\", cNow, evacThreshold, false);");

		// ---- block 7: REFUSED_ALL_FULL re-entry, L1/L0 fork -----------------
		r(468, new String[] {
			"boolean somewhereToTry = useL1()",
			"? anyUntriedReachableShelter(context, tick)",
			": anyShelterAvailable(context, tick);" },
			PROBE + "refusedReentry(this, tick, useL1(), somewhereToTry, retargetCount);");

		// ---- block 9: the stuck check ---------------------------------------
		r(489, new String[] {
			"if (!Double.isNaN(stuckUntilTick)) {",
			"if (tick < stuckUntilTick) {" },
			PROBE + "stuckHeld(this, tick, stuckUntilTick);");
		r(493, new String[] {
			"}",
			"stuckUntilTick = Double.NaN; // delay served; resume the pushed path" },
			PROBE + "stuckServed(this, tick);");

		// ---- block 11: planning ---------------------------------------------
		r(507, new String[] {
			"// --- Routing (capacity-aware under L0; belief-aware under L1) --------",
			"if (routePath == null) {" },
			PROBE + "planning(this, tick, useL1(), walkingSpeedMps, currentNodeId, state.name());");

		// ---- block 13: the door ---------------------------------------------
		r(553, new String[] {
			"boolean policyRefused = decisionConfig != null && decisionAttributes != null",
			"&& ((decisionAttributes.hasPet && !petAdmittedAt(targetShelter))",
			"|| (decisionAttributes.hasDependents && targetShelter.isAdultsOnly()));" },
			PROBE + "doorArrival(this, tick, targetShelter.getId(), policyRefused,"
			+ " targetShelter.isOpenAt(tick), isPriorityForAdmission(), targetShelter.getPetIntake(),"
			+ " targetShelter.isAdultsOnly(), targetShelter.getCapacity(),"
			+ " targetShelter.getOccupancy(), decisionAttributes != null && decisionAttributes.hasPet,"
			+ " decisionAttributes != null && decisionAttributes.hasDependents,"
			+ " decisionConfig != null && petAdmittedAt(targetShelter));");
		r(557, new String[] {
			"&& targetShelter.admit(isPriorityForAdmission())) {",
			"state = State.SHELTERED;",
			"arrivalTick = tick;" },
			PROBE + "doorAdmitted(this, tick, targetShelter.getId(), arrivalTick);");
		r(558, new String[] {
			"arrivalTick = tick;",
			"} else {" },
			PROBE + "doorRefused(this, tick, targetShelter.getId(), policyRefused,"
			+ " targetShelter.isOpenAt(tick), useL1());");
		r(590, new String[] {
			"if (!useL1() && retargetCount > MAX_RETARGETS) {",
			"state = State.REFUSED_ALL_FULL;",
			"}" },
			PROBE + "afterRefusal(this, tick, retargetCount, useL1(), state.name());");

		// ---- chooseNetworkNearestShelter (L0) --------------------------------
		r(610, new String[] {
			"for (Object obj : context.getObjects(Shelter.class)) {",
			"Shelter shelter = (Shelter) obj;" },
			PROBE + "candSeen(this, tick, \"L0\", shelter.getId(), shelter.isOperating(),"
			+ " shelter.isOpenAt(tick), shelter.getRouteTree() == null);");
		r(616, new String[] {
			"double dM = shelter.getRouteTree().distanceTo(currentNodeId);",
			"if (Double.isInfinite(dM)) {" },
			PROBE + "candSkipInfinite(this, tick, \"L0\", shelter.getId(), dM);");
		r(619, new String[] {
			"continue;",
			"}",
			"anyReachable = true;" },
			PROBE + "candReachable(this, tick, \"L0\", shelter.getId(), dM);");
		r(620, new String[] {
			"anyReachable = true;",
			"if (excludedByBelief(shelter)) {" },
			PROBE + "candBeliefSkip(this, tick, \"L0\", shelter.getId());");
		r(622, new String[] {
			"continue;   // already turned this resident away on policy (L0)",
			"}" },
			PROBE + "candL0(this, tick, shelter.getId(), dM, bestDistM,"
			+ " shelter.hasSpaceFor(isPriorityForAdmission()));");
		r(636, new String[] {
			"// shelter you can actually reach\"). Post-refusal legs do not",
			"// overwrite it; total planned walking is plannedRouteM.",
			"networkDistToShelterM = bestDistM;" },
			PROBE + "v11First(this);");
		r(646, new String[] {
			"routeNodes = network.hasClosureSchedule()",
			"? network.nodesToSource(best.getRouteTree(), currentNodeId) : null;",
			"seenClosureVersion = network.getClosureVersion();" },
			PROBE + "chooserPicked(this, tick, \"L0\", best.getId(), bestDistM, Double.NaN,"
			+ " routePath.size(), routeNodes != null, networkDistToShelterM, plannedRouteM);");
		r(648, new String[] {
			"} else if (anyReachable) {",
			"state = State.REFUSED_ALL_FULL;" },
			PROBE + "chooserTerminal(this, tick, \"L0\", \"REFUSED_ALL_FULL\");");
		r(650, new String[] {
			"} else {",
			"state = State.UNREACHABLE;" },
			PROBE + "chooserTerminal(this, tick, \"L0\", \"UNREACHABLE\");");

		// ---- chooseShelterByUtility (L1) ------------------------------------
		r(700, new String[] {
			"for (Object obj : context.getObjects(Shelter.class)) {",
			"Shelter shelter = (Shelter) obj;" },
			PROBE + "candSeen(this, tick, \"L1\", shelter.getId(), shelter.isOperating(),"
			+ " shelter.isOpenAt(tick), shelter.getRouteTree() == null);");
		r(706, new String[] {
			"double dM = shelter.getRouteTree().distanceTo(currentNodeId);",
			"if (Double.isInfinite(dM)) {" },
			PROBE + "candSkipInfinite(this, tick, \"L1\", shelter.getId(), dM);");
		r(709, new String[] {
			"continue;",
			"}",
			"anyReachable = true;" },
			PROBE + "candReachable(this, tick, \"L1\", shelter.getId(), dM);");
		r(710, new String[] {
			"anyReachable = true;",
			"if (believedFull.contains(shelter.getId())) {" },
			PROBE + "candBeliefSkip(this, tick, \"L1\", shelter.getId());");
		r(717, new String[] {
			"double walkTimeH = dM / (ownSpeedMps * 3600.0);",
			"double v = -decisionConfig.betaTravelTime * walkTimeH",
			"+ decisionConfig.betaCapacityPrior * Math.log(Math.max(1.0, cap));" },
			PROBE + "candUtility(this, tick, shelter.getId(), dM, cap, ownSpeedMps, walkTimeH, v,"
			+ " bestV, best == null ? \"\" : best.getId());");
		r(729, new String[] {
			"if (Double.isNaN(networkDistToShelterM)) {",
			"networkDistToShelterM = bestDistM;   // V11, first selection only" },
			PROBE + "v11First(this);");
		r(737, new String[] {
			"routeNodes = network.hasClosureSchedule()",
			"? network.nodesToSource(best.getRouteTree(), currentNodeId) : null;",
			"seenClosureVersion = network.getClosureVersion();" },
			PROBE + "chooserPicked(this, tick, \"L1\", best.getId(), bestDistM, bestV,"
			+ " routePath.size(), routeNodes != null, networkDistToShelterM, plannedRouteM);");
		r(739, new String[] {
			"} else if (anyReachable) {",
			"state = State.REFUSED_ALL_FULL;" },
			PROBE + "chooserTerminal(this, tick, \"L1\", \"REFUSED_ALL_FULL\");");
		r(741, new String[] {
			"} else {",
			"state = State.UNREACHABLE;" },
			PROBE + "chooserTerminal(this, tick, \"L1\", \"UNREACHABLE\");");

		// ---- reactToClosureWave (Scenario E, V49-V51) -----------------------
		r(792, new String[] {
			"}",
			"if (hit < 0) {" },
			PROBE + "closureScan(this, tick, false, hit, seenClosureVersion);");
		r(795, new String[] {
			"}",
			"blockagesEncountered++;" },
			PROBE + "closureScan(this, tick, true, hit, seenClosureVersion);");
		r(801, new String[] {
			"push = thetaScaled >= decisionConfig.pushThetaThreshold",
			"+ decisionConfig.kPush * (barrierCost + mobilityPenalty);" },
			PROBE + "pushRule(this, tick, push, thetaScaled, decisionConfig.pushThetaThreshold,"
			+ " decisionConfig.kPush, barrierCost, mobilityPenalty);");
		r(815, new String[] {
			"pushedBlockages.add(pairKey(a, b));",
			"}",
			"}" },
			PROBE + "beforeStuckDraw(this, tick, decisionConfig.pStuck);");
		r(819, new String[] {
			"stuckEvents++;",
			"stuckUntilTick = tick",
			"+ decisionConfig.stuckDelayH * (60.0 / minutesPerTick);" },
			PROBE + "stuckSet(this, tick, stuckUntilTick, decisionConfig.stuckDelayH, minutesPerTick);");
		r(820, new String[] {
			"+ decisionConfig.stuckDelayH * (60.0 / minutesPerTick);",
			"}" },
			PROBE + "afterStuckDraw(this, tick, stuckUntilTick);");
		r(835, new String[] {
			"}",
			"currentNodeId = nodes.get(lastReached).longValue();" },
			PROBE + "reroute(this, tick, lastReached, currentNodeId);");
	}

	// --------------------------------------------------------------- main

	/**
	 * @param args {@code <certifiedGisAgentJava> <genSrcRoot> <auditFile>}
	 */
	public static void main(String[] args) throws Exception {
		if (args.length < 3) {
			throw new IllegalArgumentException(
					"usage: Instrument <GisAgent.java> <gen-src root> <audit file>");
		}
		File src = new File(args[0]);
		File genRoot = new File(args[1]);
		File audit = new File(args[2]);

		byte[] original = Files.readAllBytes(src.toPath());
		String srcSha = sha256(original);
		String text = new String(original, StandardCharsets.UTF_8);
		// Split preserving nothing: the file is LF-terminated on disk in this repo,
		// and the round-trip check below is what proves the join is exact.
		String[] lines = text.split("\n", -1);

		StringBuilder out = new StringBuilder(text.length() + 8192);
		StringBuilder auditText = new StringBuilder();
		auditText.append("# WP8 decision-oracle instrumentation audit\n");
		auditText.append("# certified source : ").append(src.getPath().replace('\\', '/')).append('\n');
		auditText.append("# certified sha256 : ").append(srcSha).append('\n');
		auditText.append("# source lines     : ").append(lines.length).append('\n');
		auditText.append("# insertions       : ").append(RULES.size()).append('\n');
		auditText.append("#\n");
		auditText.append("# Every inserted line below is a single call to ").append(PROBE)
				.append("*; nothing else\n");
		auditText.append("# is added, and no certified byte is altered (proved by the round-trip "
				+ "check at the end).\n#\n");

		int inserted = 0;
		for (int i = 0; i < lines.length; i++) {
			int lineNo = i + 1;
			out.append(lines[i]);
			if (i < lines.length - 1) {
				out.append('\n');
			}
			for (Rule rule : RULES) {
				if (rule.line != lineNo) {
					continue;
				}
				// context assertion: the k lines ending at lineNo, trimmed
				for (int k = 0; k < rule.context.length; k++) {
					int ctxLine = lineNo - rule.context.length + 1 + k;
					String got = ctxLine >= 1 && ctxLine <= lines.length
							? lines[ctxLine - 1].trim() : "<out of range>";
					if (!got.equals(rule.context[k])) {
						throw new IllegalStateException("ANCHOR DRIFT at " + src.getName() + ":"
								+ ctxLine + "\n  expected: " + rule.context[k] + "\n  actual  : " + got
								+ "\nThe certified source moved under the instrumentation. Re-derive "
								+ "the rule table in Instrument.java against the current file; do NOT "
								+ "relax the check.");
					}
				}
				if (!rule.insert.startsWith(PROBE)) {
					throw new IllegalStateException("rule at line " + lineNo
							+ " inserts something that is not a probe call: " + rule.insert);
				}
				String indent = leading(lines[i]);
				if (lines[i].trim().endsWith("{")) {
					indent = indent + "\t";
				}
				out.append(indent).append(rule.insert).append('\n');
				inserted++;
				auditText.append(String.format("%-6s", "L" + lineNo)).append("  after: ")
						.append(lines[i].trim()).append('\n');
				auditText.append("        insert: ").append(rule.insert).append("\n\n");
			}
		}

		File pkgDir = new File(genRoot, "geography/agents");
		if (!pkgDir.exists() && !pkgDir.mkdirs()) {
			throw new IOException("cannot create " + pkgDir);
		}
		File gen = new File(pkgDir, "GisAgent.java");
		write(gen, out.toString());

		if (inserted != RULES.size()) {
			throw new IllegalStateException(inserted + " of " + RULES.size()
					+ " rules fired -- a rule names a line that does not exist");
		}

		// ---- ONLY-INSERTIONS PROOF -----------------------------------------
		// Re-read what was written, drop the probe lines, and demand the
		// remainder is byte-identical to the certified source. This is an
		// independent check: it would catch a rule that mangled an anchor line,
		// a stray edit, an encoding change or a line-ending change.
		String back = new String(Files.readAllBytes(gen.toPath()), StandardCharsets.UTF_8);
		String[] backLines = back.split("\n", -1);
		StringBuilder stripped = new StringBuilder(text.length());
		int dropped = 0;
		for (int i = 0; i < backLines.length; i++) {
			if (backLines[i].trim().startsWith(PROBE)) {
				dropped++;
				continue;
			}
			if (stripped.length() > 0) {
				stripped.append('\n');
			}
			stripped.append(backLines[i]);
		}
		byte[] strippedBytes = stripped.toString().getBytes(StandardCharsets.UTF_8);
		String strippedSha = sha256(strippedBytes);
		boolean identical = strippedSha.equals(srcSha);
		auditText.append("# ---- only-insertions proof ----\n");
		auditText.append("# probe lines dropped on re-read : ").append(dropped).append('\n');
		auditText.append("# stripped sha256                : ").append(strippedSha).append('\n');
		auditText.append("# certified sha256               : ").append(srcSha).append('\n');
		auditText.append("# byte-identical                 : ").append(identical).append('\n');
		write(audit, auditText.toString());

		if (dropped != RULES.size()) {
			throw new IllegalStateException("re-read found " + dropped + " probe lines, expected "
					+ RULES.size());
		}
		if (!identical) {
			throw new IllegalStateException("ONLY-INSERTIONS PROOF FAILED: stripping the "
					+ dropped + " probe lines from " + gen + " did not reproduce " + src
					+ " byte for byte (" + strippedSha + " != " + srcSha + ")");
		}

		System.out.println("[WP8][instrument] " + gen.getPath());
		System.out.println("[WP8][instrument] " + inserted + " probe calls inserted; "
				+ "only-insertions proof PASSED (sha256 " + srcSha.substring(0, 16) + "...)");
		System.out.println("[WP8][instrument] audit -> " + audit.getPath());
	}

	private static String leading(String s) {
		int i = 0;
		while (i < s.length() && (s.charAt(i) == '\t' || s.charAt(i) == ' ')) {
			i++;
		}
		return s.substring(0, i);
	}

	private static void write(File f, String s) throws IOException {
		File parent = f.getParentFile();
		if (parent != null && !parent.exists() && !parent.mkdirs()) {
			throw new IOException("cannot create " + parent);
		}
		Writer w = new OutputStreamWriter(new FileOutputStream(f), StandardCharsets.UTF_8);
		try {
			w.write(s);
		} finally {
			w.close();
		}
	}

	static String sha256(byte[] b) throws Exception {
		MessageDigest md = MessageDigest.getInstance("SHA-256");
		byte[] d = md.digest(b);
		StringBuilder sb = new StringBuilder(64);
		for (byte x : d) {
			sb.append(Character.forDigit((x >> 4) & 0xF, 16));
			sb.append(Character.forDigit(x & 0xF, 16));
		}
		return sb.toString();
	}
}
