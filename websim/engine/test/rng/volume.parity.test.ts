/**
 * Tier-0 **volume** parity: 10^7 draws x 5 seeds x 2 generators, regenerated on every run.
 *
 * <p>Plan section 3.3 item 1 and section 5.1 both state the criterion as "10^7 draws"; DR-S5
 * shipped 2,630,000 (263 sequences x 10,000), which is thorough on *shape* — 263 distinct
 * seed/draw-type/range combinations — but three and a half orders of magnitude short on
 * *depth*. Depth is not decoration for these two generators:
 *
 *  - `java.util.Random.nextInt(bound)` has a rejection branch whose retry probability for
 *    a non-power-of-two bound is about `bound / 2^31`. At bound 6842 that is 3.2e-6, so a
 *    10,000-draw sequence takes it with probability ~3%; over 1.25e6 draws it is taken about
 *    4 times, every time.
 *  - colt's MT19937 regenerates its state in 624-word blocks. 10,000 draws is 16 blocks;
 *    10^7 is 16,025, which exercises the tempering and reload path across the full period
 *    of the index cycle rather than a corner of it.
 *
 * <p>**How this stays honest without a 1.7 GB fixture.** The Java side
 * (`pipeline/java-exporter/src/websim/exporter/RngVolumeDumper.java`) streams SHA-256 over
 * the same canonical token bytes and commits ~21 KB: a final digest, a verbatim 64-token
 * head, and a *cumulative* checkpoint digest every 10^6 draws. This test regenerates all
 * 10^8 draws in TypeScript and compares every one of those. A digest match is a bit-for-bit
 * match; the checkpoints mean a mismatch is localised to a 10^6 window rather than reported
 * as "somewhere in 10^7"; the head means an early mismatch names its draw index directly.
 *
 * <p>The fixture is committed, so this runs from a clean clone — unlike the opt-in
 * `full-dump.parity.test.ts`, it never self-skips.
 */

