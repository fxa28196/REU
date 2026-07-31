/**
 * config.ts — `RunConfig` (UI intent) and the config-diff helper.
 *
 * `RunConfig` is inferred from the schema, never declared separately: adding a
 * parameter to `schema.ts` adds it to this type, and every construction site
 * that omits it stops compiling. That is the type-level half of the "all 41
 * explicit" rule; `RunConfigSchema` is the runtime half.
 *
 * `RunConfig` is deliberately NOT the same type as `ExecutedManifest`'s executed
 * parameter block (plan §3.1). This file describes what a user asked for; the
 * manifest describes what the engine actually ran. The diff between them is a
 * first-class UI surface and a badge input.
 */

import type { z } from "zod";

import type { ParamName } from "./schema.js";
import { PARAM_NAMES, RunConfigPatchSchema, RunConfigSchema } from "./schema.js";

/** A complete run configuration: all 41 parameters, explicit, no optionals. */
export type RunConfig = z.infer<typeof RunConfigSchema>;

/** A sparse override set — the permalink payload and the "modified" chip. */
export type RunConfigPatch = z.infer<typeof RunConfigPatchSchema>;

/**
 * Compile-time proof that `RunConfig` has exactly the 41 declared keys. If a
 * parameter is added to the schema but not to `PARAM_NAMES` (or the reverse),
 * this assignment fails to typecheck.
 */
type _ParamKeysMatch = [ParamName] extends [keyof RunConfig]
  ? [keyof RunConfig] extends [ParamName]
    ? true
    : never
  : never;
const _paramKeysMatch: _ParamKeysMatch = true;
void _paramKeysMatch;

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export type RunConfigParseResult =
  | { readonly ok: true; readonly config: RunConfig }
  | { readonly ok: false; readonly issues: readonly RunConfigIssue[] };

export interface RunConfigIssue {
  /** Parameter the issue belongs to, or `null` for whole-object issues. */
  readonly param: ParamName | null;
  readonly message: string;
}

/** Validate an unknown value as a complete `RunConfig`. Never throws. */
export function safeParseRunConfig(value: unknown): RunConfigParseResult {
  const parsed = RunConfigSchema.safeParse(value);
  if (parsed.success) {
    return { ok: true, config: parsed.data };
  }
  return {
    ok: false,
    issues: parsed.error.issues.map((issue) => {
      const head = issue.path[0];
      const param =
        typeof head === "string" && (PARAM_NAMES as readonly string[]).includes(head)
          ? (head as ParamName)
          : null;
      return { param, message: issue.message };
    }),
  };
}

/** Validate or throw. Use at trust boundaries where a failure is a bug. */
export function parseRunConfig(value: unknown, context = "run config"): RunConfig {
  const result = safeParseRunConfig(value);
  if (result.ok) {
    return result.config;
  }
  const detail = result.issues
    .map((i) => `${i.param ?? "(config)"}: ${i.message}`)
    .join("; ");
  throw new Error(`Invalid ${context}: ${detail}`);
}

/** Validate a sparse override set. Never throws. */
export function safeParseRunConfigPatch(
  value: unknown,
): { readonly ok: true; readonly patch: RunConfigPatch } | { readonly ok: false; readonly issues: readonly RunConfigIssue[] } {
  const parsed = RunConfigPatchSchema.safeParse(value);
  if (parsed.success) {
    return { ok: true, patch: parsed.data };
  }
  return {
    ok: false,
    issues: parsed.error.issues.map((issue) => {
      const head = issue.path[0];
      const param =
        typeof head === "string" && (PARAM_NAMES as readonly string[]).includes(head)
          ? (head as ParamName)
          : null;
      return { param, message: issue.message };
    }),
  };
}

// ---------------------------------------------------------------------------
// Diffing
// ---------------------------------------------------------------------------

export interface RunConfigDelta {
  readonly param: ParamName;
  readonly base: number;
  readonly other: number;
}

/**
 * Ordered list of parameters whose values differ, in manifest order.
 *
 * Comparison is `Object.is`, not `===`, so `-0` and `+0` are reported as a
 * difference: the engine's formatters render them differently and a silent
 * sign-of-zero change is exactly the class of drift this diff exists to catch.
 * `NaN` compares equal to `NaN` under `Object.is`, which is the behaviour we
 * want (a NaN parameter is already a validation failure, not a diff).
 */
export function diffRunConfigs(base: RunConfig, other: RunConfig): readonly RunConfigDelta[] {
  const deltas: RunConfigDelta[] = [];
  for (const param of PARAM_NAMES) {
    const a = base[param];
    const b = other[param];
    if (!Object.is(a, b)) {
      deltas.push({ param, base: a, other: b });
    }
  }
  return deltas;
}

/** `true` when two configs are identical on all 41 parameters. */
export function configsEqual(base: RunConfig, other: RunConfig): boolean {
  return diffRunConfigs(base, other).length === 0;
}

/** The diff as a sparse patch of `other`'s values — the permalink payload. */
export function diffToPatch(base: RunConfig, other: RunConfig): RunConfigPatch {
  const patch: Record<string, number> = {};
  for (const delta of diffRunConfigs(base, other)) {
    patch[delta.param] = delta.other;
  }
  return patch as RunConfigPatch;
}

/**
 * Apply a sparse patch to a base config and re-validate the result. Returns a
 * parse result rather than throwing so the UI can show a migration notice for a
 * stale permalink instead of a crash.
 */
export function applyRunConfigPatch(base: RunConfig, patch: RunConfigPatch): RunConfigParseResult {
  return safeParseRunConfig({ ...base, ...patch });
}

/** One-line human summary of a diff, for the "modified from preset" chip. */
export function describeDiff(deltas: readonly RunConfigDelta[]): string {
  if (deltas.length === 0) {
    return "unmodified";
  }
  return deltas.map((d) => `${d.param} ${d.base} → ${d.other}`).join(", ");
}

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

/**
 * A copy of `config` with keys in the manifest's fixed order.
 *
 * JSON key order is load-bearing twice over: `simulation.json` is hand-assembled
 * in a fixed order for parity diffing, and the deterministic `sim_id` hashes a
 * canonical serialisation of the executed parameters. Any code that serialises a
 * config must route through this function.
 */
export function orderRunConfig(config: RunConfig): RunConfig {
  const ordered: Record<string, number> = {};
  for (const param of PARAM_NAMES) {
    ordered[param] = config[param];
  }
  return ordered as RunConfig;
}
