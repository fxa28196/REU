/**
 * Re-export shim. The IEEE-754 bit helpers moved to `engine/src/mathx/bits.ts` in WP3 so
 * that `mathx` — the lowest layer — depends on nothing, and `rng` depends on `mathx`
 * rather than the other way round.
 *
 * There is exactly one implementation; this file only preserves the WP2-S5 import path
 * used by the RNG parity suites.
 */

export {
  HI,
  LO,
  decomposeDouble,
  doubleToHex,
  floatToHex,
  hexToDouble,
  intToHex,
  longToHex,
} from "../mathx/bits.js";
