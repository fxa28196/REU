/**
 * axe-gate.ts — `npm run axe`: the automated half of WP13's accessibility
 * acceptance clause, run against the BUILT app in a real browser.
 *
 * ## The defect this closes
 *
 * The independent acceptance gate of 2026-08-04 found WP13's "axe clean" clause
 * UNMET, and its evidence was not a disagreement about severity — it was that a
 * full-source grep for `axe.run` / `injectAxe` / `vitest-axe` / `jest-axe` /
 * `axe-core` over `websim/` returned NOTHING. `axe-core` appeared only as a
 * transitive lockfile dependency of `eslint-plugin-jsx-a11y`. WP13 had shipped
 * real accessibility work — accessible chart names, data-table alternatives, an
 * `aria-live` ticker throttled to simulated hours, the reduced-motion swap, a
 * skip link, and 26 Node a11y tests (`app/test/a11y.test.ts`) — but *no axe run
 * had ever happened*. The clause was being carried on the strength of adjacent
 * work. This file is the missing measurement.
 *
 * ## The dishonesty this gate is written to make impossible
 *
 * A headless scan of a page that has not finished booting reports "0 violations"
 * over a loading spinner. That is a *worse* outcome than a red gate: it is a
 * false green with an artefact attached. So every screen carries an explicit
 * readiness contract — a selector that must be present, the "still loading"
 * sentences that must be gone, and the failure sentences that must never be
 * there — and a screen that cannot reach ready inside {@link READY_TIMEOUT_MS}
 * FAILS LOUDLY with a snapshot of what was actually on screen instead of being
 * scanned anyway. The per-screen DOM census printed with each result exists for
 * the same reason: it lets a reader check that the scan saw a populated screen
 * rather than an empty shell.
 *
 * ## What it measures
 *
 * axe-core via `@axe-core/playwright` under the WCAG 2.2 AA tag set
 * (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`), in six passes:
 *
 *   1-4. the four screens — Run / Compare / Archive / Provenance;
 *   5.   the Run screen with the capability dialog open, because a native modal
 *        `<dialog>` concentrates a11y defects (focus containment, labelling,
 *        the Escape path) and exists only after Play is pressed;
 *   6.   the Run screen with every chart data-table toggle expanded — those
 *        tables are WP13's screen-reader alternative to the uPlot canvases and
 *        are `hidden`, hence invisible to axe, until opened.
 *
 * `serious` and `critical` findings fail the process. `minor` / `moderate` are
 * printed as advisory, and axe's `incomplete` results — the checks axe could not
 * decide, typically contrast over a canvas — are printed too, because a check
 * that did not run is not a check that passed.
 *
 * ## What it does NOT measure
 *
 * Automated scanning catches roughly a third of WCAG failures. Tab ORDER, focus
 * VISIBILITY in practice, whether the live region actually announces at a usable
 * cadence, and whether the reduced-motion path is comprehensible are not
 * decidable by a scanner. `docs/WP13-a11y-evidence.md` records that manual
 * portion as explicitly still-unexecuted, with the script to run.
 *
 * It also does not run a SIMULATION. Every pass here sees the app in its
 * pre-run state, so the chart data tables are scanned empty ("No rows yet —
 * press Play…") and the live ticker at rest. Populating them means executing a
 * research model in the scanner, which is a different gate; the limitation is
 * recorded in the evidence doc's manual script (steps 17-22) rather than
 * papered over by reporting the empty tables as "the data tables, scanned".
 *
 * ## Usage
 *
 *     npm run build -w app     # produces app/dist (required; ~30 MB staged)
 *     npm run axe
 *
 * Deliberately NOT wired into `npm run ci` yet — like `gate:browser` it needs
 * Playwright browser binaries (`npx playwright install chromium`), and the
 * decision to make a fresh clone's `npm run ci` depend on them belongs with the
 * WP13 sign-off, not with this file.
 */

import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { AxeBuilder } from "@axe-core/playwright";
import { chromium } from "playwright";
import type { Browser, Page } from "playwright";
import type { AxeResults, ImpactValue, Result as AxeRule } from "axe-core";

import { WEBSIM_ROOT } from "./artifact-policy.js";

