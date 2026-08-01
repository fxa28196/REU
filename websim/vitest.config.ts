import { defineConfig } from "vitest/config";

/**
 * Root Vitest config: one project per workspace package plus the repo tools
 * (claim linter). `npm test` at the websim root runs every project; each
 * package also runs standalone via `npm test -w <package>`.
 *
 * ## Why every package config sets `testTimeout: 30_000`
 *
 * Vitest's default is 5 s, and vitest runs `availableParallelism() - 1` forks
 * (15 on the 16-core dev box). Every genuinely heavy case in this tree already
 * declares its own timeout — 60 s to 900 s — so the 5 s default governed only
 * the residue. That residue is not all trivial: it includes cases that walk the
 * 375 MB `docs/runs` archive, cases that `spawnSync` a `tsx` CLI, and one case
 * (`engine/test/world/tier1.parity.test.ts`, "resolves every archived config to
 * the shelter file the exporter used") that builds 13 worlds and spends 4.46 s
 * of the 5 s budget on an IDLE machine — 1.12x headroom.
 *
 * That is a wall-clock budget, not a work budget, so a merely busy machine
 * blows it. Measured, not assumed: with eight background CPU spinners the whole
 * suite reproduced
 *
 *     Test Files  1 failed | 69 passed (70)
 *     Tests  1 failed | 1095 passed (1096)
 *     Error: Test timed out in 5000ms.
 *
 * twice over, on two DIFFERENT tests
 * (`validation/test/archive-bundle-coverage.test.ts`, 85 ms idle, and
 * `tools/test/check-scratch.test.ts`, 1.4 s idle), while the same suite was
 * green four times in a row on the same machine when idle. A gate that reports
 * the port as broken because something else on the box was busy is not a gate.
 *
 * The number is safe to raise because NOTHING in this tree uses a timeout as an
 * assertion. The one performance budget in the suite states itself explicitly —
 * `expect(r.timings.runMs).toBeLessThan(60_000)` in
 * `validation/test/wp7-vertical-slice.test.ts` — and carries its own 120 s
 * timeout, so the default decides only how long we wait before calling a hang,
 * never whether anything passes. 30 s keeps that distinct from the 60 s floor of
 * the declared-heavy cases, and is >=6x the slowest default-timeout case.
 *
 * It is set per package rather than here because projects do not inherit
 * root-level test options, and `npm test -w <package>` has to behave the same as
 * `npm test`.
 */
export default defineConfig({
  test: {
    projects: [
      "shared/vitest.config.ts",
      "engine/vitest.config.ts",
      "pipeline/vitest.config.ts",
      "app/vitest.config.ts",
      "validation/vitest.config.ts",
      "tools/vitest.config.ts",
    ],
  },
});
