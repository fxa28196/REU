/**
 * capability.test.ts — the honest device-capability gate (WP13), pure logic
 * only. Measurements are ALWAYS injected; the 2-second micro-benchmark
 * (`runMicroBenchmark`) is never executed here — only its small deterministic
 * kernel is touched, with tiny iteration counts, to pin determinism.
 */
import { afterEach, describe, expect, it } from "vitest";

import {
  BENCH_MIN_FULL_PER_MS,
  BENCH_MIN_LIVE_PER_MS,
  CORES_MIN_FULL,
  FULL_SCALE_AGENTS,
  LIVE_STANDARD_AGENTS,
  benchKernel,
  getSessionDecision,
  liveRunGate,
  readDeviceSignals,
  scoreCapability,
  setSessionDecision,
  tierDescription,
} from "../src/mobile/capability.js";
import type { CapabilityMeasurements } from "../src/mobile/capability.js";
import { measurementLines } from "../src/mobile/CapabilityDialog.js";

afterEach(() => {
  setSessionDecision(null);
});

function m(overrides: Partial<CapabilityMeasurements>): CapabilityMeasurements {
  return { deviceMemoryGB: null, hardwareConcurrency: null, benchScorePerMs: null, ...overrides };
}

// ---------------------------------------------------------------------------
// scoreCapability
// ---------------------------------------------------------------------------

describe("scoreCapability", () => {
  it("is archived-only until the benchmark has run — never a silent pass", () => {
    const verdict = scoreCapability(m({ deviceMemoryGB: 16, hardwareConcurrency: 16 }));
    expect(verdict.tier).toBe("archived-only");
    expect(verdict.reasons.join(" ")).toContain("has not run yet");
  });

  it("archived display is allowed in EVERY verdict, on every tier", () => {
    const inputs = [
      m({}),
      m({ benchScorePerMs: 1 }),
      m({ benchScorePerMs: BENCH_MIN_LIVE_PER_MS }),
      m({ benchScorePerMs: BENCH_MIN_FULL_PER_MS, hardwareConcurrency: 16, deviceMemoryGB: 16 }),
    ];
    for (const input of inputs) {
      expect(scoreCapability(input).archivedAllowed).toBe(true);
    }
  });

  it("a benchmark below the live floor fails the live tier, with the measured number in the reason", () => {
    const verdict = scoreCapability(m({ benchScorePerMs: BENCH_MIN_LIVE_PER_MS - 1 }));
    expect(verdict.tier).toBe("archived-only");
    expect(verdict.reasons.some((r) => r.includes("below the live-run calibration floor"))).toBe(true);
  });

  it("KNOWN low memory or low cores fails live even with a passing benchmark", () => {
    expect(
      scoreCapability(m({ benchScorePerMs: BENCH_MIN_FULL_PER_MS, deviceMemoryGB: 1 })).tier,
    ).toBe("archived-only");
    expect(
      scoreCapability(m({ benchScorePerMs: BENCH_MIN_FULL_PER_MS, hardwareConcurrency: 2 })).tier,
    ).toBe("archived-only");
  });

  it("an UNEXPOSED signal never fails a device (null memory/cores, passing benchmark → live)", () => {
    const verdict = scoreCapability(m({ benchScorePerMs: BENCH_MIN_LIVE_PER_MS }));
    expect(verdict.tier).toBe("live-2037");
  });

  it("full-scale needs the full benchmark floor AND a KNOWN core count at the floor", () => {
    // Passing bench + cores → full.
    expect(
      scoreCapability(
        m({ benchScorePerMs: BENCH_MIN_FULL_PER_MS, hardwareConcurrency: CORES_MIN_FULL }),
      ).tier,
    ).toBe("live-6842");
    // Unknown cores cap at the mid tier even with a huge benchmark score.
    expect(scoreCapability(m({ benchScorePerMs: BENCH_MIN_FULL_PER_MS * 10 })).tier).toBe(
      "live-2037",
    );
    // Known-low memory caps below full.
    expect(
      scoreCapability(
        m({
          benchScorePerMs: BENCH_MIN_FULL_PER_MS,
          hardwareConcurrency: CORES_MIN_FULL,
          deviceMemoryGB: 4,
        }),
      ).tier,
    ).toBe("live-2037");
  });

  it("threshold ordering is sane: 0 < live floor < full floor", () => {
    expect(BENCH_MIN_LIVE_PER_MS).toBeGreaterThan(0);
    expect(BENCH_MIN_FULL_PER_MS).toBeGreaterThan(BENCH_MIN_LIVE_PER_MS);
  });

  it("tierDescription covers every tier and names the plan's two scales", () => {
    expect(tierDescription("archived-only")).toContain("archived display only");
    expect(tierDescription("live-2037")).toContain(LIVE_STANDARD_AGENTS.toLocaleString("en-US"));
    expect(tierDescription("live-6842")).toContain(FULL_SCALE_AGENTS.toLocaleString("en-US"));
  });
});

