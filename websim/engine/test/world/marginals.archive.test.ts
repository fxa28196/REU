/**
 * Realised marginals at **seeds 42–50** and at both population sizes, checked
 * against the 375 MB Java archive rather than the F1 fixtures.
 *
 * Why this file exists: the F1 world dumps cover seeds 42/43/44 only (DR-F1 §10
 * records that as a known limitation), but plan WP6 asks for 42–50. The archived
 * run manifests already carry `population_sampling` for every seed the study
 * ever ran, so the gap can be closed without re-running the Java exporter — and
 * against a *different* oracle than `tier1.parity.test.ts` uses, which makes it
 * a genuinely independent check rather than a second reading of the same dump.
 *
 * Two things are compared:
 *
 *  - the manifest's six `realised_*` values at `%.4f` — the same rounding the
 *    Java `OutcomeLogger` applied, reproduced here with the HALF_UP formatter,
 *    not `toFixed`;
 *  - `per_agent.marginals.chronic_physical` at `%.6f`, recomputed by the archive
 *    digester from `agents.csv`. This one matters disproportionately: the
 *    manifest census **omits** chronic-physical, so it is the only archival
 *    evidence that draw ⑦ — the unconditional draw the `PopulationSampler`
 *    Javadoc forgets to list — is being consumed in the right place. A port that
 *    dropped it would still match five of the six manifest values at n = 1 and
 *    then diverge everywhere; here it fails immediately.
 *
 * The n = 2,037 historical-reference run is included because 2,037 draws are a
 * strict PREFIX of the 6,842 sequence at the same seed: matching both sizes
 * shows the sequence is right from the start, not merely right in aggregate.
 *
 * Skipped without `pipeline/out/archive-bundles/` (git-ignored, built by
 * `pipeline/scripts/build-archive-bundles.ts` from `docs/runs/`).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

import { artifactGate, describeGated } from "../../../tools/artifact-gate.js";
import { PopulationSampler } from "../../src/agents/populationSampler.js";
import { javaFormatFixed } from "../../src/mathx/format.js";
import { JavaRandom } from "../../src/rng/JavaRandom.js";
import { populationSamplerSeed } from "../../src/rng/streams.js";

const BUNDLE_DIR = fileURLToPath(new URL("../../../pipeline/out/archive-bundles", import.meta.url));

interface Bundle {
  readonly headline: {
    readonly population_sampling: {
      readonly heterogeneity: boolean;
      readonly n_sampled: number;
      readonly realised_mobility_limited: number;
      readonly realised_asthma: number;
      readonly realised_copd: number;
      readonly realised_any_respiratory: number;
      readonly realised_age_55plus: number;
      readonly mean_walking_speed_mps: number;
    };
  };
  readonly per_agent: { readonly marginals: { readonly n: number; readonly chronic_physical: number } };
}

/** Arm A at every archived seed, plus the n = 2,037 historical reference. */
const CASES: readonly { file: string; seed: number; n: number }[] = [
  ...[42, 43, 44, 45, 46, 47, 48, 49, 50].map((seed) => ({
    file: `present-day-three-arm__A-seed${seed}.json`,
    seed,
    n: 6842,
  })),
  { file: "historical-reference__histref-n2037-seed42.json", seed: 42, n: 2037 },
];

describeGated(
  artifactGate({
    gate: "engine:world-marginals-archive",
    suite: "realised marginals vs the archived run manifests",
    evidence:
      "seeds 42-50 at n=6,842 plus the n=2,037 prefix, checked against a SECOND oracle (the " +
      "archived run manifests) — including chronic_physical at %.6f, the only archival evidence " +
      "that the unconditional seventh draw is consumed in the right place",
    artifacts: CASES.map((c) => ({
      source: "archive-bundles" as const,
      label: c.file,
      path: `${BUNDLE_DIR}/${c.file}`,
    })),
  }),
  () => {
  it("reproduces seeds 42-50 at n=6,842 and the n=2,037 prefix, exactly", () => {
    const lines: string[] = [];
    for (const { file, seed, n } of CASES) {
      const bundle = JSON.parse(readFileSync(`${BUNDLE_DIR}/${file}`, "utf8")) as Bundle;
      const ps = bundle.headline.population_sampling;
      expect(ps.heterogeneity, `${file} heterogeneity`).toBe(true);
      expect(ps.n_sampled, `${file} n`).toBe(n);
      expect(bundle.per_agent.marginals.n, `${file} per-agent n`).toBe(n);

      const sampler = new PopulationSampler(new JavaRandom(populationSamplerSeed(BigInt(seed))));
      for (let i = 0; i < n; i++) {
        sampler.sample();
      }
      const m = sampler.marginals();

      // The manifest census, at OutcomeLogger's own %.4f.
      expect(
        [
          javaFormatFixed(m.mobilityLimitedShare, 4),
          javaFormatFixed(m.asthmaShare, 4),
          javaFormatFixed(m.copdShare, 4),
          javaFormatFixed(m.anyRespiratoryShare, 4),
          javaFormatFixed(m.age55PlusShare, 4),
          javaFormatFixed(m.meanWalkingSpeedMps, 4),
        ],
        `seed ${seed} n=${n} manifest marginals`,
      ).toEqual([
        javaFormatFixed(ps.realised_mobility_limited, 4),
        javaFormatFixed(ps.realised_asthma, 4),
        javaFormatFixed(ps.realised_copd, 4),
        javaFormatFixed(ps.realised_any_respiratory, 4),
        javaFormatFixed(ps.realised_age_55plus, 4),
        javaFormatFixed(ps.mean_walking_speed_mps, 4),
      ]);

      // The chronic-physical share, recomputed from agents.csv — the only
      // archival evidence for draw ⑦.
      expect(
        javaFormatFixed(m.chronicPhysicalShare, 6),
        `seed ${seed} n=${n} chronic physical`,
      ).toBe(javaFormatFixed(bundle.per_agent.marginals.chronic_physical, 6));

      lines.push(
        `seed ${seed} n=${n}: ${javaFormatFixed(m.mobilityLimitedShare, 4)} / ` +
          `${javaFormatFixed(m.asthmaShare, 4)} / ${javaFormatFixed(m.copdShare, 4)} / ` +
          `${javaFormatFixed(m.anyRespiratoryShare, 4)} / ${javaFormatFixed(m.age55PlusShare, 4)} / ` +
          `${javaFormatFixed(m.meanWalkingSpeedMps, 4)} | chronic ` +
          `${javaFormatFixed(m.chronicPhysicalShare, 6)}`,
      );
    }
    // eslint-disable-next-line no-console
    console.log(`[WP6] archived marginals, ${CASES.length} runs (seeds 42-50 + the n=2,037 prefix):`);
    for (const l of lines) {
      // eslint-disable-next-line no-console
      console.log(`[WP6]   ${l}`);
    }
    expect(lines.length).toBe(10);
  }, 120_000);
  },
);