// ---------------------------------------------------------------------------
// Page-side DOM surface
// ---------------------------------------------------------------------------

/**
 * The `tools` project deliberately does not load `lib.dom`: these are Node CLIs,
 * and pulling the browser globals in would type every tool against a runtime it
 * never executes in (and collide with `@types/node`'s timer signatures). The
 * functions below marked "runs IN the page" are serialised across the wire by
 * Playwright and evaluated in Chromium, so they DO need a DOM — declared here,
 * locally and minimally, covering exactly the members they touch. Anything
 * outside this surface is a compile error rather than a runtime surprise.
 */
interface PageElement {
  readonly textContent: string | null;
}
interface PageNodeList {
  readonly length: number;
}
interface PageDocument {
  querySelector(selector: string): PageElement | null;
  querySelectorAll(selector: string): PageNodeList;
  getElementById(id: string): PageElement | null;
  readonly body: { readonly innerText: string };
}
declare const document: PageDocument;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The built app. `npm run build -w app` stages assets into public/ then builds. */
export const DIST_ROOT = path.join(WEBSIM_ROOT, "app", "dist");

/**
 * WCAG 2.2 Level AA. `wcag22aa` alone would not include the 2.0/2.1 rules it
 * builds on — axe tags are additive per-version, not cumulative.
 */
export const WCAG_TAGS: readonly string[] = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
];

/**
 * How long a screen gets to reach its ready contract. Generous on purpose: the
 * Run screen fetches ~30 MB of assets, SHA-256-verifies every one of them, boots
 * an ES-module worker and decodes the street graph before it is honest to scan.
 * Exceeding this is a hard failure, never a "scan it anyway".
 */
export const READY_TIMEOUT_MS = 180_000;

/** Impacts that fail the process. Everything else is advisory. */
export const BLOCKING_IMPACTS: readonly ImpactValue[] = ["serious", "critical"];

const MIME: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".bin": "application/octet-stream",
  ".br": "application/octet-stream",
};

// ---------------------------------------------------------------------------
// Screen readiness contracts
// ---------------------------------------------------------------------------

/**
 * What "this screen is ready to be scanned" means, as data.
 *
 * `pendingTexts` are the screen's own loading sentences; while any of them is on
 * screen the scan has not earned the right to run. `failureTexts` /
 * `failureSelectors` are states where the screen rendered but its DATA did not
 * arrive — scanning those is scanning an error message, so they are hard
 * failures with the offending text quoted.
 */
export interface ScreenSpec {
  /** Accessible name of the top-bar tab button. */
  readonly tab: string;
  /** Human label used in the report. */
  readonly label: string;
  /** Must be present for the screen to count as rendered at all. */
  readonly presentSelector: string;
  /** Substrings that mean "still loading" — all must be absent. */
  readonly pendingTexts: readonly string[];
  /** Substrings that mean "this screen failed to load its data". */
  readonly failureTexts: readonly string[];
  /** Selectors that mean the same thing. */
  readonly failureSelectors: readonly string[];
}

/** Rendered but crashed, on every screen: `ErrorBoundary`'s failure panel. */
const UNIVERSAL_FAILURE_SELECTORS: readonly string[] = [".error-boundary-panel"];

export const SCREENS: readonly ScreenSpec[] = [
  {
    tab: "Run",
    label: "Run",
    presentSelector: ".run-grid",
    // Run.tsx renders this overlay while `!ready` — i.e. while assets are still
    // being fetched/verified and the sim worker is still booting.
    pendingTexts: ["booting the simulation worker"],
    failureTexts: [],
    // .map-overlay-error carries useSimRun().error verbatim.
    failureSelectors: [...UNIVERSAL_FAILURE_SELECTORS, ".map-overlay-error"],
  },
  {
    tab: "Compare",
    label: "Compare",
    presentSelector: 'section[aria-label="Compare overview"]',
    pendingTexts: ["booting the simulation worker"],
    failureTexts: [],
    failureSelectors: UNIVERSAL_FAILURE_SELECTORS,
  },
  {
    tab: "Archive",
    label: "Archive",
    presentSelector: 'section[aria-label="Archive of certified runs"]',
    pendingTexts: ["Loading the archive index"],
    failureTexts: ["Archive index unavailable"],
    failureSelectors: UNIVERSAL_FAILURE_SELECTORS,
  },
  {
    tab: "Provenance",
    label: "Provenance",
    presentSelector: 'section[aria-label="Governance registry"]',
    pendingTexts: [
      "Loading the registry snapshot",
      "Decoding the graph asset",
      "Loading the asset manifest",
    ],
    failureTexts: [
      "Registry snapshot unavailable",
      "Asset manifest unavailable",
      "Graph asset unavailable",
    ],
    failureSelectors: UNIVERSAL_FAILURE_SELECTORS,
  },
];

