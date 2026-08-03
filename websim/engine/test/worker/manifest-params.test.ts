/**
 * Drift gate on the one list WP10 had to duplicate.
 *
 * `SimHost.exportOutputs` needs to know which of the 41 parameters Repast
 * declares as `Integer` and which as `Double`, because `jsonVal` calls
 * `Object.toString()` and the difference is `6842` vs `6842.0` in the executed
 * manifest. `validation/src/headless.ts` already has that list, but the engine
 * cannot import the validation package — validation depends on the engine, so
 * the import would be a cycle.
 *
 * Duplication with no gate is how two lists quietly disagree and one manifest
 * starts diffing against the archive for no modelling reason. So the other list
 * is read out of its **source text** here and compared. It is a slightly
 * unusual test; it is also the only way to make the duplication safe without
 * moving the list into `@websim/shared`, which is a WP11+ refactor with its own
 * blast radius.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { INT_PARAM_NAMES } from "../../src/worker/simHost.js";

const HEADLESS = fileURLToPath(new URL("../../../validation/src/headless.ts", import.meta.url));

/** The identifiers inside `const INT_PARAMS = new Set<string>([ … ]);`. */
function headlessIntParams(source: string): string[] {
  const start = source.indexOf("const INT_PARAMS = new Set<string>([");
  if (start < 0) {
    throw new Error(
      "validation/src/headless.ts no longer declares `const INT_PARAMS = new Set<string>([`. " +
        "The drift gate cannot read it, which means the duplicate list in " +
        "engine/src/worker/simHost.ts is now unguarded — move the list into @websim/shared or " +
        "update this parser deliberately.",
    );
  }
  const end = source.indexOf("]);", start);
  const body = source.slice(start, end);
  return Array.from(body.matchAll(/"([A-Za-z][A-Za-z0-9_]*)"/gu)).map((m) => m[1]!);
}

describe("executed-manifest integer parameter list", () => {
  it("matches the list in validation/src/headless.ts, name for name", () => {
    const other = headlessIntParams(readFileSync(HEADLESS, "utf8"));
    expect(other.length, "the parsed list is suspiciously short").toBeGreaterThan(10);
    expect([...INT_PARAM_NAMES].sort()).toEqual([...other].sort());
  });

  it("the parser would notice a difference (positive control)", () => {
    const fake = 'const INT_PARAMS = new Set<string>([\n  "numAgents",\n  "randomSeed",\n]);';
    expect(headlessIntParams(fake)).toEqual(["numAgents", "randomSeed"]);
    expect([...INT_PARAM_NAMES].sort()).not.toEqual(["numAgents", "randomSeed"].sort());
  });

  it("fails loudly if the other list is renamed away", () => {
    expect(() => headlessIntParams("nothing here")).toThrow(/no longer declares/u);
  });
});
