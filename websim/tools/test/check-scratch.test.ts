/**
 * The scratch guard, tested at both altitudes — the same shape as
 * `artifact-gate.test.ts`, and for the same reason.
 *
 * 1. **Unit** — the classifier, driven from an injected filesystem so every
 *    branch (absent `out/`, produced entry, unknown entry, surviving scratch,
 *    empty scratch root) is exercised without touching a real tree.
 * 2. **End-to-end** — a real child process over a real fixture directory, once
 *    dirty and once clean. Asserting `findScratch()` returns a finding is an
 *    opinion; watching the CLI exit 1 is evidence, and a guard wired into
 *    `npm run ci` that cannot be shown to exit non-zero is decoration.
 *
 * The E2E case also proves the guard does not simply fail everything: the same
 * fixture, with only the leftovers removed, exits 0.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import {
  OUT_DIR,
  PRODUCED_ENTRIES,
  SCRATCH_ROOT,
  WEBSIM_ROOT,
  findScratch,
  formatReport,
  main,
  type DirReader,
} from "../check-scratch.js";

const SCRIPT = fileURLToPath(new URL("../check-scratch.ts", import.meta.url));

/** A filesystem described as `path -> children`. Anything else does not exist. */
function fakeReader(tree: Record<string, string[]>): DirReader {
  return {
    exists: (p) => Object.prototype.hasOwnProperty.call(tree, path.resolve(p)),
    readdir: (p) => [...(tree[path.resolve(p)] ?? [])].sort(),
  };
}

const OUT = path.resolve("/fake/websim/pipeline/out");
const ROOT = path.resolve("/fake/websim");

describe("findScratch — the classifier", () => {
  it("calls a missing pipeline/out clean (this is a fresh clone, not a fault)", () => {
    expect(findScratch(OUT, fakeReader({}), ROOT)).toEqual([]);
  });

  it("allows every produced entry and nothing else", () => {
    const produced = [...PRODUCED_ENTRIES.keys()];
    expect(produced.length).toBeGreaterThan(0);
    const clean = findScratch(OUT, fakeReader({ [OUT]: produced }), ROOT);
    expect(clean, `produced entries must not be findings: ${produced.join(", ")}`).toEqual([]);

    // One unknown name is enough to turn the same tree red.
    const dirty = findScratch(OUT, fakeReader({ [OUT]: [...produced, ".wrapper-scratch"] }), ROOT);
    expect(dirty).toHaveLength(1);
    expect(dirty[0]!.path).toBe("websim/pipeline/out/.wrapper-scratch");
    expect(dirty[0]!.why).toContain("not produced by any documented build step");
  });

  it("flags the five directories this guard was written for", () => {
    const strays = [
      ".clean-run-scratch-fresh",
      ".clean-run-scratch-leftover",
      ".recreated-during-clean-run",
      ".stub-trash-from-restore",
      ".wrapper-scratch",
    ];
    const findings = findScratch(OUT, fakeReader({ [OUT]: strays }), ROOT);
    expect(findings.map((f) => path.basename(f.path))).toEqual([...strays].sort());
  });

  it("permits an EMPTY test-tmp but flags anything surviving inside it", () => {
    const scratch = path.join(OUT, SCRATCH_ROOT);
    expect(findScratch(OUT, fakeReader({ [OUT]: [SCRATCH_ROOT], [scratch]: [] }), ROOT)).toEqual([]);

    const findings = findScratch(
      OUT,
      fakeReader({ [OUT]: [SCRATCH_ROOT], [scratch]: ["graph-asset", "wp7-a-6842"] }),
      ROOT,
    );
    expect(findings.map((f) => f.path)).toEqual([
      `websim/pipeline/out/${SCRATCH_ROOT}/graph-asset`,
      `websim/pipeline/out/${SCRATCH_ROOT}/wp7-a-6842`,
    ]);
    // The message has to name the actual defect, or it teaches nothing.
    expect(findings[0]!.why).toContain("afterAll");
    // The root itself is NOT a finding: several suites share it in parallel
    // workers, so requiring its removal would be a race between them.
    expect(findings.some((f) => f.path.endsWith(`/${SCRATCH_ROOT}`))).toBe(false);
  });

  it("reports loudly, names every leftover and says how to fix it", () => {
    const findings = findScratch(OUT, fakeReader({ [OUT]: [".wrapper-scratch"] }), ROOT);
    const report = formatReport(findings, OUT, ROOT);
    expect(report).toContain("SCRATCH LEFT BEHIND");
    expect(report).toContain("websim/pipeline/out/.wrapper-scratch");
    expect(report).toContain("--clean");
    for (const line of report.split("\n")) {
      expect(line.startsWith("!!"), `every banner line is prefixed: ${line}`).toBe(true);
    }
    expect(formatReport([], OUT, ROOT)).toContain("is clean");
  });
});