// ---------------------------------------------------------------------------
// Static server (node:http + node:fs — no new dependency)
// ---------------------------------------------------------------------------

export interface StaticServer {
  readonly server: Server;
  readonly origin: string;
  /** Paths the page requested that do not exist in dist — reported, not hidden. */
  readonly misses: readonly string[];
}

function contentType(file: string): string {
  return MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream";
}

async function respond(
  root: string,
  misses: string[],
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(req.url ?? "/", "http://127.0.0.1").pathname);
  } catch {
    res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    res.end("bad request-target");
    return;
  }
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const absolute = path.resolve(root, relative);
  // Traversal guard: a served tree is a served tree, not a filesystem.
  if (absolute !== root && !absolute.startsWith(root + path.sep)) {
    res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    res.end("forbidden");
    return;
  }
  try {
    const bytes = await readFile(absolute);
    res.writeHead(200, {
      "content-type": contentType(absolute),
      "content-length": String(bytes.byteLength),
      "cache-control": "no-store",
    });
    res.end(bytes);
  } catch {
    misses.push(pathname);
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end(`404 ${pathname}`);
  }
}

export async function startStaticServer(root: string): Promise<StaticServer> {
  const misses: string[] = [];
  const server = createServer((req, res) => {
    void respond(root, misses, req, res);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      resolve();
    });
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("static server did not bind a TCP port");
  }
  return { server, origin: `http://127.0.0.1:${address.port}`, misses };
}

// ---------------------------------------------------------------------------
// Readiness probe
// ---------------------------------------------------------------------------

interface ProbeArg {
  readonly presentSelector: string;
  readonly pendingTexts: readonly string[];
  readonly failureTexts: readonly string[];
  readonly failureSelectors: readonly string[];
}

type ProbeResult =
  | false
  | { readonly state: "ready"; readonly census: DomCensus }
  | { readonly state: "failed"; readonly detail: string };

/** What the scan actually saw — printed so "0 violations" can be audited. */
export interface DomCensus {
  readonly elements: number;
  readonly tables: number;
  readonly buttons: number;
  readonly headings: number;
  readonly liveRegions: number;
  readonly visibleTextChars: number;
}

/**
 * Runs IN the page. Must be self-contained (it is serialised across the wire),
 * and returns `false` to keep polling.
 */
function readinessProbe(arg: ProbeArg): ProbeResult {
  if (document.querySelector(".app-shell") === null) {
    return false;
  }
  if (document.getElementById("boot") !== null) {
    return false; // React has not replaced index.html's pre-app shell
  }
  for (const selector of arg.failureSelectors) {
    const hit = document.querySelector(selector);
    if (hit !== null) {
      return {
        state: "failed",
        detail: `${selector} is present: ${(hit.textContent ?? "").trim().slice(0, 400)}`,
      };
    }
  }
  const text = document.body.innerText;
  for (const needle of arg.failureTexts) {
    if (text.includes(needle)) {
      return { state: "failed", detail: `page reports "${needle}"` };
    }
  }
  if (document.querySelector(arg.presentSelector) === null) {
    return false;
  }
  for (const needle of arg.pendingTexts) {
    if (text.includes(needle)) {
      return false;
    }
  }
  return {
    state: "ready",
    census: {
      elements: document.querySelectorAll("*").length,
      tables: document.querySelectorAll("table").length,
      buttons: document.querySelectorAll("button").length,
      headings: document.querySelectorAll("h1, h2, h3, h4, h5, h6").length,
      liveRegions: document.querySelectorAll("[role=status], [aria-live]").length,
      visibleTextChars: text.length,
    },
  };
}

