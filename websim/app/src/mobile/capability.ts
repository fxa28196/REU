/**
 * capability.ts — the honest device-capability gate (WP13, plan §6.7 mobile).
 *
 * Three tiers, fixed by the plan:
 *
 *  - **Archived display is ALWAYS allowed on any device** — it is static data
 *    with no engine load; nothing here can ever gate it.
 *  - **2,037-agent live runs on passing devices** (the default preset scale).
 *  - **6,842 desktop-recommended** (full-scale runs).
 *
 * The verdict is the pure {@link scoreCapability} over injected
 * {@link CapabilityMeasurements}; `app/test/capability.test.ts` drives it with
 * synthetic measurements and NEVER runs the benchmark. The three signals:
 *
 *  1. `navigator.deviceMemory` (GB; Chromium-only, `null` elsewhere — an
 *     unexposed signal never fails a device),
 *  2. `navigator.hardwareConcurrency` (logical cores),
 *  3. a ~2-second micro-benchmark ({@link runMicroBenchmark}) whose score is
 *     kernel iterations per millisecond. The benchmark is the decisive
 *     measured signal: until it has run, the verdict is archived-only.
 *
 * ## Threshold provenance — calibration constants, not certified measurements
 *
 * {@link benchKernel} measured ≈85,000 iterations/ms on the development
 * desktop (Node 24 V8, idle, 2026-08-04). The thresholds below are engineering
 * calibration constants derived from that single point — LIVE at ≈5% of the
 * dev desktop (a mid-range phone passes; very weak devices do not), FULL at
 * ≈30% (desktop-class) — NOT certified measurements across a device fleet.
 * The dialog therefore always shows the user the raw measured numbers next to
 * the verdict, so the basis of the gate is visible, and a failing verdict only
 * withholds LIVE runs — archived certified results still display.
 */

// ---------------------------------------------------------------------------
// Tiers and thresholds
// ---------------------------------------------------------------------------

/** The default live-run scale the plan allows on passing devices. */
export const LIVE_STANDARD_AGENTS = 2037;

/** Full-scale runs — desktop-recommended per the plan. */
export const FULL_SCALE_AGENTS = 6842;

/** Minimum benchmark score (kernel iterations/ms) for any live run. */
export const BENCH_MIN_LIVE_PER_MS = 4_000;

/** Minimum benchmark score for the full-scale (desktop-recommended) tier. */
export const BENCH_MIN_FULL_PER_MS = 25_000;

/** Known device memory below this (GB) fails the live tier. */
export const MEMORY_MIN_LIVE_GB = 2;

/** Known device memory below this (GB) caps the verdict below full-scale. */
export const MEMORY_MIN_FULL_GB = 8;

/** Known logical-core count below this fails the live tier. */
export const CORES_MIN_LIVE = 4;

/** The full-scale tier requires a KNOWN core count at or above this. */
export const CORES_MIN_FULL = 8;

/** Wall-clock budget of the micro-benchmark. */
export const BENCH_DURATION_MS = 2000;

/** Kernel iterations per timed block (between event-loop yields). */
export const BENCH_BLOCK_ITERATIONS = 50_000;

export type CapabilityTier = "archived-only" | "live-2037" | "live-6842";

/** The three capability signals. `null` = not exposed / not yet measured. */
export interface CapabilityMeasurements {
  /** `navigator.deviceMemory`, GB (Chromium-only). */
  readonly deviceMemoryGB: number | null;
  /** `navigator.hardwareConcurrency`, logical cores. */
  readonly hardwareConcurrency: number | null;
  /** Micro-benchmark score, kernel iterations per millisecond. */
  readonly benchScorePerMs: number | null;
}

export interface CapabilityVerdict {
  readonly tier: CapabilityTier;
  /** Always `true`: archived display is never gated, on any device. */
  readonly archivedAllowed: true;
  /** Human sentences explaining the tier, for the dialog. */
  readonly reasons: readonly string[];
}

// ---------------------------------------------------------------------------
// Pure scoring
// ---------------------------------------------------------------------------

