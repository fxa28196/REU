import { defineConfig } from "vitest/config";

/**
 * The Tier-2 cross-engine determinism matrix (plan §3.3, §5.1, §5.3 "three-browser
 * byte-identity job").
 *
 * <p>Deliberately **not** listed in the root `vitest.config.ts` projects array. `npm test`
 * must stay green in a clean clone with nothing but `npm ci`, and this config needs
 * Playwright's browser binaries (~400 MB, fetched by `npx playwright install`). Keeping it
 * on its own config makes the dependency explicit instead of turning a clean checkout into
 * a mysterious failure — the CI job installs the browsers, then runs `npm run test:browser`.
 *
 * <p>Run locally with:
 *
 * ```
 *   npx playwright install chromium firefox webkit   # once
 *   npm run test:browser
 *   npm run test:browser -- --browser=firefox        # one engine
 * ```
 */
export default defineConfig({
  // No `optimizeDeps.include` for `geographiclib-geodesic` any more. It used to be needed
  // because the package ships CJS and the page could not execute it; since WP7 task C1 the
  // engine imports the vendored ESM copy in `src/geo/vendor/` instead, and the shipped
  // package is a Node-only build input (`tools/vendor-geodesic.ts`) plus the differential
  // reference in `engine/test/geo/vendor.equivalence.test.ts`. Leaving the entry in would
  // have quietly asserted the opposite; if a browser-reachable import of the raw package
  // ever comes back, the page fails loudly rather than silently loading host math.
  test: {
    name: "engine-browser",
    // Relative to the Vitest root, which is `websim/` (where `npm run test:browser` runs)
    // rather than this file's directory — `--config` does not move the root.
    include: ["engine/test-browser/**/*.test.ts"],
    browser: {
      enabled: true,
      provider: "playwright",
      headless: true,
      screenshotFailures: false,
      instances: [{ browser: "chromium" }, { browser: "firefox" }, { browser: "webkit" }],
    },
  },
});