/** Whatever is on screen right now, for a loud timeout message. */
async function snapshot(page: Page): Promise<string> {
  try {
    return await page.evaluate(() => {
      const shell = document.querySelector(".app-shell");
      const head = shell === null ? "(no .app-shell — React never mounted)" : "";
      const body = document.body.innerText.replace(/\s+/g, " ").trim().slice(0, 600);
      return `${head} body text: ${body}`;
    });
  } catch (err: unknown) {
    return `(could not snapshot the page: ${err instanceof Error ? err.message : String(err)})`;
  }
}

export async function waitForScreenReady(page: Page, spec: ScreenSpec): Promise<DomCensus> {
  const arg: ProbeArg = {
    presentSelector: spec.presentSelector,
    pendingTexts: spec.pendingTexts,
    failureTexts: spec.failureTexts,
    failureSelectors: spec.failureSelectors,
  };
  let probe: ProbeResult;
  try {
    const handle = await page.waitForFunction(readinessProbe, arg, {
      timeout: READY_TIMEOUT_MS,
      polling: 250,
    });
    probe = await handle.jsonValue();
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `The ${spec.label} screen did not reach a ready state within ${READY_TIMEOUT_MS} ms.\n` +
        `  Ready contract: "${spec.presentSelector}" present; none of ` +
        `[${spec.pendingTexts.join(", ")}] on screen.\n` +
        `  Underlying wait: ${detail}\n` +
        `  On screen now: ${await snapshot(page)}\n` +
        `  REFUSING to scan — an axe run over a loading screen would report "0 violations" ` +
        `about a spinner, which is worse than reporting this failure.`,
    );
  }
  if (probe === false) {
    throw new Error(`internal: readiness probe for ${spec.label} resolved falsy`);
  }
  if (probe.state === "failed") {
    throw new Error(
      `The ${spec.label} screen rendered a FAILURE state, so there is nothing honest to scan.\n` +
        `  ${probe.detail}\n` +
        `  Fix the app (or the served asset tree) and re-run; the gate will not scan an error page.`,
    );
  }
  return probe.census;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

const out = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

function targetText(target: unknown): string {
  if (Array.isArray(target)) {
    return target
      .map((t) => (Array.isArray(t) ? (t as string[]).join(" >>> ") : String(t)))
      .join(" , ");
  }
  return String(target);
}

/** True when a finding must fail the process. `null`/`undefined` impact is advisory. */
export function isBlocking(rule: Pick<AxeRule, "impact">): boolean {
  const impact = rule.impact ?? null;
  return impact !== null && BLOCKING_IMPACTS.includes(impact);
}

function printRule(rule: AxeRule, prefix: string): void {
  out(`${prefix} ${rule.id}  [impact: ${rule.impact ?? "none recorded"}]  (${rule.nodes.length} node(s))`);
  out(`      ${rule.help}`);
  out(`      ${rule.helpUrl}`);
  for (const node of rule.nodes) {
    out(`      - selector: ${targetText(node.target)}`);
    const summary = node.failureSummary;
    if (summary !== undefined && summary.length > 0) {
      for (const line of summary.split("\n")) {
        out(`          ${line.trim()}`);
      }
    }
    out(`          html: ${node.html.replace(/\s+/g, " ").slice(0, 200)}`);
  }
}

export interface ScanReport {
  readonly label: string;
  readonly url: string;
  readonly census: DomCensus;
  readonly results: AxeResults;
}

