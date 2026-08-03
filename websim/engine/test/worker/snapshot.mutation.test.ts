/**
 * **Break it and watch.** The per-field sensitivity matrix for the
 * snapshot-replay property.
 *
 * `snapshot.property.test.ts` proves the property holds. That is only half of
 * what matters, and it is the half this repository has repeatedly got wrong: a
 * green property test whose subject nothing would notice breaking. WP8 shipped a
 * bit-verified decision layer with no call site and 1,369 tests stayed green; the
 * repaired flagship then passed 24/24 with the wiring **deleted**. The lesson is
 * that a claim must be shown able to fail, per mechanism, not argued about.
 *
 * So this file damages the snapshot one field at a time — replacing that field's
 * values with the ones from a tick-0 snapshot, which is exactly what "the
 * snapshot did not carry this field" looks like from the restore's point of view
 * — and asserts that the replayed run **diverges**. If it does not, the field is
 * ungated: the property would pass with the field missing, and the matrix says
 * so by name instead of leaving it to be discovered later.
 *
 * ## Self-calibration
 *
 * A field whose tick-0 and tick-S values are byte-identical cannot be damaged
 * this way; substituting it is a no-op and asserting divergence would be
 * asserting nonsense. Those are detected (`inert`) rather than assumed, listed
 * in the printed matrix, and excluded from the assertion. Everything else must
 * diverge.
 *
 * ## Two fields that are legitimately insensitive, and why
 *
 * `admissionEpoch` is a cache-invalidation counter: `restoreSnapshot` sets every
 * cached tick key to `NaN`, so the caches are cold whatever the epoch is, and no
 * observable depends on its value. It is snapshotted for completeness, not for
 * effect. Anything else that turns up insensitive is a finding, not a footnote.
 */

import { describe, expect, it } from "vitest";

import { digestSimulation } from "../../src/worker/digest.js";
import { RESIDENT_NUMBER_FIELDS, SHELTER_NUMBER_FIELDS } from "../../src/worker/fieldContract.js";
import { captureSnapshot, restoreSnapshot, type SimSnapshot, type SnapshotTarget } from "../../src/worker/snapshot.js";
import type { SimBundle } from "../../src/worker/build.js";

import { buildSynthWorld } from "./world.js";

const S = 260;
const T = 700;

function targetOf(b: SimBundle): SnapshotTarget {
  return { sim: b.sim, smoke: b.smoke, streams: b.world.streams };
}

async function digestOf(b: SimBundle): Promise<string> {
  return digestSimulation(b.sim, b.smoke, b.world.streams);
}

/** A snapshot with one field's values taken from `zero` instead of `good`. */
type Damage = (good: SimSnapshot, zero: SimSnapshot) => SimSnapshot;

function replaceNumSlot(slot: number, stride: number, key: "residents" | "shelters"): Damage {
  return (good, zero) => {
    const src = good[key];
    const nums = src.nums.slice();
    const zn = zero[key].nums;
    for (let i = 0; i * stride < nums.length; i++) {
      nums[i * stride + slot] = zn[i * stride + slot]!;
    }
    return { ...good, [key]: { ...src, nums } } as SimSnapshot;
  };
}

