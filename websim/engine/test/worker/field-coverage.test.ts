/**
 * The guard that makes the snapshot **complete by construction** rather than by
 * inspection.
 *
 * A snapshot is a hand-written list of fields. Lists rot: someone adds
 * `Resident.somethingNew`, the snapshot does not carry it, and every existing
 * test still passes because no test knew the field existed. This file closes
 * that by reflecting over the live objects and demanding that **every own
 * property** be accounted for as one of exactly three things — a snapshotted
 * number, a snapshotted reference, or a field declared immutable and then
 * *measured* to be immutable over a full run.
 *
 * Add a field to `Resident` or `Shelter` without touching
 * `engine/src/worker/fieldContract.ts` and this goes red naming it.
 */

import { describe, expect, it } from "vitest";

import {
  assertFieldContract,
  FieldContractError,
  PRIVATE_FIELD_CONTRACT,
  RESIDENT_IMMUTABLE_FIELDS,
  RESIDENT_NUMBER_FIELDS,
  RESIDENT_REFERENCE_FIELDS,
  SHELTER_IMMUTABLE_FIELDS,
  SHELTER_NUMBER_FIELDS,
  SHELTER_REFERENCE_FIELDS,
} from "../../src/worker/fieldContract.js";
import { captureSnapshot } from "../../src/worker/snapshot.js";

import { buildSynthWorld } from "./world.js";

function accountedFor(...lists: readonly (readonly string[])[]): Set<string> {
  const out = new Set<string>();
  for (const l of lists) {
    for (const f of l) {
      out.add(f);
    }
  }
  return out;
}

