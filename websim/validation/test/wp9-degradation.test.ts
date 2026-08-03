/**
 * wp9-degradation.test.ts — proving the harness degrades LOUDLY.
 *
 * Plan §5.3: *"Harness degrades **loudly** if archive data is absent — never
 * skips silently."* That is a claim about behaviour under a condition this
 * machine is not normally in, so it is proved by *putting the machine in that
 * condition*: each case spawns a real child process with
 * `WEBSIM_ARCHIVE_ROOT` pointed somewhere the archive is not, and asserts on
 * the exit code and the banner that comes back.
 *
 * Nothing is hidden by deletion. `docs/runs/` is read-only and stays untouched;
 * the harness is redirected instead, which is exactly the mechanism a CI runner
 * uses to point at the curated working set and therefore exactly the mechanism
 * that will be wrong in the field.
 *
 * ## The three conditions, and why the middle one exists
 *
 *  1. **Archive root absent.** `describeArchive().present === false`. Banner
 *     names the path it looked for and where that path came from.
 *  2. **Archive root present but EMPTY.** This is the one worth having: the
 *     directory exists, so every "is the archive there?" probe says yes, and a
 *     harness that only checked the root would sail past and produce a report
 *     over zero configurations. The CLI must name every missing run.
 *  3. **The vitest suite.** `wp9-replay-acceptance.test.ts` is artifact-gated,
 *     so with the archive absent it must report a **skip** with a `!!` banner
 *     and exit 0, and with `WEBSIM_REQUIRE_ARTIFACTS=1` it must exit non-zero
 *     with the same banner — never a silent pass in either direction.
 *
 * The child processes are cheap: every one of them exits during input
 * validation, before a single tick is simulated.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

const here = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url));
const WEBSIM_ROOT = path.resolve(here("../.."));
const SCRIPT = here("../scripts/wp9-validation-report.ts");
const ACCEPTANCE = here("./wp9-replay-acceptance.test.ts");

const CHILD_TIMEOUT_MS = 180_000;

/** A scratch directory outside the repo — nothing under `docs/runs/` is touched. */
const scratch = mkdtempSync(path.join(tmpdir(), "websim-wp9-degradation-"));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

interface Ran {
  readonly status: number | null;
  readonly out: string;
}

function run(argv: readonly string[], env: Readonly<Record<string, string>>): Ran {
  const r = spawnSync("npx", ["tsx", ...argv], {
    cwd: WEBSIM_ROOT,
    encoding: "utf8",
    shell: process.platform === "win32",
    timeout: CHILD_TIMEOUT_MS,
    env: { ...process.env, ...env },
  });
  return { status: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

function vitest(file: string, env: Readonly<Record<string, string>>): Ran {
  const r = spawnSync("npx", ["vitest", "run", "--reporter=basic", file], {
    cwd: WEBSIM_ROOT,
    encoding: "utf8",
    shell: process.platform === "win32",
    timeout: CHILD_TIMEOUT_MS,
    env: { ...process.env, ...env },
  });
  return { status: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

// ---------------------------------------------------------------------------

describe("the replay CLI refuses to produce a report it cannot support", () => {
  it("archive root ABSENT: exit 2 and a banner naming the path and its source", () => {
    const missing = path.join(scratch, "no-such-archive");
    const r = run([SCRIPT], { WEBSIM_ARCHIVE_ROOT: missing });
    expect(r.status, r.out).toBe(2);
    expect(r.out).toMatch(/ARCHIVE ABSENT — validation is running DEGRADED, not green/u);
    expect(r.out).toMatch(/looked for:/u);
    expect(r.out).toMatch(/WEBSIM_ARCHIVE_ROOT override/u);
    // The failure must not look like success in any channel.
    expect(r.out).not.toMatch(/wrote .*VALIDATION_REPORT\.json/u);
  }, CHILD_TIMEOUT_MS);

  it("archive root PRESENT but empty: exit 2 naming every missing run, not a silent zero-config report", () => {
    const r = run([SCRIPT], { WEBSIM_ARCHIVE_ROOT: scratch });
    expect(r.status, r.out).toBe(2);
    expect(r.out).toMatch(/ARCHIVE INCOMPLETE/u);
    // Named, not counted: a reader must be able to see which run to go and get.
    expect(r.out).toMatch(/present-day-three-arm\/A-seed42/u);
    expect(r.out).toMatch(/scenario-e-v2\/SE2-E18-d1-seed42/u);
    expect(r.out).toMatch(/present:\s+0 of 17 target\(s\)/u);
    expect(r.out).toMatch(/produce:/u);
    expect(r.out).not.toMatch(/wrote .*VALIDATION_REPORT\.json/u);
  }, CHILD_TIMEOUT_MS);

  it("a partial archive is still a refusal, and says how much of the set it found", () => {
    // The dangerous middle case: enough data to run *something*. A harness that
    // quietly replayed the subset would publish a report whose Tier-3 section
    // looked green over four configurations instead of seventeen.
    const r = run([SCRIPT, "--only", "present-day-three-arm/A-seed42"], {
      WEBSIM_ARCHIVE_ROOT: scratch,
    });
    expect(r.status, r.out).toBe(2);
    expect(r.out).toMatch(/present:\s+0 of 1 target\(s\)/u);
  }, CHILD_TIMEOUT_MS);
});

describe("the acceptance suite degrades loudly rather than passing vacuously", () => {
  it("archive absent, strict OFF: reports a SKIP with an attributed banner, and exits 0", () => {
    const r = vitest(ACCEPTANCE, {
      WEBSIM_ARCHIVE_ROOT: path.join(scratch, "no-such-archive"),
      WEBSIM_REQUIRE_ARTIFACTS: "0",
    });
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/ARTIFACT-GATED SUITE (SKIPPED|NOT RUN)|!! /u);
    expect(r.out).toMatch(/validation:wp9-replay-acceptance/u);
    // The banner has to say what evidence was forgone, or a reader cannot tell
    // a degraded run from a passing one.
    expect(r.out).toMatch(/archived EXECUTED manifests/u);
    // And the run must NOT claim the acceptance clause.
    expect(r.out).not.toMatch(/zero UNEXPLAINED divergences across the whole replay set.*\bpassed\b/u);
  }, CHILD_TIMEOUT_MS);

  it("archive absent, strict ON: the same banner, and a non-zero exit", () => {
    const r = vitest(ACCEPTANCE, {
      WEBSIM_ARCHIVE_ROOT: path.join(scratch, "no-such-archive"),
      WEBSIM_REQUIRE_ARTIFACTS: "1",
    });
    expect(r.status, r.out).not.toBe(0);
    expect(r.out).toMatch(/validation:wp9-replay-acceptance/u);
    expect(r.out).toMatch(/REQUIRES artifacts/u);
  }, CHILD_TIMEOUT_MS);
});
