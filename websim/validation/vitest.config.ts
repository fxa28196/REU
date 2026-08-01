import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "validation",
    include: ["test/**/*.test.ts"],
    // 30 s, not vitest's 5 s default. Rationale and the measured
    // reproduction live in websim/vitest.config.ts; the short version is that
    // every heavy case here declares its own timeout, no case uses a timeout as
    // an assertion, and a 5 s wall-clock budget makes a busy machine look like a
    // broken port.
    testTimeout: 30_000,
  },
});
