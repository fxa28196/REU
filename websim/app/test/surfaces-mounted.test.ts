/**
 * Every user-facing surface is REACHABLE — the guard against dead UI.
 *
 * ## Why this file exists
 *
 * The WP12–WP14 acceptance gate of 2026-08-04 returned NO-GO on two blockers
 * that no existing test could see, because both were about *absence*:
 *
 *  - `usePermalinkSync` was implemented, covered by 46 green tests, and
 *    imported by **nothing**. The codec round-tripped every shipped preset
 *    while the shipped app could not read or write a `#p=` link at all.
 *  - `downloadRunOutputs` was implemented, covered by 21 green tests, and
 *    called from **nowhere**. Worse, the Run screen told users that
 *    person-hours "ship with the WP12 export" — pointing at a feature with no
 *    button.
 *
 * Both suites were green throughout. A unit test proves a function is correct;
 * it cannot prove anyone calls it, and "100 % green" read as "delivered" is
 * exactly the inference that failed here.
 *
 * ## What this checks, and what it deliberately does not
 *
 * These are **static source assertions**: they read the module text and require
 * that the wiring exists. That is a weaker claim than "the button works" —
 * which needs a browser and belongs to the WP13/WP14 browser gates — but it is
 * the claim that was false, and it is checkable in Node in milliseconds.
 *
 * Scope discipline: this file may only ever assert REACHABILITY. Behaviour
 * belongs in the surface's own suite (`permalink-url.test.ts`,
 * `export-download.test.ts`). If a check here starts asserting what a surface
 * *does*, it is in the wrong file.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

function source(...parts: readonly string[]): string {
  return readFileSync(path.join(SRC, ...parts), "utf8");
}

describe("permalink surface is mounted", () => {
  const app = source("App.tsx");

  it("App imports the sync hook from the permalink module", () => {
    expect(
      /import\s*\{[^}]*\busePermalinkSync\b[^}]*\}\s*from\s*"\.\/permalink\/url\.js"/u.test(app),
      "App.tsx does not import usePermalinkSync — an incoming #p= link would be ignored",
    ).toBe(true);
  });

  it("App CALLS the sync hook, not merely imports it", () => {
    expect(
      /usePermalinkSync\s*\(\s*\)/u.test(app),
      "usePermalinkSync is imported but never invoked in App.tsx — the hash is neither read nor written",
    ).toBe(true);
  });

  it("App renders the load-time notice, so a stale link is reported rather than silently dropped", () => {
    expect(
      /\bnotice\b/u.test(app),
      "App.tsx never renders the sync hook's `notice`; a stale-schema link would be discarded in silence",
    ).toBe(true);
  });

  it("App offers a way to OBTAIN a permalink", () => {
    expect(
      /encodePermalink\s*\(/u.test(app),
      "nothing in App.tsx encodes a permalink — users could follow a link but never produce one",
    ).toBe(true);
  });
});

describe("export surface is reachable", () => {
  const hook = source("sim", "useSimRun.ts");
  const run = source("screens", "Run.tsx");

  it("the sim-run hook imports the export bundler", () => {
    expect(
      /import\s*\{[^}]*\bdownloadRunOutputs\b[^}]*\}\s*from\s*"\.\.\/export\/download\.js"/u.test(hook),
      "useSimRun.ts does not import downloadRunOutputs — the export path has no owner with a client",
    ).toBe(true);
  });

  it("the hook calls it and exposes it on the handle", () => {
    expect(/downloadRunOutputs\s*\(/u.test(hook), "downloadRunOutputs is imported but never called").toBe(
      true,
    );
    expect(
      /\bexportRun\b/u.test(hook),
      "the handle does not expose exportRun, so no screen can reach the export",
    ).toBe(true);
  });

  it("the Run screen destructures exportRun and wires it to a control", () => {
    expect(
      /\bexportRun\b/u.test(run),
      "Run.tsx never takes exportRun off the handle — the export is unreachable from the UI",
    ).toBe(true);
    expect(
      /onClick=\{[^}]*doExport/su.test(run),
      "Run.tsx has no control calling the export — the feature exists but nothing invokes it",
    ).toBe(true);
  });

  it("the Run screen does not promise the export as future work", () => {
    // The exact false-promise wording the gate caught. It must not come back:
    // the feature now exists, so advertising it as pending is a lie about the
    // product, and this project's whole standard is that shipped text matches
    // shipped behaviour.
    expect(
      /ship with the WP12 export/u.test(run),
      'Run.tsx still says person-hours "ship with the WP12 export" — the export shipped; fix the copy',
    ).toBe(false);
  });
});
