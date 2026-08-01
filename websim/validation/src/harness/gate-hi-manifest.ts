/**
 * gate-hi-manifest.ts — gates (h) and (i), manifest completeness.
 *
 * Sources: `scripts/verify_E_runs.py`, `check_manifest()` (lines 615–624) and
 * `check_se_manifest()` (lines 630–641). Spec: §3.3 of
 * `websim/docs/WP8-SPEC-archive-gates.md` ("21 E + 7 SE params").
 *
 * ── Why a *completeness* gate earns its place ──────────────────────────────
 *
 * Every other gate in the suite reads executed parameters and compares them to
 * outcomes. All of that silently degrades to "vacuously true" if the parameter
 * simply is not in the manifest: `run.params.get("pStuck", 0.0)` returns 0.0,
 * gate (l.3) then tests a stuck share against a target of zero, and a green
 * line appears where no evidence exists. (h) and (i) are the gates that make
 * the other gates mean something.
 *
 * ── The two deliberate asymmetries ─────────────────────────────────────────
 *
 *  1. **`dirty is False`, not `not dirty`.** Python's `is False` is an identity
 *     test against the JSON boolean. `"unknown"`, `None` and a missing
 *     `source_integrity` block all FAIL, where a truthiness test would let
 *     `None` through as "clean". A run whose provenance is unknown is not a run
 *     whose tree was clean.
 *  2. **`closureDraw` is not in `SE_PARAMS`.** It entered the schema with the
 *     worst-case family, so the nine archived v1 SE runs legitimately lack it;
 *     it is asserted only when `closuresCode == 3`. Folding it into the list
 *     would turn nine correct runs red, which is how a gate loses its
 *     constituency.
 */

import type { Checks } from "./checks.js";
import { E_PARAMS, SE_PARAMS } from "./constants.js";
import { intParam, showValue, type RunView } from "./run-view.js";

/**
 * Gate (h): all 21 Phase-E parameters present, and the working tree was clean.
 * Registers exactly two checks.
 */
export function checkManifest(ck: Checks, run: RunView): void {
  const missing = E_PARAMS.filter((p) => !(p in run.params));
  ck.add(
    `(h) [${run.name}] all 21 Phase-E parameters in the manifest`,
    missing.length === 0,
    missing.length > 0
      ? `missing ${missing.length}: ${JSON.stringify(missing)}`
      : `${E_PARAMS.length}/${E_PARAMS.length} present, ` +
          `${Object.keys(run.params).length} parameters total`,
  );

  const integrity = run.repro["source_integrity"];
  const dirty =
    integrity !== null && typeof integrity === "object"
      ? (integrity as Record<string, unknown>)["git_working_tree_dirty"]
      : undefined;
  ck.add(
    `(h) [${run.name}] git_working_tree_dirty is false`,
    dirty === false,
    `git_working_tree_dirty=${showValue(dirty)}`,
  );
}

/**
 * Gate (i): the 7 core Scenario-E parameters, plus `closureDraw` for the
 * worst-case family. Registers one check, or two when `closuresCode == 3`.
 */
export function checkSeManifest(ck: Checks, run: RunView): void {
  const missing = SE_PARAMS.filter((p) => !(p in run.params));
  ck.add(
    `(i) [${run.name}] all ${SE_PARAMS.length} Scenario-E parameters in the manifest`,
    missing.length === 0,
    missing.length > 0
      ? `missing ${missing.length}: ${JSON.stringify(missing)}`
      : SE_PARAMS.map((p) => `${p}=${showValue(run.params[p])}`).join("; "),
  );

  const code = intParam(run.params, "closuresCode", 0);
  if (code === 3) {
    ck.add(
      `(i) [${run.name}] worst-family run records closureDraw`,
      "closureDraw" in run.params,
      `closureDraw=${showValue(run.params["closureDraw"])}`,
    );
  }
}
