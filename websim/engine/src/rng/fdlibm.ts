/**
 * Re-export shim. `fdlibmLog` moved to `engine/src/mathx/log.ts` in WP3, where it sits
 * alongside the rest of the fdlibm-derived kernels (`exp`, `pow`, `sin`, `cos`, `atan2`).
 *
 * There is exactly one implementation; this file only preserves the WP2-S5 import path
 * used by `engine/test/rng/fdlibm.test.ts`.
 */

export { fdlibmLog, FDLIBM_LOG_CONSTANT_BITS } from "../mathx/log.js";