/**
 * Score injected measurements into a tier. Rules, in order:
 *
 *  - no benchmark score yet → `archived-only` ("not yet measured" is not a
 *    pass — the gate exists because a live run costs real device work);
 *  - benchmark below {@link BENCH_MIN_LIVE_PER_MS}, or a KNOWN memory/core
 *    figure below the live minimum → `archived-only`;
 *  - full-scale additionally needs benchmark ≥ {@link BENCH_MIN_FULL_PER_MS},
 *    a KNOWN core count ≥ {@link CORES_MIN_FULL}, and memory either unknown
 *    or ≥ {@link MEMORY_MIN_FULL_GB};
 *  - an unexposed signal (`null`) never FAILS a device — only a measured-bad
 *    value does — but full-scale will not be recommended on unknown cores.
 */
export function scoreCapability(m: CapabilityMeasurements): CapabilityVerdict {
  const reasons: string[] = [];

  if (m.benchScorePerMs === null) {
    return {
      tier: "archived-only",
      archivedAllowed: true,
      reasons: [
        "The 2-second compute check has not run yet; live runs stay off until it has.",
        "Archived certified results always display, with no engine load.",
      ],
    };
  }

  let liveOk = true;
  if (m.benchScorePerMs < BENCH_MIN_LIVE_PER_MS) {
    liveOk = false;
    reasons.push(
      `Compute check measured ${Math.round(m.benchScorePerMs).toLocaleString("en-US")} ` +
        `kernel iterations/ms, below the live-run calibration floor of ` +
        `${BENCH_MIN_LIVE_PER_MS.toLocaleString("en-US")}.`,
    );
  }
  if (m.deviceMemoryGB !== null && m.deviceMemoryGB < MEMORY_MIN_LIVE_GB) {
    liveOk = false;
    reasons.push(
      `Reported device memory ${m.deviceMemoryGB} GB is below the ${MEMORY_MIN_LIVE_GB} GB live-run floor.`,
    );
  }
  if (m.hardwareConcurrency !== null && m.hardwareConcurrency < CORES_MIN_LIVE) {
    liveOk = false;
    reasons.push(
      `${m.hardwareConcurrency} logical core(s) reported, below the live-run floor of ${CORES_MIN_LIVE}.`,
    );
  }
  if (!liveOk) {
    reasons.push("Archived certified results always display, with no engine load.");
    return { tier: "archived-only", archivedAllowed: true, reasons };
  }

  const fullOk =
    m.benchScorePerMs >= BENCH_MIN_FULL_PER_MS &&
    m.hardwareConcurrency !== null &&
    m.hardwareConcurrency >= CORES_MIN_FULL &&
    (m.deviceMemoryGB === null || m.deviceMemoryGB >= MEMORY_MIN_FULL_GB);

  if (fullOk) {
    reasons.push(
      `Meets the desktop-recommended calibration for live runs up to the full ` +
        `${FULL_SCALE_AGENTS.toLocaleString("en-US")} residents.`,
    );
    return { tier: "live-6842", archivedAllowed: true, reasons };
  }

  reasons.push(
    `Meets the calibration for live runs up to ${LIVE_STANDARD_AGENTS.toLocaleString("en-US")} ` +
      `residents; the full ${FULL_SCALE_AGENTS.toLocaleString("en-US")}-resident run is ` +
      `desktop-recommended.`,
  );
  return { tier: "live-2037", archivedAllowed: true, reasons };
}

/** One-line description of a tier, for the dialog. */
export function tierDescription(tier: CapabilityTier): string {
  switch (tier) {
    case "archived-only":
      return "Live-run thresholds not met (or not yet measured) — archived display only.";
    case "live-2037":
      return (
        `Live runs up to ${LIVE_STANDARD_AGENTS.toLocaleString("en-US")} residents; the full ` +
        `${FULL_SCALE_AGENTS.toLocaleString("en-US")}-resident run is desktop-recommended.`
      );
    case "live-6842":
      return (
        `Desktop-recommended tier — live runs up to the full ` +
        `${FULL_SCALE_AGENTS.toLocaleString("en-US")} residents.`
      );
  }
}

/** The Run screen's gate for a specific requested live-run size. */
export interface LiveRunGate {
  readonly allowed: boolean;
  /** Non-null when allowed with a caveat (e.g. above 2,037 on a mid tier). */
  readonly recommendation: string | null;
}

/**
 * Whether a live run of `numAgents` may start under `verdict` (`null` =
 * nothing measured yet → not allowed). Above {@link LIVE_STANDARD_AGENTS} on
 * the mid tier the run is still ALLOWED — "desktop-recommended" is a
 * recommendation, not a lock — but the caveat is surfaced.
 */
