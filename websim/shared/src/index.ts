/**
 * @websim/shared — the contract plane (plan §3.1, WP0 part 2).
 *
 * One Zod schema drives UI form validation, permalink encode/decode, preset
 * generation/validation and the executed-manifest completeness check, so those
 * four drift surfaces collapse into one. Nothing in this package is engine code:
 * no DOM, no timers, no randomness.
 *
 * `SIMULATION_SCHEMA_V2`, `SIMULATION_SCHEMA_PARITY` and `FORMATTER_MODES` moved
 * from this file into `manifest.ts` when the manifest types landed; they are
 * still exported from here, so importers are unaffected.
 */

export * from "./schema.js";
export * from "./config.js";
export * from "./manifest.js";
export * from "./assets.js";
export * from "./graph-asset.js";
export * from "./permalink.js";
export * from "./presets/index.js";
