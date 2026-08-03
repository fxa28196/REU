/**
 * mutation-catalogue.test.ts — keeping the mutation gate honest between runs.
 *
 * The mutation gate is a CI job, not a unit test: it edits source, spawns child
 * vitest runs and takes minutes. What runs on every `npm test` is this file, and
 * it exists to stop the three ways a mutation catalogue rots into decoration:
 *
 *  1. **A stale anchor.** If a refactor moves `const stepLengthM = ...`, the
 *     injection's `find` string matches nothing, the "injection" writes the file
 *     back unchanged, and the gate reports a defect the suite caught when in
 *     fact no defect was ever introduced. Every rung's anchor is checked here.
 *  2. **A parked blind spot.** An injection with no measured detection is an
 *     open hole. It is legal to record one — the sweep found two — but not to
 *     record one quietly, so the catalogue's own invariant is that every row
 *     carries a measured magnitude and a named detector.
 *  3. **A negative control that is not inert.** The whole run's attribution
 *     rests on the control being semantics-free. It is checked textually here.
 *
 * The `EditSession` machinery is exercised too, against a temporary file rather
 * than port source: apply, restore, digest-verify, and the two refusals (a
 * multi-match anchor, and a baseline that does not match the manifest).
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  INJECTIONS,
  NEGATIVE_CONTROL,
  catalogueFiles,
  injectionById,
  rungById,
  type Injection,
} from "./catalogue.js";
import { EditSession, WEBSIM_ROOT, buildManifest, sha256Of } from "./harness.js";

const ALL: readonly Injection[] = [...INJECTIONS, NEGATIVE_CONTROL];

function read(rel: string): string {
  return readFileSync(path.join(WEBSIM_ROOT, rel), "utf8");
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("the catalogue still describes the tree it claims to mutate", () => {
  it("every target file exists and is inside websim/", () => {
    for (const rel of catalogueFiles()) {
      expect(rel.startsWith("engine/") || rel.startsWith("validation/"), rel).toBe(true);
      expect(() => read(rel), rel).not.toThrow();
    }
  });

  it("every rung's anchor is live: pristine source matches it exactly once", () => {
    // The `OR the replacement matches` arm is not a loophole, it is the state
    // this very file is collected in when the gate runs the FULL scope with an
    // injection applied. Neither matching is the failure that matters: it means
    // the code moved and the injection has silently become a no-op.
    for (const injection of ALL) {
      const text = read(injection.file);
      for (const rung of injection.ladder) {
        const found = occurrences(text, rung.find);
        const replaced = occurrences(text, rung.replace);
        expect(
          found === 1 || replaced === 1,
          `${injection.id}/${rung.id}: anchor matched ${found} times and its replacement ` +
            `${replaced} times in ${injection.file}. A stale anchor makes the injection a ` +
            "no-op, and a no-op that reports 'detected' is worse than no gate at all.\n" +
            `  anchor: ${JSON.stringify(rung.find)}`,
        ).toBe(true);
      }
    }
  });

  it("every rung actually changes the file — no rung is its own replacement", () => {
    for (const injection of ALL) {
      for (const rung of injection.ladder) {
        expect(rung.replace, `${injection.id}/${rung.id}`).not.toBe(rung.find);
      }
    }
  });

  it("rung ids are unique inside an injection, injection ids unique overall", () => {
    expect(new Set(ALL.map((i) => i.id)).size).toBe(ALL.length);
    for (const injection of ALL) {
      const ids = injection.ladder.map((r) => r.id);
      expect(new Set(ids).size, injection.id).toBe(ids.length);
    }
  });
});

describe("the catalogue records measurements, not intentions", () => {
  it("no injection is parked with an unmeasured magnitude", () => {
    // If the sweep found a genuine blind spot the row must be either closed or
    // deleted deliberately. `run-mutation-gate.ts --gate` fails on a null too;
    // this makes it visible on every `npm test` rather than only in the CI job.
    for (const injection of INJECTIONS) {
      expect(
        injection.smallestDetected,
        `${injection.id} has no measured detection magnitude — an OPEN BLIND SPOT`,
      ).not.toBeNull();
      expect(injection.detector, `${injection.id} has no named detector`).not.toBeNull();
    }
  });

  it("every recorded magnitude names a rung that exists", () => {
    for (const injection of INJECTIONS) {
      expect(() => rungById(injection, injection.smallestDetected as string)).not.toThrow();
      if (injection.blindBelow !== null) {
        expect(() => rungById(injection, injection.blindBelow as string)).not.toThrow();
      }
    }
  });

  it("every named detector file exists", () => {
    for (const injection of INJECTIONS) {
      const d = injection.detector;
      if (d === null) continue;
      expect(() => read(d.file), `${injection.id} -> ${d.file}`).not.toThrow();
      expect(d.test.length, `${injection.id} detector test name is empty`).toBeGreaterThan(0);
    }
  });

  it("the smallest detected rung is at or finer than any blind rung it records", () => {
    // The ladder is ordered coarsest -> finest, so "detected at index i, blind at
    // index j" is only coherent when j > i.
    for (const injection of INJECTIONS) {
      if (injection.blindBelow === null) continue;
      const ids = injection.ladder.map((r) => r.id);
      expect(
        ids.indexOf(injection.blindBelow),
        `${injection.id}: blindBelow must sit BELOW smallestDetected on the ladder`,
      ).toBeGreaterThan(ids.indexOf(injection.smallestDetected as string));
    }
  });
});

describe("the negative control is inert", () => {
  it("adds only comment lines and removes nothing", () => {
    const rung = NEGATIVE_CONTROL.ladder[0];
    if (rung === undefined) throw new Error("the negative control has no rung");
    // The replacement must CONTAIN the original text — nothing is deleted...
    expect(rung.replace.includes(rung.find)).toBe(true);
    // ...and everything it adds must be a comment.
    const added = rung.replace.replace(rung.find, "");
    for (const l of added.split("\n")) {
      if (l.trim().length === 0) continue;
      expect(l.trim().startsWith("//"), `control adds a non-comment line: ${l}`).toBe(true);
    }
  });
});

describe("EditSession puts the bytes back, and refuses when it cannot", () => {
  // The victims live inside websim/ because the manifest keys on
  // websim-relative paths, and specifically under the ONE directory
  // `tools/check-scratch.ts` sanctions for test scratch. They are removed in
  // `afterAll`, which is what keeps `npm run check:scratch` green.
  const SELFTEST_DIR = path.join(WEBSIM_ROOT, "pipeline", "out", "test-tmp", "mutation-selftest");

  function makeVictim(name: string, body: string): { rel: string; abs: string } {
    mkdirSync(SELFTEST_DIR, { recursive: true });
    const abs = path.join(SELFTEST_DIR, name);
    writeFileSync(abs, body, "utf8");
    return { rel: `pipeline/out/test-tmp/mutation-selftest/${name}`, abs };
  }

  afterAll(() => {
    rmSync(SELFTEST_DIR, { recursive: true, force: true });
  });

  it("applies exactly one occurrence and restores the exact bytes", () => {
    const v = makeVictim("roundtrip.txt", "alpha\nBETA\ngamma\n");
    const manifest = buildManifest([v.rel]);
    const before = readFileSync(v.abs);
    const session = new EditSession(manifest);
    session.apply(v.rel, "BETA", "DELTA");
    expect(readFileSync(v.abs, "utf8")).toBe("alpha\nDELTA\ngamma\n");
    expect(session.liveCount).toBe(1);
    session.restoreAll();
    expect(session.liveCount).toBe(0);
    expect(sha256Of(readFileSync(v.abs))).toBe(sha256Of(before));
    session.disarm();
  });

  it("refuses an anchor that matches twice — the blast radius must be the documented one", () => {
    const v = makeVictim("ambiguous.txt", "x\nx\n");
    const session = new EditSession(buildManifest([v.rel]));
    expect(() => session.apply(v.rel, "x", "y")).toThrow(/matched 2 times/u);
    expect(readFileSync(v.abs, "utf8")).toBe("x\nx\n");
    session.disarm();
  });

  it("refuses an anchor that matches nothing — a stale catalogue is not a passing one", () => {
    const v = makeVictim("stale.txt", "nothing to see\n");
    const session = new EditSession(buildManifest([v.rel]));
    expect(() => session.apply(v.rel, "MOVED_AWAY", "y")).toThrow(/matched 0 times/u);
    session.disarm();
  });

  it("refuses to inject on top of a baseline that is not the manifest's", () => {
    const v = makeVictim("drifted.txt", "one\n");
    const manifest = buildManifest([v.rel]);
    writeFileSync(v.abs, "two\n", "utf8"); // somebody else moved it
    const session = new EditSession(manifest);
    expect(() => session.apply(v.rel, "two", "three")).toThrow(
      /does not match the pre-experiment manifest/u,
    );
    session.disarm();
  });

  it("refuses to edit a file that is not in the manifest at all", () => {
    const v = makeVictim("in.txt", "in\n");
    const session = new EditSession(buildManifest([v.rel]));
    expect(() => session.apply("engine/src/agents/step.ts", "a", "b")).toThrow(
      /not in the pre-experiment manifest/u,
    );
    session.disarm();
  });
});

describe("the catalogue covers everything WP9 was told to inject", () => {
  it("carries the two injections plan §5.2 names, and the six the history demands", () => {
    // Named in the plan.
    expect(() => injectionById("seed.replay-run-seed")).not.toThrow();
    expect(() => injectionById("formatter.half-up")).not.toThrow();
    // Named by this project's own regressions.
    for (const id of [
      "seed.population-derivation",
      "formatter.negative-zero",
      "movement.step-length",
      "exposure.walking-ventilation",
      "smoke.series-index-shift",
      "decision.brisk-coefficient",
      "rng.draw-order-swap",
    ]) {
      expect(() => injectionById(id), id).not.toThrow();
    }
    expect(INJECTIONS.length).toBe(9);
  });

  it("the movement ladder reaches 1 ULP and the ventilation ladder reaches 1 ULP", () => {
    // The two blind spots this project has actually shipped. A ladder that
    // stopped at 1 % would re-open both.
    expect(injectionById("movement.step-length").ladder.map((r) => r.id)).toContain("1ulp");
    expect(injectionById("exposure.walking-ventilation").ladder.map((r) => r.id)).toContain("1ulp");
    expect(injectionById("movement.step-length").ladder.map((r) => r.id)).toContain("10pct");
    expect(injectionById("movement.step-length").ladder.map((r) => r.id)).toContain("1pct");
  });
});
