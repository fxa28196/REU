/**
 * Stage the pipeline's built assets into `app/public/` for Vite dev + build.
 *
 * `pipeline/out/` is the single source of truth; this copy exists only because
 * Vite serves exactly one `publicDir`. The staged tree is git-ignored, and the
 * asset manifest's SHA-256s are re-verified in the browser at load time
 * (`src/assets/loader.ts`), so a stale copy fails loudly instead of silently
 * serving old bytes.
 *
 *     npm run stage-assets -w app
 *
 * Copies:
 *   pipeline/out/assets/           -> app/public/assets/
 *   pipeline/out/archive-bundles/  -> app/public/archive-bundles/
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEBSIM_ROOT = path.resolve(APP_ROOT, "..");

const COPIES: ReadonlyArray<{ readonly from: string; readonly to: string }> = [
  {
    from: path.join(WEBSIM_ROOT, "pipeline", "out", "assets"),
    to: path.join(APP_ROOT, "public", "assets"),
  },
  {
    from: path.join(WEBSIM_ROOT, "pipeline", "out", "archive-bundles"),
    to: path.join(APP_ROOT, "public", "archive-bundles"),
  },
];

function countFiles(dir: string): number {
  let n = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) {
      n++;
    }
  }
  return n;
}

let staged = 0;
for (const { from, to } of COPIES) {
  if (!existsSync(from)) {
    // Loud, with the producing command — the artifact-gate discipline (§8.1).
    process.stderr.write(
      `stage-assets: MISSING ${from}\n` +
        `  The asset pipeline has not produced this directory on this machine.\n` +
        `  Produce it with:  npm run build -w pipeline   (see websim/README.md)\n`,
    );
    process.exit(1);
  }
  rmSync(to, { recursive: true, force: true });
  mkdirSync(path.dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
  const n = countFiles(to);
  staged += n;
  process.stderr.write(`stage-assets: ${path.relative(WEBSIM_ROOT, from)} -> ${path.relative(WEBSIM_ROOT, to)} (${n} files)\n`);
}
process.stderr.write(`stage-assets: ${staged} files staged.\n`);
