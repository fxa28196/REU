/**
 * scan.ts — the scanning engine behind `npm run lint:claims`.
 *
 * Pure functions over text and the filesystem so the unit tests can drive
 * detection from in-memory fixtures (`scanText`) and separately assert that the
 * real tree is clean (`scanTree`).
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CLAIM_RULES,
  EXCLUDED_DIR_NAMES,
  EXCLUDED_DIR_PATHS,
  EXCLUDED_FILE_NAMES,
  QUARANTINE,
  SCANNED_EXTENSIONS,
  type ClaimRule,
  type ClaimStatus,
} from "./claims.js";

/** Absolute path of `websim/` — the only tree this linter ever reads. */
export const WEBSIM_ROOT: string = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

export interface Hit {
  /** POSIX path relative to `websim/`, or the caller-supplied label. */
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly ruleId: string;
  readonly status: ClaimStatus;
  /** The matched text, whitespace-collapsed and truncated for display. */
  readonly matched: string;
}

export interface TreeScan {
  readonly hits: readonly Hit[];
  readonly filesScanned: readonly string[];
  readonly quarantined: readonly string[];
  /** Quarantine entries whose file no longer exists — a stale exemption. */
  readonly staleQuarantine: readonly string[];
}

interface RawHit {
  readonly rule: ClaimRule;
  readonly start: number;
  readonly end: number;
  readonly matched: string;
}

const DISPLAY_LIMIT = 100;

function lineStarts(text: string): number[] {
  const starts: number[] = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) starts.push(i + 1);
  }
  return starts;
}

function locate(starts: readonly number[], offset: number): { line: number; column: number } {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((starts[mid] ?? 0) <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, column: offset - (starts[lo] ?? 0) + 1 };
}

function overlaps(a: RawHit, b: RawHit): boolean {
  return a.start < b.end && b.start < a.end;
}

function display(matched: string): string {
  const collapsed = matched.split(/\s+/u).join(" ").trim();
  return collapsed.length > DISPLAY_LIMIT
    ? `${collapsed.slice(0, DISPLAY_LIMIT - 3)}...`
    : collapsed;
}

/**
 * Scan one blob of text. `live` rules are documentation only and never match.
 * A backstop rule's hit is dropped when it overlaps a hit from the specific rule
 * it backs, so one offending sentence yields one finding.
 */
export function scanText(
  text: string,
  file = "<memory>",
  rules: readonly ClaimRule[] = CLAIM_RULES,
): Hit[] {
  const specific: RawHit[] = [];
  const backstops: RawHit[] = [];

  for (const rule of rules) {
    if (rule.status === "live") continue;
    const flags = rule.pattern.flags.includes("g")
      ? rule.pattern.flags
      : `${rule.pattern.flags}g`;
    const rx = new RegExp(rule.pattern.source, flags);
    for (const match of text.matchAll(rx)) {
      const matched = match[0];
      if (matched.length === 0) continue;
      const start = match.index ?? 0;
      const raw: RawHit = { rule, start, end: start + matched.length, matched };
      if (rule.backstopFor === undefined) specific.push(raw);
      else backstops.push(raw);
    }
  }

  const kept = specific.concat(
    backstops.filter(
      (b) => !specific.some((s) => s.rule.id === b.rule.backstopFor && overlaps(s, b)),
    ),
  );

  const starts = lineStarts(text);
  return kept
    .map((raw): Hit => {
      const { line, column } = locate(starts, raw.start);
      return {
        file,
        line,
        column,
        ruleId: raw.rule.id,
        status: raw.rule.status,
        matched: display(raw.matched),
      };
    })
    .sort(
      (a, b) => a.line - b.line || a.column - b.column || a.ruleId.localeCompare(b.ruleId),
    );
}

/** Every scannable file under `websim/`, POSIX-relative and sorted. */
export function collectFiles(root: string = WEBSIM_ROOT): string[] {
  const quarantined = new Set(QUARANTINE.map((q) => q.path));
  const found: string[] = [];

  const walk = (absDir: string, relDir: string): void => {
    const entries = readdirSync(absDir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
      const rel = relDir === "" ? entry.name : `${relDir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (EXCLUDED_DIR_NAMES.has(entry.name)) continue;
        if (EXCLUDED_DIR_PATHS.has(rel)) continue;
        walk(path.join(absDir, entry.name), rel);
        continue;
      }
      if (!entry.isFile()) continue;
      if (EXCLUDED_FILE_NAMES.has(entry.name)) continue;
      if (!SCANNED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
      if (quarantined.has(rel)) continue;
      found.push(rel);
    }
  };

  walk(root, "");
  return found;
}

function exists(absPath: string): boolean {
  try {
    return statSync(absPath).isFile();
  } catch {
    return false;
  }
}

/** Scan the whole `websim/` tree. */
export function scanTree(
  root: string = WEBSIM_ROOT,
  rules: readonly ClaimRule[] = CLAIM_RULES,
): TreeScan {
  const filesScanned = collectFiles(root);
  const hits: Hit[] = [];
  for (const rel of filesScanned) {
    const text = readFileSync(path.join(root, rel), "utf8");
    hits.push(...scanText(text, rel, rules));
  }
  hits.sort(
    (a, b) =>
      a.file.localeCompare(b.file) ||
      a.line - b.line ||
      a.column - b.column ||
      a.ruleId.localeCompare(b.ruleId),
  );
  return {
    hits,
    filesScanned,
    quarantined: QUARANTINE.map((q) => q.path),
    staleQuarantine: QUARANTINE.map((q) => q.path).filter(
      (p) => !exists(path.join(root, p)),
    ),
  };
}