function printScan(report: ScanReport): number {
  const { violations, incomplete, passes } = report.results;
  const blocking = violations.filter(isBlocking);
  const advisory = violations.filter((v) => !isBlocking(v));
  out("");
  out(`--- ${report.label} -----------------------------------------------------`);
  out(
    `    DOM census: ${report.census.elements} elements, ${report.census.headings} headings, ` +
      `${report.census.buttons} buttons, ${report.census.tables} tables, ` +
      `${report.census.liveRegions} live region(s), ${report.census.visibleTextChars} chars of visible text`,
  );
  out(
    `    axe: ${passes.length} rule(s) passed, ${violations.length} violated, ` +
      `${incomplete.length} incomplete (needs human review)`,
  );
  if (violations.length === 0) {
    out("    No violations.");
  }
  for (const rule of blocking) {
    printRule(rule, "    FAIL     ");
  }
  for (const rule of advisory) {
    printRule(rule, "    advisory ");
  }
  for (const rule of incomplete) {
    out(
      `    review   ${rule.id}  [impact: ${rule.impact ?? "none recorded"}]  ` +
        `(${rule.nodes.length} node(s)) — axe could not decide; a human must look`,
    );
    // The REASON is the whole value of an incomplete result. "axe could not
    // decide" with no cause is an item nobody can action; "background could
    // not be determined because of a canvas underneath" is a five-minute check.
    const reasons = new Map<string, number>();
    for (const node of rule.nodes) {
      for (const check of [...node.any, ...node.all, ...node.none]) {
        const message = check.message ?? "(no message)";
        reasons.set(message, (reasons.get(message) ?? 0) + 1);
      }
    }
    for (const [message, count] of reasons) {
      out(`        why (${count} node(s)): ${message}`);
    }
    for (const node of rule.nodes) {
      out(`      - selector: ${targetText(node.target)}`);
    }
  }
  return blocking.length;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function scan(page: Page, label: string, census: DomCensus): Promise<ScanReport> {
  const results = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze();
  return { label, url: page.url(), census, results };
}

async function domCensus(page: Page): Promise<DomCensus> {
  return page.evaluate(() => ({
    elements: document.querySelectorAll("*").length,
    tables: document.querySelectorAll("table").length,
    buttons: document.querySelectorAll("button").length,
    headings: document.querySelectorAll("h1, h2, h3, h4, h5, h6").length,
    liveRegions: document.querySelectorAll("[role=status], [aria-live]").length,
    visibleTextChars: document.body.innerText.length,
  }));
}

async function main(): Promise<void> {
  try {
    await readFile(path.join(DIST_ROOT, "index.html"));
  } catch {
    out(`!! ${DIST_ROOT} has no index.html.`);
    out("!! The axe gate scans the BUILT app, not the dev server. Build it first:");
    out("!!     npm run build -w app");
    process.exitCode = 1;
    return;
  }

  const served = await startStaticServer(DIST_ROOT);
  let browser: Browser | null = null;
  const consoleErrors: string[] = [];
  const reports: ScanReport[] = [];
  /** Failures that are not axe violations but still forbid a green verdict. */
  const structuralFailures: string[] = [];

  try {
    try {
      browser = await chromium.launch({ headless: true });
    } catch (err: unknown) {
      out("!! Chromium could not be launched, so NO accessibility measurement happened.");
      out(`!!   ${err instanceof Error ? err.message : String(err)}`);
      out("!! Install the browser and re-run:  npx playwright install chromium");
      out('!! The WP13 "axe clean" clause remains UNMET — an unrun scan is not a clean scan.');
      process.exitCode = 1;
      return;
    }

    // An explicit context, NOT `browser.newPage()`: that helper owns its context
    // and rejects a second page in it, while `@axe-core/playwright`'s
    // `finishRun` opens a blank sibling page to assemble the partial results.
    // With an owned context the scan dies with Playwright's bare
    // "Please use browser.newContext()".
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const page = await context.newPage();
    page.on("pageerror", (err) => {
      consoleErrors.push(`pageerror: ${err.message}`);
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(`console.error: ${msg.text()}`);
      }
    });

    out(`axe-gate: serving ${DIST_ROOT} at ${served.origin}`);
    out(`axe-gate: WCAG tags ${WCAG_TAGS.join(", ")}; ready timeout ${READY_TIMEOUT_MS} ms`);
    await page.goto(`${served.origin}/index.html`, { waitUntil: "domcontentloaded", timeout: 60_000 });

    const runSpec = SCREENS[0];
    if (runSpec === undefined) {
      throw new Error("internal: SCREENS is empty");
    }
    out(`axe-gate: waiting for the ${runSpec.label} screen to boot (assets + worker)…`);
    await waitForScreenReady(page, runSpec);

    for (const spec of SCREENS) {
      await page.getByRole("button", { name: spec.tab, exact: true }).click();
      const census = await waitForScreenReady(page, spec);
      reports.push(await scan(page, `${spec.label} screen`, census));
    }

    await page.getByRole("button", { name: "Run", exact: true }).click();
    await waitForScreenReady(page, runSpec);

    // Fifth pass: the capability dialog. A native modal `<dialog>` is a surface
    // where a11y defects concentrate (focus containment, labelling, the
    // Escape path), and it is not reachable by the tab sweep above because it
    // only exists once Play is pressed. Pressing Play does NOT start a run —
    // the dialog is the gate in front of one — so this costs nothing.
    await page.getByRole("button", { name: "Play simulation", exact: true }).click();
    const dialog = page.locator("dialog.capability-dialog[open]");
    await dialog.waitFor({ state: "visible", timeout: 30_000 });
    reports.push(await scan(page, "Run screen, capability dialog open", await domCensus(page)));
    await page
      .getByRole("button", { name: "Show archived certified results only", exact: true })
      .click();
    await dialog.waitFor({ state: "hidden", timeout: 30_000 });

    // Sixth pass: WP13's data-table alternatives are `hidden` until their
    // toggle is pressed, and axe does not scan hidden subtrees. A gate that
    // never opened them would be reporting on markup the clause is not about.
    const toggles = page.locator("button.data-table-toggle");
    const toggleCount = await toggles.count();
    for (let i = 0; i < toggleCount; i += 1) {
      await toggles.nth(i).click();
    }
    if (toggleCount > 0) {
      reports.push(
        await scan(
          page,
          `Run screen, ${toggleCount} chart data-table(s) expanded`,
          await domCensus(page),
        ),
      );
    } else {
      structuralFailures.push(
        "No .data-table-toggle buttons were found on the Run screen — the chart data-table " +
          "alternative WP13 claims to ship was not present to scan.",
      );
    }
  } finally {
    if (browser !== null) {
      await browser.close();
    }
    await new Promise<void>((resolve) => {
      served.server.close(() => {
        resolve();
      });
    });
  }

  out("");
  out("===========================================================================");
  out(`axe-core WCAG 2.2 AA scan — ${new Date().toISOString()}`);
  out("===========================================================================");
  let blocking = 0;
  for (const report of reports) {
    blocking += printScan(report);
  }

  out("");
  out("--- run conditions --------------------------------------------------------");
  if (served.misses.length === 0) {
    out("    Every asset the page requested was served (no 404s).");
  } else {
    out(`    ${served.misses.length} request(s) 404'd — the scan saw a partially-loaded app:`);
    for (const miss of [...new Set(served.misses)]) {
      out(`      ${miss}`);
    }
  }
  if (consoleErrors.length === 0) {
    out("    No page errors or console errors.");
  } else {
    out(`    ${consoleErrors.length} page/console error(s) during the scan:`);
    for (const line of [...new Set(consoleErrors)].slice(0, 20)) {
      out(`      ${line}`);
    }
  }

  out("");
  for (const failure of structuralFailures) {
    out(`!! ${failure}`);
  }
  if (blocking > 0 || structuralFailures.length > 0) {
    out(
      `FAIL: ${blocking} serious/critical violation(s) across ${reports.length} scan(s)` +
        `${structuralFailures.length > 0 ? `, plus ${structuralFailures.length} structural failure(s)` : ""}.`,
    );
    process.exitCode = 1;
    return;
  }
  out(`PASS: 0 serious/critical violations across ${reports.length} scan(s).`);
  out("NOTE: automated scanning covers only part of WCAG. The manual keyboard /");
  out("      screen-reader script in docs/WP13-a11y-evidence.md is a SEPARATE");
  out("      obligation and is not discharged by this gate.");
}

await main().catch((err: unknown) => {
  out("");
  out("!! axe-gate FAILED before it could report a verdict:");
  out(`!! ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
  out('!! The WP13 "axe clean" clause is NOT met by this run.');
  process.exitCode = 1;
});
