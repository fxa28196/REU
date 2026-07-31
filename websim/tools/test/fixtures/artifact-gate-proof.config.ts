import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Child-process config for the skip-vs-fail proof. Rooted at this directory and
 * matching only the `.spec.ts` fixture, so the proof's deliberately-failing gate
 * can never leak into `npm test` (which collects `test/**\/*.test.ts`).
 */
export default defineConfig({
  test: {
    name: "artifact-gate-proof",
    root: fileURLToPath(new URL(".", import.meta.url)),
    include: ["artifact-gate-proof.spec.ts"],
  },
});
