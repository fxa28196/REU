import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

import { artifactGate, describeGated } from "../../../tools/artifact-gate.js";
import { doubleToHex, intToHex, longToHex } from "../../src/rng/bits.js";
import { ColtMT19937 } from "../../src/rng/ColtMT19937.js";
import { JavaRandom } from "../../src/rng/JavaRandom.js";
import { coltFixtures, firstDivergence, javaRandomFixtures } from "./fixtures.js";

/**
 * The committed fixtures compare a 256-draw head verbatim and the remaining 9 744 draws
 * through a SHA-256 digest. That IS a bit-exact comparison, but it is worth proving --
 * once, against the raw Java output -- that the digest is not hiding a length or
 * encoding mismatch. This suite does exactly that when the full dumps are present:
 *
 *   java -Dwebsim.rng.full=true -cp <cp> websim.exporter.RngFixtureDumper \
 *        engine/test/fixtures/rng pipeline/out/rng-full
 *
 * The full dumps are ~27 MB and git-ignored, so this suite is artifact-gated by
 * the shared skip-vs-fail policy: loud + skipped on a runner without them, hard
 * failure on a runner that sets WEBSIM_REQUIRE_ARTIFACTS (plan §5.3).
 */
const fullDir = fileURLToPath(new URL("../../../pipeline/out/rng-full/", import.meta.url));

function readTokens(id: string): string[] {
  return readFileSync(`${fullDir}${id}.hex`, "utf8").split("\n").slice(0, -1);
}

describeGated(
  artifactGate({
    gate: "engine:rng-full-dump",
    suite: "full Java dumps (opt-in, requires -Dwebsim.rng.full=true)",
    evidence:
      "the draw-by-draw check behind the committed fixtures' 9,744-draw SHA-256 tail — proof " +
      "the digest is not concealing a length or encoding mismatch in four RNG sequences",
    artifacts: [{ source: "rng-full", label: "rng-full/", path: fullDir }],
  }),
  () => {
  it("every draw of a java.util.Random Gaussian sequence matches, not just the digest", () => {
    const seq = javaRandomFixtures.sequences.find((s) => s.id === "jr-s1-nextGaussian");
    expect(seq).toBeDefined();
    const expected = readTokens(seq!.id);
    expect(expected).toHaveLength(seq!.count);

    const r = new JavaRandom(BigInt(seq!.seed));
    const actual = expected.map(() => doubleToHex(r.nextGaussian()));
    expect(firstDivergence(actual, expected)).toBe(-1);
  });

  it("every draw of the model's own colt draw site matches", () => {
    // nextIntFromTo(0, 45) is literally the build-time camp assignment (PORT_MAP 1.8).
    const seq = coltFixtures.sequences.find((s) => s.id === "mt-s1-nextIntFromTo-0_45");
    expect(seq).toBeDefined();
    const expected = readTokens(seq!.id);
    expect(expected).toHaveLength(seq!.count);

    const mt = new ColtMT19937(Number(seq!.seed));
    const actual = expected.map(() => intToHex(mt.nextIntFromTo(0, 45)));
    expect(firstDivergence(actual, expected)).toBe(-1);
  });

  it("every draw of a full-int-range and a nextLong sequence matches", () => {
    const range = coltFixtures.sequences.find(
      (s) => s.id === "mt-s3-nextIntFromTo--2147483648_2147483647",
    );
    expect(range).toBeDefined();
    const expectedRange = readTokens(range!.id);
    const mt = new ColtMT19937(Number(range!.seed));
    expect(
      firstDivergence(
        expectedRange.map(() => intToHex(mt.nextIntFromTo(-2147483648, 2147483647))),
        expectedRange,
      ),
    ).toBe(-1);

    const longs = javaRandomFixtures.sequences.find((s) => s.id === "jr-s6-nextLong");
    expect(longs).toBeDefined();
    const expectedLongs = readTokens(longs!.id);
    const r = new JavaRandom(BigInt(longs!.seed));
    expect(
      firstDivergence(
        expectedLongs.map(() => longToHex(r.nextLong())),
        expectedLongs,
      ),
    ).toBe(-1);
  });
  },
);
