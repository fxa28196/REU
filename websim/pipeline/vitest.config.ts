import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "pipeline",
    include: ["test/**/*.test.ts"],
    // 60 s, not vitest's 5 s default. The measured schedule, the isolated-vs-
    // in-suite contention table it is derived from, and the reason a timeout is
    // a budget rather than an assertion all live in websim/vitest.config.ts.
    // Short version: every heavy case declares its own budget, nothing in this
    // tree grades anything on time, and 60 s is 13.5x the slowest case that
    // actually runs under this default (4.46 s idle) — past the 3.50x worst
    // contention measured across the suite.
    testTimeout: 60_000,
  },
});