const DAMAGES: { readonly name: string; readonly apply: Damage }[] = [
  { name: "tick", apply: (g, z) => ({ ...g, tick: z.tick }) },
  { name: "order", apply: (g, z) => ({ ...g, order: z.order.slice() }) },
  { name: "admissionEpoch", apply: (g, z) => ({ ...g, admissionEpoch: z.admissionEpoch }) },
  { name: "streams", apply: (g, z) => ({ ...g, streams: z.streams }) },
  {
    name: "smokeOutOfRangeLookups",
    apply: (g, z) => ({ ...g, smokeOutOfRangeLookups: z.smokeOutOfRangeLookups }),
  },
  { name: "residents.state", apply: (g, z) => ({ ...g, residents: { ...g.residents, state: z.residents.state } }) },
  {
    name: "residents.targetShelter",
    apply: (g, z) => ({ ...g, residents: { ...g.residents, targetShelter: z.residents.targetShelter } }),
  },
  { name: "residents.leg", apply: (g, z) => ({ ...g, residents: { ...g.residents, leg: z.residents.leg } }) },
  {
    name: "residents.routeNodes",
    apply: (g, z) => ({ ...g, residents: { ...g.residents, routeNodes: z.residents.routeNodes } }),
  },
  {
    name: "residents.believedFull",
    apply: (g, z) => ({ ...g, residents: { ...g.residents, believedFull: z.residents.believedFull } }),
  },
  {
    name: "residents.pushedBlockages",
    apply: (g, z) => ({ ...g, residents: { ...g.residents, pushedBlockages: z.residents.pushedBlockages } }),
  },
  {
    name: "residents.decisionRng",
    apply: (g, z) => ({ ...g, residents: { ...g.residents, decisionRng: z.residents.decisionRng } }),
  },
  {
    name: "shelters.routeTree",
    apply: (g, z) => ({ ...g, shelters: { ...g.shelters, routeTree: z.shelters.routeTree } }),
  },
  {
    name: "closures.version",
    apply: (g, z) =>
      g.closures === null || z.closures === null
        ? g
        : { ...g, closures: { ...g.closures, version: z.closures.version } },
  },
  {
    name: "closures.cursor",
    apply: (g, z) =>
      g.closures === null || z.closures === null ? g : { ...g, closures: { ...g.closures, cursor: z.closures.cursor } },
  },
  {
    name: "closures.blocked",
    apply: (g, z) =>
      g.closures === null || z.closures === null
        ? g
        : { ...g, closures: { ...g.closures, blocked: z.closures.blocked } },
  },
  ...RESIDENT_NUMBER_FIELDS.map((f, i) => ({
    name: `residents.${f}`,
    apply: replaceNumSlot(i, RESIDENT_NUMBER_FIELDS.length, "residents" as const),
  })),
  ...SHELTER_NUMBER_FIELDS.map((f, i) => ({
    name: `shelters.${f}`,
    apply: replaceNumSlot(i, SHELTER_NUMBER_FIELDS.length, "shelters" as const),
  })),
];

/**
 * Fields that cannot make a replay diverge, with the reason.
 *
 * **Currently empty, and that is the measurement.** The expectation going in was
 * that `admissionEpoch` would be here — it is a cache-invalidation counter and
 * `restoreSnapshot` sets every cached tick key to `NaN`, so no *behaviour* reads
 * it. The matrix disagreed: the counter is itself part of the state the digest
 * observes, so restoring it wrong is visible whether or not it changes an
 * outcome. The entry was removed rather than kept as a comfortable exemption.
 *
 * Anything added here in future must come with a reason and must still be
 * ungated when `the allowlist is empty` below is updated to check it.
 */
const EXPECTED_INSENSITIVE = new Map<string, string>();

/** Byte comparison of two snapshots' one damaged field, to detect a no-op. */
async function snapshotsDiffer(a: SimSnapshot, b: SimSnapshot): Promise<boolean> {
  return JSON.stringify(serialise(a)) !== JSON.stringify(serialise(b));
}

