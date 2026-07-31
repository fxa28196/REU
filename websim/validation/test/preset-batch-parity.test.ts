/**
 * preset-batch-parity.test.ts — every shipped preset must equal the Java
 * instrument's own batch file, parameter for parameter.
 *
 * The presets were transcribed from PORT_MAP §3.3 prose. This test checks that
 * transcription against the primary source: the read-only `Geography/batch/`
 * XML files the archived runs were actually executed from. A batch file declares
 * only the parameters that arm changes, so the comparison is
 *
 *     preset[name] === declared[name]  ?? PARAM_META[name].batchFallback
 *
 * which simultaneously verifies the transcription AND the fallback table — the
 * two things that would silently make a "faithful" preset run a different
 * configuration from the archive.
 *
 * `Geography/` lives outside `websim/` and is read-only. If it is absent (a
 * websim-only checkout) the suite is artifact-gated by the shared skip-vs-fail
 * policy: reported as skipped with a banner naming the missing batch directory
 * and the transcription evidence forgone, and a hard failure on a runner that
 * sets `WEBSIM_REQUIRE_ARTIFACTS` (plan §5.3). When it is present, any mismatch
 * is a hard failure.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

import { PARAM_META, PARAM_NAMES, PRESETS } from "@websim/shared";
import type { PresetId } from "@websim/shared";

import { artifactGate, describeGated } from "../../tools/artifact-gate.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const BATCH_DIR = join(REPO_ROOT, "Geography", "batch");

/** Preset ↔ the archived batch file it claims to reproduce (seed 42 member). */
const PRESET_BATCH_FILES: Readonly<Partial<Record<PresetId, string>>> = {
  A_present_day: "batch_params_2026_A_seed42.xml",
  B_capacity_meets_demand: "batch_params_2026_B_seed42.xml",
  C_expanded_plus_new_sites: "batch_params_2026_C_seed42.xml",
  E0_null_A: "batch_params_2026_E0null_A_seed42.xml",
  ER_baseline_real_A: "batch_params_2026_ER_A_seed42.xml",
  SE_severe_v1_E18: "batch_params_2026_SE_E18_seed42.xml",
  SE2_worst_plausible_E18_d1: "batch_params_2026_SE2_E18_d1_seed42.xml",
};

const PARAMETER_RE =
  /<parameter\s+name="([^"]+)"[^>]*constant_type="([^"]+)"\s+value="([^"]+)"\s*\/>/gu;

interface DeclaredParameter {
  readonly value: number;
  readonly constantType: string;
}

function readBatchFile(file: string): ReadonlyMap<string, DeclaredParameter> {
  const xml = readFileSync(join(BATCH_DIR, file), "utf8");
  const declared = new Map<string, DeclaredParameter>();
  for (const match of xml.matchAll(PARAMETER_RE)) {
    declared.set(match[1] as string, {
      value: Number(match[3]),
      constantType: match[2] as string,
    });
  }
  return declared;
}

const gate = artifactGate({
  gate: "validation:preset-batch-parity",
  suite: "presets vs the archived batch files",
  evidence:
    "every shipped preset checked parameter for parameter against the batch XML the archived " +
    "runs were executed from, plus the fallback table and the standing audit that no negative " +
    "constant is typed \"number\" (which Repast's batch loader would silently zero)",
  artifacts: Object.values(PRESET_BATCH_FILES).map((file) => ({
    source: "geography" as const,
    label: `batch/${file}`,
    path: join(BATCH_DIR, file),
  })),
});

describeGated(gate, () => {
  it("finds the read-only batch directory", () => {
    expect(gate.satisfied).toBe(true);
  });

  for (const [presetId, file] of Object.entries(PRESET_BATCH_FILES)) {
    it(`${presetId} equals ${file} plus documented fallbacks`, () => {
      const declared = readBatchFile(file);
      const config = PRESETS[presetId as PresetId];

      // The batch file must not declare a parameter the schema does not know:
      // that would mean the 41-parameter surface is incomplete.
      const unknown = [...declared.keys()].filter(
        (name) => !(PARAM_NAMES as readonly string[]).includes(name),
      );
      expect(unknown, `${file} declares parameters absent from the schema`).toEqual([]);

      for (const name of PARAM_NAMES) {
        const entry = declared.get(name);
        const expected = entry === undefined ? PARAM_META[name].batchFallback : entry.value;
        expect(expected, `${name} is REQUIRED but ${file} omits it`).not.toBeNull();
        expect(config[name], `${presetId}.${name} (source: ${entry ? file : "fallback"})`).toBe(
          expected,
        );
      }
    });
  }

  it("declares every negative constant as 'double', never 'number'", () => {
    // PORT_MAP §2.8: Repast's batch loader zeroes negative constant_type="number"
    // values. Any archived file that still types a negative as "number" executed
    // a zero, so this is both a transcription check and a standing audit of the
    // instrument's own inputs.
    for (const file of Object.values(PRESET_BATCH_FILES)) {
      for (const [name, entry] of readBatchFile(file)) {
        if (entry.value < 0) {
          expect(entry.constantType, `${file}: ${name}=${entry.value} is typed "number"`).toBe(
            "double",
          );
        }
      }
    }
  });
});

