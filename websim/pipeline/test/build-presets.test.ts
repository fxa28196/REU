import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const WEBSIM_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = join("pipeline", "scripts", "build-presets.ts");

describe("build-presets --check", () => {
  it("reports the committed preset JSON as in sync with the definitions", () => {
    // This is the CI entry point for preset drift. `shared/test/presets.test.ts`
    // pins the same property from the other side; this test proves the CLI a CI
    // job would actually call still works.
    // Spawned through `node --import tsx` rather than `npx tsx` so no shell is
    // involved: `execFileSync` with `shell: true` concatenates rather than
    // escapes its arguments.
    const output = execFileSync(process.execPath, ["--import", "tsx", SCRIPT, "--check"], {
      cwd: WEBSIM_ROOT,
      encoding: "utf8",
    });
    expect(output).not.toMatch(/DRIFT|MISSING/u);
    expect(output.split("\n").filter((line) => line.startsWith("ok "))).not.toHaveLength(0);
  }, 60_000);
});
