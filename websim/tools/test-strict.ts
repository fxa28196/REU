/**
 * test-strict.ts — `npm run test:strict`.
 *
 * Runs the whole vitest suite with `WEBSIM_REQUIRE_ARTIFACTS=1`, which turns
 * every artifact-gated skip into a hard failure (see `tools/artifact-gate.ts`
 * and the "Skip-vs-fail policy" section of the README).
 *
 * This exists as a script rather than an inline env assignment in package.json
 * because `VAR=value cmd` is POSIX-only and `$env:VAR=...` is PowerShell-only —
 * the project is developed on Windows and built on Linux CI, so the one form
 * that works in both is a tiny node launcher. No extra dependency is added.
 *
 * Any extra arguments are forwarded to vitest, so
 * `npm run test:strict -- --project engine` works.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Imported from the vitest-free policy module on purpose: pulling in
// `artifact-gate.ts` here would import `vitest` outside a test worker, which
// throws at load time.
import { REQUIRE_ARTIFACTS_ENV } from "./artifact-policy.js";

const websimRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const vitestCli = path.join(websimRoot, "node_modules", "vitest", "vitest.mjs");

const result = spawnSync(process.execPath, [vitestCli, "run", ...process.argv.slice(2)], {
  cwd: websimRoot,
  env: { ...process.env, [REQUIRE_ARTIFACTS_ENV]: "1" },
  stdio: "inherit",
});

if (result.error !== undefined) {
  throw result.error;
}
process.exit(result.status ?? 1);