describe("snapshot field coverage", () => {
  it("every own property of Resident is accounted for", () => {
    const b = buildSynthWorld();
    const known = accountedFor(RESIDENT_NUMBER_FIELDS, RESIDENT_REFERENCE_FIELDS, RESIDENT_IMMUTABLE_FIELDS);
    const live = Object.keys(b.sim.residents[0]!);
    const unaccounted = live.filter((k) => !known.has(k));
    expect(
      unaccounted,
      "Resident gained field(s) that engine/src/worker/fieldContract.ts does not classify. " +
        "Until they are listed, a snapshot silently drops them and the byte-identity property " +
        "cannot see the omission.",
    ).toEqual([]);
    const stale = Array.from(known).filter((k) => !live.includes(k));
    expect(stale, "fieldContract.ts names Resident fields that no longer exist").toEqual([]);
  });

  it("every own property of Shelter is accounted for", () => {
    const b = buildSynthWorld();
    const known = accountedFor(SHELTER_NUMBER_FIELDS, SHELTER_REFERENCE_FIELDS, SHELTER_IMMUTABLE_FIELDS);
    const live = Object.keys(b.sim.shelters[0]!);
    expect(
      live.filter((k) => !known.has(k)),
      "Shelter gained field(s) fieldContract.ts does not classify",
    ).toEqual([]);
    expect(
      Array.from(known).filter((k) => !live.includes(k)),
      "fieldContract.ts names Shelter fields that no longer exist",
    ).toEqual([]);
  });

  it("the fields declared immutable really are, over a whole run", () => {
    // `readonly` is erased at compile time, so the declaration is a claim about
    // behaviour and is measured here rather than trusted.
    const b = buildSynthWorld();
    const before = b.sim.residents.map((r) =>
      RESIDENT_IMMUTABLE_FIELDS.map((f) => JSON.stringify((r as unknown as Record<string, unknown>)[f] ?? null)),
    );
    const sBefore = b.sim.shelters.map((s) =>
      SHELTER_IMMUTABLE_FIELDS.map((f) => JSON.stringify((s as unknown as Record<string, unknown>)[f] ?? null)),
    );
    b.sim.run();
    for (let i = 0; i < b.sim.residents.length; i++) {
      const r = b.sim.residents[i]! as unknown as Record<string, unknown>;
      for (let f = 0; f < RESIDENT_IMMUTABLE_FIELDS.length; f++) {
        expect(
          JSON.stringify(r[RESIDENT_IMMUTABLE_FIELDS[f]!] ?? null),
          `resident ${i} field ${RESIDENT_IMMUTABLE_FIELDS[f]!} changed during the run`,
        ).toBe(before[i]![f]!);
      }
    }
    for (let i = 0; i < b.sim.shelters.length; i++) {
      const s = b.sim.shelters[i]! as unknown as Record<string, unknown>;
      for (let f = 0; f < SHELTER_IMMUTABLE_FIELDS.length; f++) {
        expect(
          JSON.stringify(s[SHELTER_IMMUTABLE_FIELDS[f]!] ?? null),
          `shelter ${i} field ${SHELTER_IMMUTABLE_FIELDS[f]!} changed during the run`,
        ).toBe(sBefore[i]![f]!);
      }
    }
  }, 60_000);

  it("the private-field contract holds against the live engine classes", () => {
    const b = buildSynthWorld();
    expect(() => {
      assertFieldContract("Simulation", b.sim as unknown as object);
    }).not.toThrow();
    expect(() => {
      assertFieldContract("Shelter", b.sim.shelters[0]! as unknown as object);
    }).not.toThrow();
    expect(() => {
      assertFieldContract("SmokeField", b.smoke as unknown as object);
    }).not.toThrow();
    expect(b.sim.closures).not.toBeNull();
    expect(() => {
      assertFieldContract("ClosureRuntime", b.sim.closures! as unknown as object);
    }).not.toThrow();
    expect(() => {
      assertFieldContract("BlockedEdges", b.sim.closures!.blocked as unknown as object);
    }).not.toThrow();
  });

  it("the contract check fails on a renamed field (positive control)", () => {
    // Without this, `assertFieldContract` could be a no-op and every "the
    // contract holds" assertion above would be vacuous.
    for (const cls of Object.keys(PRIVATE_FIELD_CONTRACT) as (keyof typeof PRIVATE_FIELD_CONTRACT)[]) {
      const fields = PRIVATE_FIELD_CONTRACT[cls];
      const stub: Record<string, unknown> = {};
      for (const f of fields) {
        stub[f] = 0;
      }
      expect(() => {
        assertFieldContract(cls, stub);
      }).not.toThrow();
      delete stub[fields[0]!];
      expect(() => {
        assertFieldContract(cls, stub);
      }).toThrow(FieldContractError);
    }
  });

  it("a prototype getter does not satisfy the contract (own-property check)", () => {
    // A refactor that replaced a field with an accessor would leave `in`-based
    // checks green while restore wrote to a setter that no longer stores state.
    const proto = { tickValue: 1, order: new Int32Array(1) };
    const obj = Object.create(proto) as object;
    expect(() => {
      assertFieldContract("Simulation", obj);
    }).toThrow(FieldContractError);
  });

  it("a captured snapshot reads a value for every number slot", () => {
    // Catches the specific silent failure the contract exists to prevent: a
    // renamed private field producing `undefined`, which lands in a
    // Float64Array as NaN and restores as NaN.
    const b = buildSynthWorld();
    b.sim.runUntil(300);
    const snap = captureSnapshot({ sim: b.sim, smoke: b.smoke, streams: b.world.streams });
    const nanSlots = new Set<string>();
    for (let i = 0; i < snap.residents.count; i++) {
      for (let f = 0; f < RESIDENT_NUMBER_FIELDS.length; f++) {
        const v = snap.residents.nums[i * RESIDENT_NUMBER_FIELDS.length + f]!;
        const field = RESIDENT_NUMBER_FIELDS[f]!;
        // Three fields are legitimately NaN before the event they record.
        const mayBeNaN =
          field === "arrivalTick" ||
          field === "evacuationTick" ||
          field === "networkDistToShelterM" ||
          field === "awareTick" ||
          field === "legFromLon" ||
          field === "legFromLat" ||
          field === "stuckUntilTick";
        if (Number.isNaN(v) && !mayBeNaN) {
          nanSlots.add(field);
        }
      }
    }
    expect(Array.from(nanSlots), "these number slots captured NaN — a renamed private field?").toEqual([]);
    for (let j = 0; j < snap.shelters.count; j++) {
      for (let f = 0; f < SHELTER_NUMBER_FIELDS.length; f++) {
        expect(
          Number.isNaN(snap.shelters.nums[j * SHELTER_NUMBER_FIELDS.length + f]!),
          `shelter slot ${SHELTER_NUMBER_FIELDS[f]!} captured NaN`,
        ).toBe(false);
      }
    }
  });
});

