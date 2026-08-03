import { availableParallelism } from "node:os";

import { defineConfig } from "vitest/config";

/**
 * Root Vitest config: one project per workspace package plus the repo tools
 * (claim linter). `npm test` at the websim root runs every project; each
 * package also runs standalone via `npm test -w <package>`.
 *
 * =========================================================================
 * THE SCHEDULE, AND WHY IT IS WRITTEN DOWN HERE
 * =========================================================================
 *
 * This tree has now had *three* separate failures of the same shape: a test that
 * asserts nothing about time is failed by a wall-clock timeout because fifteen
 * sibling forks were on the CPU. The first was fixed by raising the 5 s default
 * to 30 s (kept below, with its evidence). The second and third were
 * `validation/test/wp7-vertical-slice.test.ts` (60 s budget) and
 * `validation/test/tier4-attribution.test.ts` (120 s), after WP9's 17-config
 * replay and WP8's 225 s oracle joined the suite. Each time the response was to
 * move one number, which is why it kept happening.
 *
 * So the numbers now come from measurement, and the measurement lives here.
 *
 * ## Measured, idle 16-core box, vitest 3.2.7
 *
 * Per-file wall clock in isolation (`npm test -w validation -- <file>`) against
 * the same file's time inside a full `npm test`:
 *
 *   file                                     isolated   in-suite   contention
 *   validation/test/wp8-archive-replay        379.5 s    632.3 s      1.67x
 *   validation/test/wp8-r3-own-engine         325.5 s    582.8 s      1.79x
 *   validation/test/wp9-replay-acceptance     301.3 s    570.1 s      1.89x
 *   validation/test/wp7-vertical-slice         24.6 s     73.4 s      2.99x
 *   validation/test/tier4-attribution          19.8 s     69.2 s      3.50x
 *   validation/test/wp9-degradation            10.7 s     32.0 s      2.99x
 *
 * Whole suite before the changes below: 110 files, 1,742 cases, **634.2 s** wall
 * over 2,405.1 s of summed test time — a mean concurrency of only **3.79**. The
 * suite is therefore not uniformly saturated; the damage is a burst. Vitest's
 * sequencer starts the largest files first, so for the opening stretch all 15
 * forks run CPU-bound work on 16 cores, and the mid-weight files launched into
 * that burst take the worst of it — which is why the two that failed are the
 * 2.99x and 3.50x rows and not the 1.67x one.
 *
 * ## Two fixes, and one non-fix
 *
 * **Not available: "run the validation project serially."** In Vitest 3
 * `fileParallelism`, `maxWorkers` and `minWorkers` are `NonProjectOptions`
 * (`node_modules/vitest/dist/chunks/reporters.d.*.d.ts`) — they cannot be set per
 * project. The only serialisation on offer is global, and the measurements refuse
 * it outright: the three heaviest validation files alone are
 * 379.5 + 325.5 + 301.3 = **1,006 s** back to back, 1.59x the entire current
 * parallel wall, before the other ~104 files are counted.
 *
 * **Fix 1 — cap the peak instead.** `maxWorkers` is half the machine's
 * parallelism rather than vitest's `availableParallelism() - 1`. The arithmetic
 * says this costs nothing: the suite's floor is its longest single file (379.5 s
 * isolated), and even 4 workers clear the ~1,270 s of isolated-equivalent work
 * inside that floor. What it buys is real — the opening burst halves and the main
 * thread keeps a core. That last part matters beyond speed: the reporter RPC has
 * a hard-coded 60 s timeout in vitest's bundled birpc (`DEFAULT_TIMEOUT = 6e4`,
 * not configurable), so a starved main thread produces
 * `Timeout calling "onTaskUpdate"` as an unhandled error beside passing tests.
 *
 * **Fix 2 — budgets sized from the isolated measurement, not from the schedule.**
 * The two files that failed now declare one named, documented `CASE_TIMEOUT_MS`
 * each in place of 22 scattered literals, set to **300 s**: 12.2x measured
 * isolated for wp7-vertical-slice, 15.2x for tier4-attribution. Both exceed the
 * worst contention this tree has produced (>6.1x — tier4-attribution has blown
 * 120 s against a 19.8 s baseline), so fix 2 stands on its own and does not
 * depend on fix 1 holding on some other machine.
 *
 * ## The default, and why raising a budget is not weakening anything
 *
 * Vitest's default is 5 s. Every genuinely heavy case here declares its own
 * budget — 300 s to 900 s — so the default governs only the residue, and that
 * residue is not all trivial: it includes cases that walk the 375 MB `docs/runs`
 * archive, cases that `spawnSync` a `tsx` CLI, and one
 * (`engine/test/world/tier1.parity.test.ts`, "resolves every archived config to
 * the shelter file the exporter used") that builds 13 worlds and spent 4.46 s of
 * the 5 s budget on an IDLE machine — 1.12x headroom.
 *
 * That is a wall-clock budget, not a work budget, so a merely busy machine blows
 * it. Measured, not assumed: with eight background CPU spinners the whole suite
 * reproduced
 *
 *     Test Files  1 failed | 69 passed (70)
 *     Tests  1 failed | 1095 passed (1096)
 *     Error: Test timed out in 5000ms.
 *
 * twice over, on two DIFFERENT tests
 * (`validation/test/archive-bundle-coverage.test.ts`, 85 ms idle, and
 * `tools/test/check-scratch.test.ts`, 1.4 s idle), while the same suite was green
 * four times in a row on the same machine when idle.
 *
 * The default is now **60 s**: 13.5x the slowest measured default-timeout case,
 * past the 3.50x worst contention measured above, and still 5x below the smallest
 * declared heavy budget so "declared heavy" keeps its meaning.
 *
 * Raising it is safe because **nothing in this tree uses a timeout as an
 * assertion.** The one performance budget states itself explicitly —
 * `expect(r.timings.runMs).toBeLessThan(60_000)` in
 * `validation/test/wp7-vertical-slice.test.ts` — and carries its own separate
 * case budget, so a timeout decides only how long we wait before calling
 * something a hang, never whether anything passes.
 *
 * It is set per package rather than here because projects do not inherit
 * root-level test options, and `npm test -w <package>` has to behave the same as
 * `npm test`.
 */

/**
 * Half the machine, floor of 2 — see "Fix 1" above. Vitest's own default is
 * `availableParallelism() - 1`, which on a 16-core box puts 15 CPU-bound forks
 * plus the main process on 16 cores and leaves the reporter nothing.
 */
const MAX_WORKERS = Math.max(2, Math.floor(availableParallelism() / 2));

export default defineConfig({
  test: {
    maxWorkers: MAX_WORKERS,
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
