import { defineConfig } from "vitest/config";

/**
 * The WP10 UI-thread PROFILING config (DR-WP10-uithread-perf).
 *
 * Separate from `vitest.browser.config.ts` on purpose, and matching
 * `*.profile.ts` rather than `*.test.ts`, so that:
 *
 *  - `npm run test:browser` — the gate — does not grow by ~18 minutes; and
 *  - nothing in this matrix can turn a build red. It measures; it does not
 *    judge. The judging lives in `engine/test-browser/worker/*.test.ts`.
 *
 * `.mts` rather than `.ts` so the file stays out of `engine/tsconfig.json`
 * (`src/**` + Node tests) and out of `engine/tsconfig.browser.json`
 * (`test-browser/**\/*.ts`, `types: []`, no Node globals): it is a Node-side
 * build config living in a directory otherwise typechecked as browser code.
 *
 * Run ONE engine at a time. Three engines on 16 cores measure the box:
 *
 * ```
 *   npx vitest run --config engine/vitest.profile.config.mts --browser=chromium
 *   npx vitest run --config engine/vitest.profile.config.mts --browser=firefox
 *   npx vitest run --config engine/vitest.profile.config.mts --browser=webkit
 * ```
 */
export default defineConfig({
  test: {
    name: "engine-profile",
    include: ["engine/test-browser/profile/**/*.profile.ts"],
    fileParallelism: false,
    browser: {
      enabled: true,
      provider: "playwright",
      headless: true,
      screenshotFailures: false,
      instances: [{ browser: "chromium" }, { browser: "firefox" }, { browser: "webkit" }],
    },
  },
});