describe("snapshot aliasing assumptions", () => {
  it("the objects a snapshot aliases are never mutated in place", () => {
    // `snapshot.ts` aliases RouteLeg, RouteNodes, ShortestPathTree,
    // DecisionConfig and DecisionAttributes instead of copying them, on the
    // grounds that they are write-once. That reasoning is measured here: a
    // snapshot is taken mid-run, the run continues to the end (three closure
    // waves replace every shelter tree, and hundreds of legs are re-planned),
    // and the aliased objects must be byte-identical to what was captured.
    const b = buildSynthWorld();
    b.sim.runUntil(240);
    const snap = captureSnapshot({ sim: b.sim, smoke: b.smoke, streams: b.world.streams });

    const legCopies = snap.residents.leg.map((l) =>
      l === null ? null : { xy: l.xy.slice(), cumM: l.cumM.slice(), totalM: l.totalM, n: l.vertexCount },
    );
    const nodeCopies = snap.residents.routeNodes.map((r) =>
      r === null ? null : { nodes: r.nodes.slice(), ids: r.nodeIds.slice(), off: r.coordOffset.slice() },
    );
    const treeCopies = snap.shelters.routeTree.map((t) =>
      t === null ? null : { dist: t.dist.slice(), pred: t.predEdge.slice(), src: t.sourceNode },
    );
    const nonNullLegs = legCopies.filter((l) => l !== null).length;
    const nonNullNodes = nodeCopies.filter((n) => n !== null).length;
    expect(nonNullLegs, "no leg was live at the snapshot tick — the check would be vacuous").toBeGreaterThan(0);
    expect(nonNullNodes, "no routeNodes were live at the snapshot tick").toBeGreaterThan(0);

    b.sim.run();
    expect(b.sim.closures!.wavesApplied, "waves must have replaced the trees").toBeGreaterThan(0);

    for (let i = 0; i < snap.residents.count; i++) {
      const live = snap.residents.leg[i]!;
      const copy = legCopies[i]!;
      if (live === null || copy === null) {
        continue;
      }
      expect(Array.from(live.xy), `resident ${i} leg xy mutated in place`).toEqual(Array.from(copy.xy));
      expect(Array.from(live.cumM), `resident ${i} leg cumM mutated in place`).toEqual(Array.from(copy.cumM));
      expect(live.totalM).toBe(copy.totalM);
    }
    for (let i = 0; i < snap.residents.count; i++) {
      const live = snap.residents.routeNodes[i]!;
      const copy = nodeCopies[i]!;
      if (live === null || copy === null) {
        continue;
      }
      expect(Array.from(live.nodeIds), `resident ${i} routeNodes mutated in place`).toEqual(Array.from(copy.ids));
      expect(Array.from(live.coordOffset)).toEqual(Array.from(copy.off));
    }
    for (let j = 0; j < snap.shelters.count; j++) {
      const live = snap.shelters.routeTree[j]!;
      const copy = treeCopies[j]!;
      if (live === null || copy === null) {
        continue;
      }
      expect(Array.from(live.dist), `shelter ${j} tree dist mutated in place`).toEqual(Array.from(copy.dist));
      expect(Array.from(live.predEdge), `shelter ${j} tree predEdge mutated in place`).toEqual(
        Array.from(copy.pred),
      );
    }
  }, 120_000);
});