export function liveRunGate(verdict: CapabilityVerdict | null, numAgents: number): LiveRunGate {
  if (verdict === null || verdict.tier === "archived-only") {
    return { allowed: false, recommendation: null };
  }
  if (verdict.tier === "live-2037" && numAgents > LIVE_STANDARD_AGENTS) {
    return {
      allowed: true,
      recommendation:
        `Runs above ${LIVE_STANDARD_AGENTS.toLocaleString("en-US")} residents (up to ` +
        `${FULL_SCALE_AGENTS.toLocaleString("en-US")}) are desktop-recommended; this device ` +
        `met the mid-tier calibration only, so expect a slow run.`,
    };
  }
  return { allowed: true, recommendation: null };
}

// ---------------------------------------------------------------------------
// Environment readers (injectable, so tests never touch a real navigator)
// ---------------------------------------------------------------------------

/** The two instant signals; the benchmark is separate (it costs 2 seconds). */
export type DeviceSignals = Pick<CapabilityMeasurements, "deviceMemoryGB" | "hardwareConcurrency">;

/**
 * Read `deviceMemory` / `hardwareConcurrency` from a navigator-shaped object
 * (defaults to the real one when present). Non-finite/absent → `null`.
 */
export function readDeviceSignals(
  nav: unknown = typeof navigator === "undefined" ? null : navigator,
): DeviceSignals {
  const o = typeof nav === "object" && nav !== null
    ? (nav as { deviceMemory?: unknown; hardwareConcurrency?: unknown })
    : {};
  const mem = typeof o.deviceMemory === "number" && Number.isFinite(o.deviceMemory)
    ? o.deviceMemory
    : null;
  const cores =
    typeof o.hardwareConcurrency === "number" && Number.isFinite(o.hardwareConcurrency)
      ? o.hardwareConcurrency
      : null;
  return { deviceMemoryGB: mem, hardwareConcurrency: cores };
}

// ---------------------------------------------------------------------------
// Micro-benchmark (NEVER call from tests — inject measurements instead)
// ---------------------------------------------------------------------------

/**
 * The deterministic float kernel one benchmark block runs: multiply/add with a
 * transcendental per iteration (the engine's hot loops are float arithmetic +
 * fdlibm transcendentals). Pure; safe to call with SMALL iteration counts in
 * tests to pin determinism — the 2-second loop below is what tests must never
 * run.
 */
export function benchKernel(iterations: number): number {
  let x = 0.5;
  for (let i = 0; i < iterations; i++) {
    x = x * 1.0000001 + Math.sin(i * 1e-3) * 1e-6;
    if (x > 2) {
      x -= 1.5;
    }
  }
  return x;
}

/**
 * Run kernel blocks for ~`durationMs` wall-clock ms, yielding to the event
 * loop between blocks (the page stays responsive), and return the score in
 * kernel iterations per millisecond. `now` is injectable for completeness but
 * tests must not run this at all — they inject a `benchScorePerMs` directly.
 */
export async function runMicroBenchmark(
  durationMs: number = BENCH_DURATION_MS,
  now: () => number = () => performance.now(),
): Promise<number> {
  const start = now();
  let iterations = 0;
  let sink = 0;
  while (now() - start < durationMs) {
    sink += benchKernel(BENCH_BLOCK_ITERATIONS);
    iterations += BENCH_BLOCK_ITERATIONS;
    // Yield so pausing/rendering stays possible during the 2-second check.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }
  const elapsed = now() - start;
  if (!Number.isFinite(sink)) {
    throw new Error("benchmark kernel diverged — score would be meaningless");
  }
  return elapsed > 0 ? iterations / elapsed : 0;
}

// ---------------------------------------------------------------------------
// Session decision (page-level: ask once per session, not once per click)
// ---------------------------------------------------------------------------

/** The user's standing answer to the capability dialog, this session. */
export type CapabilityDecision = "proceed-live" | "archived-only";

let sessionDecision: CapabilityDecision | null = null;

export function getSessionDecision(): CapabilityDecision | null {
  return sessionDecision;
}

export function setSessionDecision(decision: CapabilityDecision | null): void {
  sessionDecision = decision;
}
