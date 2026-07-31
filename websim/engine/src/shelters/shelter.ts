/**
 * `Shelter` — a clean-air (smoke-respite) site.
 *
 * Verbatim port of `geography/agents/Shelter.java`. Four semantics here are
 * load-bearing and each has burned someone before:
 *
 * 1. **`capacity === null` means UNLIMITED**, not zero. It comes from a blank
 *    `capacity` cell, and `hasSpaceFor` returns `true` unconditionally for such
 *    a site. A port that coerced blank → 0 would turn standby sites into closed
 *    ones and every occupancy number downstream would be wrong in the safe-looking
 *    direction.
 * 2. **`admit()` mutates on failure.** A refused admission increments
 *    `refusedCount`. It must therefore never be called speculatively — the
 *    caller asks `hasSpaceFor` when it wants a question answered and `admit`
 *    only when it means to walk through the door (PORT_MAP §1.5 step 13).
 * 3. **The triage reserve is a floor, not a round** (`ContextCreator.java:567`),
 *    and it is applied only when `capacity != null && fraction > 0`. At fraction
 *    0 the reserve is 0 and `hasSpaceFor` is arithmetically the expression it was
 *    before arm D existed — which is why arms A/B/C reproduce bit-identically.
 * 4. **`isOpenAt` is `tick >= openTick && tick < closeTick`** — closed-inclusive
 *    on the left, exclusive on the right, over `double` ticks that are ±Infinity
 *    when the opening-date gate is off.
 *
 * `petIntake` is a **tri-state**: `true` admit, `false` refuse, `null`
 * unrecorded. Only `null` defers to the run-wide `petPolicyDefault`. Collapsing
 * it to a boolean silently converts every unrecorded site into whichever default
 * the port's author preferred.
 */

import type { ShortestPathTree } from "../graph/dijkstra.js";

export class Shelter {
  readonly id: string;
  readonly name: string;
  /** Nightly capacity; `null` = not capacity-limited. */
  readonly capacity: number | null;
  /** Part of the active scenario (standby sites are off by default). */
  readonly operating: boolean;
  readonly lon: number;
  readonly lat: number;

  /** ±Infinity when `respectShelterOpeningDates` is 0 — i.e. always open. */
  private openTickValue = Number.NEGATIVE_INFINITY;
  private closeTickValue = Number.POSITIVE_INFINITY;

  /** Node **index** into the routing graph (not the sparse certified node id). */
  graphNode = -1;
  /** Certified node id of {@link graphNode}; what fixtures and outputs carry. */
  graphNodeId = -1;
  /** Geodesic displacement introduced by snapping, in metres (build-time). */
  snapGapM = Number.NaN;
  /** Dijkstra tree rooted at {@link graphNode}; recomputed after each closure wave. */
  routeTree: ShortestPathTree | null = null;

  private reserved = 0;
  private occupancyValue = 0;
  private peakOccupancyValue = 0;
  private refusedCountValue = 0;
  private policyRefusedCountValue = 0;

  /** Tri-state pet policy: `true` admit, `false` refuse, `null` unrecorded. */
  petIntake: boolean | null = null;
  adultsOnly = false;

  constructor(
    id: string,
    name: string,
    capacity: number | null,
    operating: boolean,
    lon: number,
    lat: number,
  ) {
    this.id = id;
    this.name = name;
    this.capacity = capacity;
    this.operating = operating;
    this.lon = lon;
    this.lat = lat;
  }

  /**
   * Attempts to admit one resident.
   *
   * **Side-effecting on failure**: a refusal increments `refusedCount`. See
   * class doc point 2.
   */
  admit(isPriority = false): boolean {
    if (!this.hasSpaceFor(isPriority)) {
      this.refusedCountValue++;
      return false;
    }
    this.occupancyValue++;
    if (this.occupancyValue > this.peakOccupancyValue) {
      this.peakOccupancyValue = this.occupancyValue;
    }
    return true;
  }

  /**
   * Can this site take one more resident of the given priority class?
   *
   * Non-priority arrivals see `capacity − reservedForPriority`; priority
   * arrivals (mobility-limited only — never age/asthma/COPD) see all of it.
   */
  hasSpaceFor(isPriority: boolean): boolean {
    if (this.capacity === null) {
      return true;
    }
    const usable = isPriority ? this.capacity : this.capacity - this.reserved;
    return this.occupancyValue < usable;
  }

  hasSpace(): boolean {
    return this.hasSpaceFor(false);
  }

  /** Clamped into `[0, capacity]`; a no-op for capacity-unlimited sites. */
  setReservedForPriority(reserved: number): void {
    if (this.capacity === null) {
      this.reserved = 0;
      return;
    }
    this.reserved = Math.max(0, Math.min(this.capacity, reserved));
  }

  get reservedForPriority(): number {
    return this.reserved;
  }

  setOpenWindowTicks(openTick: number, closeTick: number): void {
    this.openTickValue = openTick;
    this.closeTickValue = closeTick;
  }

  get openTick(): number {
    return this.openTickValue;
  }

  get closeTick(): number {
    return this.closeTickValue;
  }

  isOpenAt(tick: number): boolean {
    return tick >= this.openTickValue && tick < this.closeTickValue;
  }

  /** Operating in the scenario, open on the calendar, and not yet full. */
  isAvailableAt(tick: number, isPriority = false): boolean {
    return this.operating && this.isOpenAt(tick) && this.hasSpaceFor(isPriority);
  }

  /**
   * A policy refusal (pet / adults-only gate). Counted into `refusedCount` so
   * total refusals stay one number, and separately so the share is auditable.
   */
  recordPolicyRefusal(): void {
    this.refusedCountValue++;
    this.policyRefusedCountValue++;
  }

  get occupancy(): number {
    return this.occupancyValue;
  }

  get peakOccupancy(): number {
    return this.peakOccupancyValue;
  }

  get refusedCount(): number {
    return this.refusedCountValue;
  }

  get policyRefusedCount(): number {
    return this.policyRefusedCountValue;
  }

  toString(): string {
    return this.id;
  }
}
