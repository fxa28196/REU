/**
 * lint-claims.ts — CLI for the websim claim linter (`npm run lint:claims`).
 *
 * Scans every source, markdown and JSON file under `websim/` for banned or
 * retired claim text (plan §5.3; runs from WP0 day 1 per risk W19). Exit status
 * is 1 on any finding, or on a stale quarantine entry.
 *
 *   npm run lint:claims
 *   npm run lint:claims -- --json
 */

import { CLAIM_RULES, QUARANTINE } from "./claims.js";
import { scanTree, WEBSIM_ROOT } from "./scan.js";

const asJson = process.argv.slice(2).includes("--json");
const result = scanTree();
const active = CLAIM_RULES.filter((r) => r.status !== "live");
const byId = new Map(CLAIM_RULES.map((r) => [r.id, r]));

if (asJson) {
  process.stdout.write(
    `${JSON.stringify(
      {
        root: WEBSIM_ROOT,
        rules: active.length,
        filesScanned: result.filesScanned.length,
        quarantined: QUARANTINE,
        staleQuarantine: result.staleQuarantine,
        hits: result.hits,
      },
      null,
      2,
    )}\n`,
  );
} else {
  for (const hit of result.hits) {
    process.stdout.write(
      `${hit.file}:${hit.line}:${hit.column}: ${hit.ruleId} [${hit.status}] matched: '${hit.matched}'\n`,
    );
    const replacement = byId.get(hit.ruleId)?.replacement;
    if (replacement !== undefined) {
      process.stdout.write(`    replacement: ${replacement.split(/\s+/u).join(" ")}\n`);
    }
  }
  for (const stale of result.staleQuarantine) {
    process.stdout.write(
      `quarantine: '${stale}' is listed as exempt but does not exist — remove the entry\n`,
    );
  }

  const files = new Set(result.hits.map((h) => h.file)).size;
  process.stderr.write(
    `claim linter: ${result.hits.length} hit(s) in ${files} file(s); ` +
      `${result.filesScanned.length} file(s) scanned against ${active.length} active rule(s); ` +
      `${QUARANTINE.length} path(s) quarantined.\n`,
  );
  if (result.hits.length === 0 && result.staleQuarantine.length === 0) {
    process.stderr.write("claim linter: clean.\n");
  }
}

process.exitCode = result.hits.length > 0 || result.staleQuarantine.length > 0 ? 1 : 0;
