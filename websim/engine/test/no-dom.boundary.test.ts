/**
 * The engine's portability boundary, and the reason the browser tests are
 * typechecked at all.
 *
 * ## What went wrong
 *
 * `engine/package.json` describes this package as "pure TypeScript, zero DOM".
 * `tsconfig.base.json` backs that with `lib: ["ES2022"]` and no DOM, so a stray
 * `document` in `engine/src` is a compile error rather than a crash on whichever
 * host lacks it — Node, a Worker, or one of the three browsers
 * `vitest.browser.config.ts` drives.
 *
 * WP10 then added `engine/test-browser/worker/**`, which legitimately does need
 * `Worker`, `MessagePort.onmessage` and `MessageEvent<T>` — and put it inside
 * that DOM-free program by listing `test-browser/**` in `engine/tsconfig.json`.
 * It could not compile, and it did not: 7 errors. Because `npm run ci` runs
 * `typecheck` first and `&&`-chains the rest, the whole gate — `npm test`,
 * `check:scratch`, `lint:claims` — stopped running.
 *
 * ## The finding that matters more than the errors
 *
 * **Vitest transpiles without typechecking.** `npm run test:browser` was
 * reporting 51 green tests over two files that did not compile. Green tests are
 * therefore not evidence that a file typechecks; only a `tsc` project that
 * includes it is. So the browser sources are not merely *allowed* their own
 * project — they *require* one, or nothing checks them at all.
 *
 * ## What this test defends
 *
 * The arrangement, which is exactly the part that can silently regress:
 *
 *  1. the base program stays DOM-free, so `engine/src` cannot quietly acquire
 *     browser globals;
 *  2. `test-browser/**` is out of that program and inside `tsconfig.browser.json`,
 *     which has DOM;
 *  3. every tsconfig in this package is actually run by the `typecheck` script —
 *     a project nobody runs is the same as no project;
 *  4. the browser sources really do use DOM-only globals, so (2) is not
 *     decoration.
 *
 * What it does NOT do is re-run `tsc` — that is `npm run typecheck`'s job, and
 * duplicating a 30 s compile inside the unit suite would buy nothing. This is a
 * check on the wiring; the compiler is the check on the code.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// This file lives in `engine/test/`, so URL-relative ".." is `engine/`.
const ENGINE = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const WEBSIM = path.dirname(ENGINE);

/** Read a tsconfig, tolerating the `//` comments TypeScript allows in them. */
function readTsconfig(file: string): Record<string, unknown> {
  const raw = readFileSync(file, "utf8");
  const stripped = raw
    .split("\n")
    .map((l) => (/^\s*\/\//u.test(l) ? "" : l))
    .join("\n");
  return JSON.parse(stripped) as Record<string, unknown>;
}

function libOf(cfg: Record<string, unknown>): readonly string[] {
  const opts = (cfg["compilerOptions"] ?? {}) as Record<string, unknown>;
  const lib = opts["lib"];
  return Array.isArray(lib) ? lib.map(String) : [];
}

function includeOf(cfg: Record<string, unknown>): readonly string[] {
  const inc = cfg["include"];
  return Array.isArray(inc) ? inc.map(String) : [];
}

const hasDom = (libs: readonly string[]): boolean => libs.some((l) => /^dom\b/iu.test(l));

const base = readTsconfig(path.join(WEBSIM, "tsconfig.base.json"));
const node = readTsconfig(path.join(ENGINE, "tsconfig.json"));
const browser = readTsconfig(path.join(ENGINE, "tsconfig.browser.json"));
const pkg = JSON.parse(readFileSync(path.join(ENGINE, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
  description: string;
};

describe("the engine's zero-DOM boundary", () => {
  it("the shared base program has no DOM lib — that is what makes src portable", () => {
    const libs = libOf(base);
    expect(libs.length, "tsconfig.base.json must state its lib explicitly").toBeGreaterThan(0);
    expect(
      hasDom(libs),
      `tsconfig.base.json lib is ${JSON.stringify(libs)}. Adding DOM here would give browser ` +
        "globals to engine/src, pipeline and validation — all of which run under Node — and " +
        "delete the boundary engine/package.json advertises.",
    ).toBe(false);
    expect(pkg.description).toMatch(/zero DOM/u);
  });

  it("engine/tsconfig.json covers src and the Node tests, and NOT the browser ones", () => {
    const inc = includeOf(node);
    expect(inc).toContain("src/**/*.ts");
    expect(inc).toContain("test/**/*.ts");
    expect(
      inc.filter((g) => g.includes("test-browser")),
      "test-browser/** cannot be typechecked in a DOM-free program — it constructs Workers. " +
        "This is the exact configuration that produced 7 errors and took CI down.",
    ).toEqual([]);
    expect(hasDom(libOf(node)), "engine/tsconfig.json must not override lib with DOM").toBe(false);
  });

  it("engine/tsconfig.browser.json gives the browser sources DOM, and only them", () => {
    expect(browser["extends"]).toBe("../tsconfig.base.json");
    const libs = libOf(browser);
    expect(hasDom(libs), `browser project lib is ${JSON.stringify(libs)}`).toBe(true);
    expect(libs, "ES2022 must survive the override, not be replaced by DOM").toContain("ES2022");
    expect(includeOf(browser)).toEqual(["test-browser/**/*.ts"]);
  });

  it("every tsconfig in this package is actually run by `npm run typecheck`", () => {
    const configs = readdirSync(ENGINE).filter((f) => /^tsconfig(\..+)?\.json$/u.test(f));
    // Non-vacuity: if this ever finds one file, the assertion below is trivial.
    expect(configs.length, "expected at least the node and browser projects").toBeGreaterThanOrEqual(2);
    const script = pkg.scripts["typecheck"] ?? "";
    for (const c of configs) {
      expect(
        script.includes(c),
        `engine/package.json typecheck does not run ${c}: ${JSON.stringify(script)}. ` +
          "A typecheck project nothing invokes is the same as no project — and vitest " +
          "transpiles without typechecking, so its green tests would not notice.",
      ).toBe(true);
    }
  });

  it("the browser sources really do need DOM — so the split is not decoration", () => {
    const dir = path.join(ENGINE, "test-browser");
    const files: string[] = [];
    const walk = (d: string): void => {
      for (const e of readdirSync(d)) {
        const full = path.join(d, e);
        if (statSync(full).isDirectory()) walk(full);
        else if (full.endsWith(".ts")) files.push(full);
      }
    };
    walk(dir);
    expect(files.length, "engine/test-browser is empty").toBeGreaterThan(0);

    const text = files.map((f) => readFileSync(f, "utf8")).join("\n");
    // Each of these is a DOM-only construct; each named a real error in the
    // 7 that took CI down.
    expect(text, "no `new Worker(` — the WP10 acceptance tests must drive a real Worker").toMatch(
      /new Worker\(/u,
    );
    expect(text).toMatch(/new MessageChannel\(/u);
    expect(text).toMatch(/\.onmessage\s*=/u);
    expect(text).toMatch(/MessageEvent</u);
  });

  it("the browser vitest project runs exactly the directory the browser tsconfig covers", () => {
    const cfg = readFileSync(path.join(ENGINE, "vitest.browser.config.ts"), "utf8");
    const include = /include:\s*\[([^\]]*)\]/u.exec(cfg)?.[1] ?? "";
    expect(include, "could not find the browser project's include glob").toContain(
      "engine/test-browser/",
    );
    // Paths differ only by root: vitest runs from websim/, tsc from engine/.
    expect(includeOf(browser)[0]).toMatch(/^test-browser\//u);
  });
});
