import { defineConfig } from "vitest/config";

/**
 * Root Vitest config: one project per workspace package plus the repo tools
 * (claim linter). `npm test` at the websim root runs every project; each
 * package also runs standalone via `npm test -w <package>`.
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