import { createHash, type Hash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { doubleToHex, floatToHex, intToHex, longToHex } from "../../src/mathx/index.js";
import { ColtMT19937 } from "../../src/rng/ColtMT19937.js";
import { JavaRandom } from "../../src/rng/JavaRandom.js";

interface VolumeSequence {
  readonly id: string;
  readonly generator: string;
  readonly cycle: string;
  readonly seed: string;
  readonly seedNote: string;
  readonly count: number;
  readonly sha256: string;
  readonly checkpoints: readonly string[];
  readonly head: readonly string[];
}

interface VolumeFixture {
  readonly javaVersion: string;
  readonly drawsPerSequence: number;
  readonly checkpointEvery: number;
  readonly headLength: number;
  readonly sequences: readonly VolumeSequence[];
}

const fixture: VolumeFixture = JSON.parse(
  readFileSync(fileURLToPath(new URL("../fixtures/rng/rng-volume.json", import.meta.url)), "utf8"),
) as VolumeFixture;

/** Result of replaying one sequence: what the port produced, in the fixture's own shape. */
interface Replay {
  readonly count: number;
  readonly sha256: string;
  readonly checkpoints: string[];
  readonly head: string[];
}

/**
 * Streams a sequence through SHA-256 without ever materialising it.
 *
 * 10^7 tokens is ~170 MB of text per sequence. Appending to one string would spend more
 * time in the allocator than in the generator (DR-S5 section 9's lesson about assertion
 * cost, one layer down), so tokens accumulate in a bounded buffer that is flushed into the
 * hash. `Hash.copy()` gives the cumulative checkpoint digests that Java's
 * `MessageDigest.clone()` produces on the other side.
 */
async function replay(
  draws: number,
  checkpointEvery: number,
  headLength: number,
  next: (i: number) => string,
): Promise<Replay> {
  const hash = createHash("sha256");
  const checkpoints: string[] = [];
  const head: string[] = [];
  let buf = "";
  const flushed: Hash = hash;

  for (let i = 0; i < draws; i++) {
    const token = next(i);
    if (head.length < headLength) {
      head.push(token);
    }
    buf += `${token}\n`;
    if (buf.length >= 1 << 15) {
      flushed.update(buf);
      buf = "";
    }
    if ((i + 1) % checkpointEvery === 0) {
      if (buf.length > 0) {
        flushed.update(buf);
        buf = "";
      }
      checkpoints.push(flushed.copy().digest("hex"));
      // Yield at each checkpoint. 10^7 draws is a couple of seconds of unbroken CPU, and a
      // vitest worker that never returns to its event loop cannot answer the runner's
      // `onTaskUpdate` RPC — which surfaces as an "unhandled error" that fails the run even
      // though every assertion passed. Ten yields per sequence costs nothing measurable and
      // removes a machine-load-dependent failure mode. Determinism is untouched: nothing
      // here reads a clock or races, so the token stream is identical either way (the
      // "same sequence replayed twice" assertion below holds that line).
      await Promise.resolve();
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
    }
  }
  if (buf.length > 0) {
    flushed.update(buf);
  }
  return { count: draws, sha256: flushed.digest("hex"), checkpoints, head };
}

/** The `java.util.Random` interleave, byte for byte as `RngVolumeDumper.dumpJava` writes it. */
function javaCycle(seed: bigint): (i: number) => string {
  const r = new JavaRandom(seed);
  return (i: number): string => {
    switch (i & 7) {
      case 0:
        return doubleToHex(r.nextDouble());
      case 1:
        return doubleToHex(r.nextGaussian());
      case 2:
        return intToHex(r.nextInt(45));
      case 3:
        return longToHex(r.nextLong());
      case 4:
        return intToHex(r.nextBoolean() ? 1 : 0);
      case 5:
        return floatToHex(r.nextFloat());
      case 6:
        return intToHex(r.nextInt());
      default:
        return intToHex(r.nextInt(6842));
    }
  };
}

/**
 * The colt interleave. Java runs a single `Uniform` **over the same** `MersenneTwister` that
 * the raw calls use, so this sequence additionally proves the `Uniform` wrapper is a pure
 * view over the shared engine state rather than a consumer of its own — which the existing
 * per-range fixtures, where the `Uniform` was the only caller, structurally cannot show.
 */
function coltCycle(seed: number): (i: number) => string {
  const mt = new ColtMT19937(seed);
  return (i: number): string => {
    switch (i & 7) {
      case 0:
        return intToHex(mt.nextIntFromTo(0, 45));
      case 1:
        return doubleToHex(mt.raw());
      case 2:
        return doubleToHex(mt.nextDouble());
      case 3:
        return intToHex(mt.nextInt());
      case 4:
        return longToHex(mt.nextLong());
      case 5:
        return floatToHex(mt.nextFloat());
      case 6:
        return intToHex(mt.nextIntFromTo(1, 6));
      default:
        return intToHex(mt.nextIntFromTo(-5, 5));
    }
  };
}

async function replaySequence(seq: VolumeSequence): Promise<Replay> {
  const next = seq.generator.startsWith("java.util.Random")
    ? javaCycle(BigInt(seq.seed))
    : coltCycle(Number(seq.seed));
  return replay(fixture.drawsPerSequence, fixture.checkpointEvery, fixture.headLength, next);
}

/** Names the first checkpoint window that diverged, so a failure points at 10^6 draws. */
function firstDivergentWindow(
  expected: readonly string[],
  got: readonly string[],
  every: number,
): string {
  for (let k = 0; k < expected.length; k++) {
    if (expected[k] !== got[k]) {
      return `first divergence inside draws [${k * every}, ${(k + 1) * every})`;
    }
  }
  return "all checkpoints matched — divergence is in the tail after the last checkpoint";
}

describe("Tier-0 volume: 10^7 draws x 5 seeds x 2 generators vs real Java", () => {
  it("the fixture actually states the plan's criterion", () => {
    expect(fixture.drawsPerSequence).toBe(10_000_000);
    expect(fixture.checkpointEvery).toBe(1_000_000);
    expect(fixture.sequences.length).toBe(10);
    const javaSeeds = fixture.sequences
      .filter((s) => s.generator.startsWith("java.util.Random"))
      .map((s) => s.seed);
    const coltSeeds = fixture.sequences
      .filter((s) => !s.generator.startsWith("java.util.Random"))
      .map((s) => s.seed);
    // Plan section 3.3 item 1 verbatim: {0, 42, -1, 2^31-1, sampler-derived}.
    expect(javaSeeds).toEqual(["0", "42", "-1", "2147483647", String(42 * 1000003 + 17)]);
    expect(coltSeeds).toEqual(["0", "42", "-1", "2147483647", "4357"]);
    for (const s of fixture.sequences) {
      expect(s.count, `${s.id} draw count`).toBe(10_000_000);
      expect(s.checkpoints.length, `${s.id} checkpoints`).toBe(10);
      expect(s.head.length, `${s.id} head`).toBe(fixture.headLength);
      expect(s.sha256).toMatch(/^[0-9a-f]{64}$/u);
    }
    const total = fixture.sequences.reduce((n, s) => n + s.count, 0);
    expect(total).toBe(100_000_000);
  });

  for (const seq of fixture.sequences) {
    it(`reproduces all 10,000,000 draws of ${seq.id} (seed ${seq.seed})`, async () => {
      const got = await replaySequence(seq);
      // Head first: an early divergence should name its index, not just a digest.
      expect(got.head, `${seq.id}: first ${fixture.headLength} draws`).toEqual([...seq.head]);
      expect(
        got.checkpoints,
        `${seq.id}: ${firstDivergentWindow(
          seq.checkpoints,
          got.checkpoints,
          fixture.checkpointEvery,
        )}`,
      ).toEqual([...seq.checkpoints]);
      expect(got.count).toBe(seq.count);
      expect(got.sha256, `${seq.id}: full-sequence digest`).toBe(seq.sha256);
    }, 120_000);
  }

  it("the digest comparison is non-vacuous (one flipped draw breaks it)", async () => {
    // A cheap, self-contained mutation: same streaming machinery, one token changed at a
    // known index, and the containing checkpoint window is the one that moves.
    const seq = fixture.sequences[0]!;
    const base = await replay(50_000, 10_000, 4, javaCycle(BigInt(seq.seed)));
    const mutatedAt = 25_000;
    const gen = javaCycle(BigInt(seq.seed));
    const mutated = await replay(50_000, 10_000, 4, (i) => {
      const t = gen(i);
      return i === mutatedAt ? `${t.slice(0, -1)}${t.endsWith("0") ? "1" : "0"}` : t;
    });
    expect(mutated.sha256).not.toBe(base.sha256);
    expect(mutated.head).toEqual(base.head);
    // Checkpoints 0 and 1 cover draws [0, 20000); the mutation is in window 2.
    expect(mutated.checkpoints.slice(0, 2)).toEqual(base.checkpoints.slice(0, 2));
    expect(mutated.checkpoints[2]).not.toBe(base.checkpoints[2]);
    expect(firstDivergentWindow(base.checkpoints, mutated.checkpoints, 10_000)).toBe(
      "first divergence inside draws [20000, 30000)",
    );
  });

  it("the checkpoint yield does not perturb the stream (replay twice, byte-identical)", async () => {
    // `replay` returns to the event loop at every checkpoint so a vitest worker can answer
    // its RPC under load. That is an interleaving change, and an interleaving change inside
    // a determinism suite has to be shown to be inert rather than argued to be.
    const seq = fixture.sequences[0]!;
    const once = await replay(120_000, 10_000, 8, javaCycle(BigInt(seq.seed)));
    const twice = await replay(120_000, 40_000, 8, javaCycle(BigInt(seq.seed)));
    expect(once.sha256).toBe(twice.sha256);
    expect(once.head).toEqual(twice.head);
    // Different checkpoint spacing, same cumulative digests where the boundaries coincide.
    expect(once.checkpoints[3]).toBe(twice.checkpoints[0]);
    expect(once.checkpoints[7]).toBe(twice.checkpoints[1]);
    expect(once.checkpoints[11]).toBe(twice.checkpoints[2]);
  });
});
