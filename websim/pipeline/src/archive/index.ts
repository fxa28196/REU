/**
 * Archive plane barrel — read-only digesters over `docs/runs/`.
 *
 * Nothing in here ever writes to, moves, or deletes anything under the archive:
 * `docs/runs/` is the validation oracle and is consumed read-only (plan §2).
 */

export * from "./root.js";
export * from "./csv.js";
export * from "./files.js";
export * from "./manifest.js";
export * from "./discover.js";
export * from "./digest.js";
export * from "./golden.js";
export * from "./working-set.js";