// ---------------------------------------------------------------------------
// liveRunGate
// ---------------------------------------------------------------------------

describe("liveRunGate", () => {
  const mid = scoreCapability(m({ benchScorePerMs: BENCH_MIN_LIVE_PER_MS }));
  const full = scoreCapability(
    m({ benchScorePerMs: BENCH_MIN_FULL_PER_MS, hardwareConcurrency: CORES_MIN_FULL }),
  );
  const failed = scoreCapability(m({ benchScorePerMs: 1 }));

  it("refuses live runs with no verdict or a failed verdict", () => {
    expect(liveRunGate(null, LIVE_STANDARD_AGENTS).allowed).toBe(false);
    expect(liveRunGate(failed, 50).allowed).toBe(false);
  });

  it("mid tier: standard-scale allowed with no caveat", () => {
    const gate = liveRunGate(mid, LIVE_STANDARD_AGENTS);
    expect(gate.allowed).toBe(true);
    expect(gate.recommendation).toBeNull();
  });

  it("mid tier above 2,037: allowed but desktop-recommended, caveat surfaced", () => {
    const gate = liveRunGate(mid, FULL_SCALE_AGENTS);
    expect(gate.allowed).toBe(true);
    expect(gate.recommendation).toContain("desktop-recommended");
    expect(gate.recommendation).toContain("6,842");
  });

  it("full tier: full-scale allowed with no caveat", () => {
    const gate = liveRunGate(full, FULL_SCALE_AGENTS);
    expect(gate.allowed).toBe(true);
    expect(gate.recommendation).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Environment readers + dialog lines (injected fakes only)
// ---------------------------------------------------------------------------

describe("readDeviceSignals", () => {
  it("reads numbers from a navigator-shaped object", () => {
    expect(readDeviceSignals({ deviceMemory: 8, hardwareConcurrency: 12 })).toEqual({
      deviceMemoryGB: 8,
      hardwareConcurrency: 12,
    });
  });

  it("maps absent / non-numeric / non-finite signals to null, never a guess", () => {
    expect(readDeviceSignals({})).toEqual({ deviceMemoryGB: null, hardwareConcurrency: null });
    expect(readDeviceSignals(null)).toEqual({ deviceMemoryGB: null, hardwareConcurrency: null });
    expect(
      readDeviceSignals({ deviceMemory: "8", hardwareConcurrency: Number.NaN }),
    ).toEqual({ deviceMemoryGB: null, hardwareConcurrency: null });
  });
});

describe("measurementLines (dialog copy)", () => {
  it("shows measured numbers when present", () => {
    const lines = measurementLines(
      m({ deviceMemoryGB: 8, hardwareConcurrency: 12, benchScorePerMs: 12345.6 }),
    );
    expect(lines[0]).toContain("8 GB");
    expect(lines[1]).toContain("12");
    expect(lines[2]).toContain("12,346 kernel iterations/ms");
  });

  it("states plainly when a signal is unexposed or the check has not run", () => {
    const lines = measurementLines(m({}));
    expect(lines[0]).toContain("not reported by this browser");
    expect(lines[1]).toContain("not reported by this browser");
    expect(lines[2]).toContain("not run yet");
  });
});

// ---------------------------------------------------------------------------
// Kernel determinism (small iterations only — the 2 s benchmark NEVER runs here)
// ---------------------------------------------------------------------------

describe("benchKernel", () => {
  it("is deterministic and finite for a fixed iteration count", () => {
    const a = benchKernel(1000);
    const b = benchKernel(1000);
    expect(a).toBe(b);
    expect(Number.isFinite(a)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Session decision cache
// ---------------------------------------------------------------------------

describe("session decision", () => {
  it("starts unset, stores a decision, and resets", () => {
    expect(getSessionDecision()).toBeNull();
    setSessionDecision("proceed-live");
    expect(getSessionDecision()).toBe("proceed-live");
    setSessionDecision("archived-only");
    expect(getSessionDecision()).toBe("archived-only");
    setSessionDecision(null);
    expect(getSessionDecision()).toBeNull();
  });
});
