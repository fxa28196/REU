/**
 * The snapshot ring: eviction, the permanent sparse index, thinning, and the
 * at-or-before selector.
 *
 * The selector is the part with teeth. The engine's tick loop only goes
 * forwards, so a keyframe *after* the target is unusable; a "nearest keyframe"
 * implementation would be correct-looking and wrong, and the failure would show
 * up as a scrub landing on a state the run never occupied. It is tested with
 * targets that sit between keyframes in both directions.
 */

import { describe, expect, it } from "vitest";

import { SnapshotRing } from "../../src/worker/ring.js";
import type { SimSnapshot } from "../../src/worker/snapshot.js";

/** A snapshot stub: the ring only reads `tick` and `approxBytes`. */
function snap(tick: number, bytes = 1000): SimSnapshot {
  return { tick, approxBytes: bytes } as unknown as SimSnapshot;
}

describe("SnapshotRing", () => {
  it("keeps the last `capacity` offers and forgets older ones", () => {
    const ring = new SnapshotRing({ capacity: 3, sparseEveryTicks: 1_000_000, sparseCapacity: 4 });
    for (const t of [10, 20, 30, 40, 50]) {
      ring.offer(snap(t));
    }
    expect(ring.ticks()).toEqual([30, 40, 50]);
    expect(ring.stats().ringSize).toBe(3);
    expect(ring.stats().taken).toBe(5);
  });

  it("retains a permanent keyframe every stride, beyond the ring window", () => {
    const ring = new SnapshotRing({ capacity: 2, sparseEveryTicks: 100, sparseCapacity: 64 });
    for (let t = 0; t <= 1000; t += 50) {
      ring.offer(snap(t));
    }
    // Ring holds 950 and 1000; the sparse index holds every 100th including 0.
    expect(ring.ticks()).toEqual([0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950, 1000]);
  });

  it("always retains tick 0", () => {
    const ring = new SnapshotRing({ capacity: 2, sparseEveryTicks: 1_000_000, sparseCapacity: 8 });
    ring.offer(snap(0));
    for (let t = 1; t <= 20; t++) {
      ring.offer(snap(t));
    }
    expect(ring.ticks()[0]).toBe(0);
    expect(ring.nearestAtOrBefore(1)!.tick).toBe(0);
  });

  it("thins the sparse index by doubling its stride instead of dropping the early run", () => {
    const ring = new SnapshotRing({ capacity: 1, sparseEveryTicks: 10, sparseCapacity: 8 });
    for (let t = 0; t <= 200; t += 10) {
      ring.offer(snap(t));
    }
    const stats = ring.stats();
    expect(stats.sparseSize).toBeLessThanOrEqual(8);
    expect(stats.sparseStrideTicks).toBeGreaterThan(10);
    const ticks = ring.ticks();
    // Coverage must remain spread over the whole run, not clustered at the end.
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBe(200);
    expect(ticks.some((t) => t > 40 && t < 160), "the middle of the run was thinned away").toBe(true);
  });

  it("selects at-or-before, never the nearer keyframe that lies ahead", () => {
    const ring = new SnapshotRing({ capacity: 8, sparseEveryTicks: 100, sparseCapacity: 64 });
    for (const t of [0, 100, 200, 300]) {
      ring.offer(snap(t));
    }
    // 299 is 1 tick from 300 and 99 from 200. The engine cannot step backwards,
    // so 200 is the only correct answer.
    expect(ring.nearestAtOrBefore(299)!.tick).toBe(200);
    expect(ring.nearestAtOrBefore(300)!.tick).toBe(300);
    expect(ring.nearestAtOrBefore(0)!.tick).toBe(0);
  });

  it("returns null when nothing is at or before the target", () => {
    const ring = new SnapshotRing({ capacity: 4, sparseEveryTicks: 1_000_000, sparseCapacity: 8 });
    ring.offer(snap(500));
    expect(ring.nearestAtOrBefore(499)).toBeNull();
    expect(ring.stats().hits.none).toBe(1);
  });

  it("does not duplicate a keyframe when the same tick is offered twice", () => {
    const ring = new SnapshotRing({ capacity: 4, sparseEveryTicks: 10, sparseCapacity: 8 });
    ring.offer(snap(10));
    ring.offer(snap(10));
    ring.offer(snap(10));
    expect(ring.ticks()).toEqual([10]);
    expect(ring.stats().sparseSize).toBe(1);
  });

  it("counts bytes once for a snapshot held in both stores", () => {
    const ring = new SnapshotRing({ capacity: 4, sparseEveryTicks: 10, sparseCapacity: 8 });
    const s = snap(10, 4096);
    ring.offer(s);
    expect(ring.stats().approxBytes).toBe(4096);
  });

  it("rejects nonsensical configuration instead of silently normalising it", () => {
    expect(() => new SnapshotRing({ capacity: 0 })).toThrow(RangeError);
    expect(() => new SnapshotRing({ sparseEveryTicks: 0 })).toThrow(RangeError);
    expect(() => new SnapshotRing({ sparseCapacity: 1 })).toThrow(RangeError);
  });
});