describe("check:scratch CLI — provably able to fail", () => {
  const TMP = mkdtempSync(path.join(tmpdir(), "websim-check-scratch-"));
  afterAll(() => rmSync(TMP, { recursive: true, force: true }));

  function fixture(name: string): string {
    const dir = path.join(TMP, name);
    mkdirSync(path.join(dir, "assets"), { recursive: true });
    writeFileSync(path.join(dir, "assets", "smoke-0.json"), "{}");
    return dir;
  }

  function run(args: readonly string[]): { status: number; out: string } {
    const r = spawnSync(process.execPath, ["--import", "tsx", SCRIPT, ...args], {
      cwd: WEBSIM_ROOT,
      encoding: "utf8",
    });
    return { status: r.status ?? -1, out: `${r.stdout}${r.stderr}` };
  }

  it("exits 0 on a tree that holds only produced entries", () => {
    const dir = fixture("clean");
    const r = run(["--out", dir]);
    expect(r.out).toContain("is clean");
    expect(r.status).toBe(0);
  });

  it("exits 1 on a stray directory and on scratch surviving inside test-tmp", () => {
    const dir = fixture("dirty");
    mkdirSync(path.join(dir, ".wrapper-scratch"), { recursive: true });
    mkdirSync(path.join(dir, SCRATCH_ROOT, "graph-asset", "dump"), { recursive: true });
    writeFileSync(path.join(dir, SCRATCH_ROOT, "graph-asset", "dump", "nodes.tsv"), "x\n");

    const r = run(["--out", dir]);
    expect(r.status, "a dirty tree must be RED").toBe(1);
    expect(r.out).toContain(".wrapper-scratch");
    expect(r.out).toContain("graph-asset");
  });

  it("--clean removes exactly the leftovers, keeps the produced entries and then exits 0", () => {
    const dir = fixture("cleanable");
    mkdirSync(path.join(dir, ".stub-trash-from-restore"), { recursive: true });
    mkdirSync(path.join(dir, SCRATCH_ROOT, "wp7-a-6842"), { recursive: true });
    writeFileSync(path.join(dir, SCRATCH_ROOT, "wp7-a-6842", "agents.csv"), "id\n");

    expect(run(["--out", dir]).status).toBe(1);
    const cleaned = run(["--out", dir, "--clean"]);
    expect(cleaned.status).toBe(0);
    expect(existsSync(path.join(dir, ".stub-trash-from-restore"))).toBe(false);
    expect(existsSync(path.join(dir, SCRATCH_ROOT))).toBe(false);
    // The build output it was sharing a directory with is untouched.
    expect(existsSync(path.join(dir, "assets", "smoke-0.json"))).toBe(true);
    expect(run(["--out", dir]).status).toBe(0);
  });

  it("exits 0 when the directory does not exist at all (a fresh clone)", () => {
    const r = run(["--out", path.join(TMP, "never-created")]);
    expect(r.status).toBe(0);
  });

  it("emits JSON that names the findings", () => {
    const dir = fixture("json");
    mkdirSync(path.join(dir, ".recreated-during-clean-run"), { recursive: true });
    const r = run(["--out", dir, "--json"]);
    expect(r.status).toBe(1);
    const parsed = JSON.parse(r.out) as { findings: { path: string }[] };
    expect(parsed.findings.map((f) => path.basename(f.path))).toEqual([".recreated-during-clean-run"]);
  });
});

describe("check:scratch defaults", () => {
  it("polices pipeline/out under this checkout", () => {
    expect(OUT_DIR).toBe(path.join(WEBSIM_ROOT, "pipeline", "out"));
  });

  it("main() honours --out, so the E2E cases above really are the shipped code path", () => {
    // Same entry point package.json calls, pointed at a directory that cannot
    // exist. stdout is captured rather than let through so this unit case does
    // not scribble a report into the middle of the suite's output.
    const written: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string) => {
      written.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      expect(main(["--out", path.join(tmpdir(), "websim-check-scratch-absent-xyz"), "--json"])).toBe(0);
    } finally {
      process.stdout.write = original;
    }
    expect(JSON.parse(written.join("")) as { findings: unknown[] }).toMatchObject({ findings: [] });
  });
});
