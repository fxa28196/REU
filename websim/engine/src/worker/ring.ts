/**
 * The snapshot ring and the scrub policy (plan §3.5).
 *
 * > Ring of 8 + sparse hourly index (~2–6 MB each) … Scrub-back = restore
 * > nearest keyframe + fast-forward.
 *
 * Two stores, one policy:
 *
 *  - **The ring** holds the last `capacity` snapshots at whatever cadence the
 *    run took them. It is the cheap "step back a little" store and it forgets.
 *  - **The sparse index** holds one snapshot every `sparseEveryTicks` and never
 *    forgets, so scrubbing to the start of a 312-hour run does not have to
 *    replay from tick 0. It is capped by `sparseCapacity`; when the cap is hit
 *    the index **thins by dropping every other entry** and doubles its stride,
 *    which keeps coverage uniform over the whole run instead of dense-recent
 *    and empty-early.
 *
 * Tick 0 — the built, unstepped world — is always retained. Without it, a scrub
 * to a tick before the first keyframe has nowhere to restore from, and "rebuild
 * the world" is not a cheap operation and (with a rebuilt `StreamRegistry`)
 * is not obviously the same object graph either.
 *
 * ## Why `nearestAtOrBefore`, never "nearest"
 *
 * The engine's tick loop only goes forwards. A keyframe *after* the target is
 * useless — there is no reverse step — so the selector is strictly
 * at-or-before, and returning the closest-in-absolute-distance keyframe would be
 * a correctness bug that shows up as a scrub landing on the wrong tick.
 */

import type { SimSnapshot } from "./snapshot.js";

export interface SnapshotRingOptions {
  /** Rolling window size. Plan §3.5 says 8. */
  readonly capacity?: number;
  /** Keep one permanent keyframe every this many ticks. */
  readonly sparseEveryTicks?: number;
  /** Cap on permanent keyframes before the index thins and doubles its stride. */
  readonly sparseCapacity?: number;
}

export interface RingStats {
  readonly ringSize: number;
  readonly sparseSize: number;
  readonly sparseStrideTicks: number;
  readonly approxBytes: number;
  /** Snapshots taken since construction, including ones later evicted. */
  readonly taken: number;
  /** Snapshots served to a scrub, by store. */
  readonly hits: { readonly ring: number; readonly sparse: number; readonly none: number };
}

export class SnapshotRing {
  readonly capacity: number;
  private readonly sparseCapacity: number;
  private stride: number;
  private readonly ring: SimSnapshot[] = [];
  /** Permanent keyframes, ascending by tick, unique ticks. */
  private readonly sparse: SimSnapshot[] = [];
  private taken = 0;
  private ringHits = 0;
  private sparseHits = 0;
  private misses = 0;

  constructor(options: SnapshotRingOptions = {}) {
    this.capacity = options.capacity ?? 8;
    this.stride = options.sparseEveryTicks ?? 60;
    this.sparseCapacity = options.sparseCapacity ?? 64;
    if (!Number.isInteger(this.capacity) || this.capacity < 1) {
      throw new RangeError(`ring capacity must be a positive integer, got ${this.capacity}`);
    }
    if (!Number.isInteger(this.stride) || this.stride < 1) {
      throw new RangeError(`sparse stride must be a positive integer, got ${this.stride}`);
    }
    if (!Number.isInteger(this.sparseCapacity) || this.sparseCapacity < 2) {
      throw new RangeError(`sparse capacity must be >= 2, got ${this.sparseCapacity}`);
    }
  }

  get sparseStrideTicks(): number {
    return this.stride;
  }

  /**
   * File a snapshot into both stores.
   *
   * Idempotent per tick in the sparse index (re-offering the same tick replaces
   * the entry rather than duplicating it), because a scrub that restores a
   * keyframe and immediately re-snapshots must not grow the index.
   */
  offer(snap: SimSnapshot): void {
    this.taken++;
    this.ring.push(snap);
    while (this.ring.length > this.capacity) {
      this.ring.shift();
    }
    if (snap.tick === 0 || snap.tick % this.stride === 0) {
      this.insertSparse(snap);
    }
  }

  private insertSparse(snap: SimSnapshot): void {
    let lo = 0;
    let hi = this.sparse.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.sparse[mid]!.tick < snap.tick) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    if (lo < this.sparse.length && this.sparse[lo]!.tick === snap.tick) {
      this.sparse[lo] = snap;
      return;
    }
    this.sparse.splice(lo, 0, snap);
    if (this.sparse.length > this.sparseCapacity) {
      this.thin();
    }
  }

  /**
   * Halve the index, keeping tick 0 and every other entry after it, then double
   * the stride so future offers arrive at the new cadence.
   */
  private thin(): void {
    const kept: SimSnapshot[] = [];
    for (let i = 0; i < this.sparse.length; i++) {
      if (i === 0 || i % 2 === 0 || i === this.sparse.length - 1) {
        kept.push(this.sparse[i]!);
      }
    }
    this.sparse.length = 0;
    for (const s of kept) {
      this.sparse.push(s);
    }
    this.stride *= 2;
  }

  /**
   * The latest snapshot at or before `tick`, or `null` when nothing qualifies.
   *
   * The ring is searched first and wins ties: it is the more recent store, and
   * on a short scrub it holds a keyframe much closer to the target than the
   * sparse index does.
   */
  nearestAtOrBefore(tick: number): SimSnapshot | null {
    let best: SimSnapshot | null = null;
    let fromRing = false;
    for (const s of this.ring) {
      if (s.tick <= tick && (best === null || s.tick > best.tick)) {
        best = s;
        fromRing = true;
      }
    }
    for (const s of this.sparse) {
      if (s.tick <= tick && (best === null || s.tick > best.tick)) {
        best = s;
        fromRing = false;
      }
    }
    if (best === null) {
      this.misses++;
    } else if (fromRing) {
      this.ringHits++;
    } else {
      this.sparseHits++;
    }
    return best;
  }

  /** Ticks held, ascending, deduplicated — for provenance and tests. */
  ticks(): number[] {
    const set = new Set<number>();
    for (const s of this.ring) {
      set.add(s.tick);
    }
    for (const s of this.sparse) {
      set.add(s.tick);
    }
    return Array.from(set).sort((a, b) => a - b);
  }

  stats(): RingStats {
    let bytes = 0;
    const counted = new Set<SimSnapshot>();
    for (const s of [...this.ring, ...this.sparse]) {
      if (!counted.has(s)) {
        counted.add(s);
        bytes += s.approxBytes;
      }
    }
    return {
      ringSize: this.ring.length,
      sparseSize: this.sparse.length,
      sparseStrideTicks: this.stride,
      approxBytes: bytes,
      taken: this.taken,
      hits: { ring: this.ringHits, sparse: this.sparseHits, none: this.misses },
    };
  }

  clear(): void {
    this.ring.length = 0;
    this.sparse.length = 0;
  }
}