function serialise(s: SimSnapshot): unknown {
  const arr = (v: ArrayBufferView & { length: number }): number[] =>
    Array.from(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
  return {
    tick: s.tick,
    order: arr(s.order),
    admissionEpoch: s.admissionEpoch,
    residents: {
      nums: arr(s.residents.nums),
      state: arr(s.residents.state),
      targetShelter: arr(s.residents.targetShelter),
      leg: s.residents.leg.map((l) => (l === null ? null : l.totalM)),
      routeNodes: s.residents.routeNodes.map((r) => (r === null ? null : Array.from(r.nodeIds))),
      believedFull: s.residents.believedFull,
      pushedBlockages: s.residents.pushedBlockages,
      decisionRng: s.residents.decisionRng,
    },
    shelters: {
      nums: arr(s.shelters.nums),
      routeTree: s.shelters.routeTree.map((t) => (t === null ? null : t.reachableCount)),
      petIntake: arr(s.shelters.petIntake),
      adultsOnly: arr(s.shelters.adultsOnly),
    },
    streams: {
      runSeed: s.streams.runSeed,
      mti: s.streams.defaultStream.mti,
      mt: Array.from(s.streams.defaultStream.mt),
      pop: s.streams.populationSampler,
      el: s.streams.eLayerSampler,
    },
    closures:
      s.closures === null
        ? null
        : {
            version: s.closures.version,
            cursor: s.closures.cursor,
            reports: s.closures.reports.length,
            pairs: s.closures.blocked.pairs,
            flags: arr(s.closures.blocked.flags),
          },
    smokeOutOfRangeLookups: s.smokeOutOfRangeLookups,
  };
}

describe("snapshot field sensitivity matrix (break it and watch)", () => {
  it("every snapshotted field is gated by the byte-identity property", async () => {
    const reference = buildSynthWorld();
    reference.sim.runUntil(T);
    const expected = await digestOf(reference);

    const source = buildSynthWorld();
    const zero = captureSnapshot(targetOf(source));
    source.sim.runUntil(S);
    const good = captureSnapshot(targetOf(source));

    // Control: the undamaged snapshot must reproduce the reference. Without it,
    // "everything diverged" could mean the harness is broken rather than
    // sensitive.
    {
      const b = buildSynthWorld();
      b.sim.run();
      restoreSnapshot(targetOf(b), good);
      b.sim.runUntil(T);
      expect(await digestOf(b), "undamaged control did not reproduce the straight run").toBe(expected);
    }

    const diverged: string[] = [];
    const threw: string[] = [];
    const inert: string[] = [];
    const ungated: string[] = [];

    for (const damage of DAMAGES) {
      const bad = damage.apply(good, zero);
      if (!(await snapshotsDiffer(good, bad))) {
        inert.push(damage.name);
        continue;
      }
      const b = buildSynthWorld();
      b.sim.run();
      let observed: string;
      try {
        restoreSnapshot(targetOf(b), bad);
        b.sim.runUntil(T);
        observed = await digestOf(b);
      } catch {
        // An engine fail-fast is the loudest possible divergence: the damaged
        // state was not merely different, it was rejected. `targetShelter`
        // reaches this — a resident with a leg and no target is a contradiction
        // `stepResident` refuses to execute.
        threw.push(damage.name);
        diverged.push(damage.name);
        continue;
      }
      if (observed === expected) {
        ungated.push(damage.name);
      } else {
        diverged.push(damage.name);
      }
    }

    // eslint-disable-next-line no-console -- the matrix IS the deliverable here.
    console.log(
      "[wp10-mutation-matrix]",
      JSON.stringify({
        total: DAMAGES.length,
        gated: diverged.length,
        gatedByEngineThrow: threw,
        inert: inert.length,
        ungated: ungated.length,
        inertFields: inert,
        ungatedFields: ungated,
      }),
    );

    const unexplained = ungated.filter((n) => !EXPECTED_INSENSITIVE.has(n));
    expect(
      unexplained,
      `these snapshot fields are UNGATED — the byte-identity property passes with them ` +
        `missing, so nothing would notice them breaking: ${unexplained.join(", ")}`,
    ).toEqual([]);

    // The matrix must not become vacuous by every field going inert.
    expect(diverged.length, "no field was shown to be gated at all").toBeGreaterThan(15);
  }, 600_000);

  it("the allowlist is empty — no snapshotted field is exempt from the matrix", () => {
    // This is an assertion, not a formality. Adding an exemption above means
    // deliberately editing this line, which is the point: an exemption should
    // cost a conscious decision rather than being absorbed silently.
    expect(
      Array.from(EXPECTED_INSENSITIVE.keys()),
      "a field was exempted from the sensitivity matrix; state the reason and update this test",
    ).toEqual([]);
  });

  it("the harness would report an ungated field if one existed (positive control)", async () => {
    // Guards the matrix from passing because the comparison is broken. A
    // deliberately unobservable perturbation — a field that is not part of the
    // snapshot and not read by the model — must come back as "no divergence",
    // proving the loop can distinguish the two outcomes.
    const reference = buildSynthWorld();
    reference.sim.runUntil(T);
    const expected = await digestOf(reference);

    const source = buildSynthWorld();
    source.sim.runUntil(S);
    const good = captureSnapshot(targetOf(source));

    const b = buildSynthWorld();
    b.sim.run();
    restoreSnapshot(targetOf(b), good);
    // `approxBytes` is snapshot bookkeeping, not model state. Damaging it must
    // NOT diverge; if it did, the matrix would be reacting to noise.
    restoreSnapshot(targetOf(b), { ...good, approxBytes: good.approxBytes + 1 });
    b.sim.runUntil(T);
    expect(await digestOf(b), "a non-state field changed the replay").toBe(expected);
  }, 120_000);
});
