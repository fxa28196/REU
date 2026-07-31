/**
 * `mathx` — the deterministic math plane (plan §3.3, PORT_MAP §5.5).
 *
 * Three jobs, none of which the host platform can be trusted with:
 *
 * 1. **Transcendentals.** ECMA-262 leaves `Math.exp/log/pow/sin/cos/atan2` as
 *    "implementation-approximated", so their last ulp is a property of the browser build.
 *    A simulation whose agents take Bernoulli decisions against those values would produce
 *    different populations on Chrome and Firefox. Every routine here is a verbatim port of
 *    the fdlibm source `java.lang.StrictMath` is specified against, so the engine's answer
 *    depends only on IEEE-754 double arithmetic — which *is* specified. DR-S1 §5.4 states
 *    the target precisely: the goal is **JS ≡ JS across engines**, not JS ≡ the archived
 *    HotSpot-intrinsic Java, which DR-S1 §3.2 measured to be unreachable at any budget.
 *
 * 2. **Decimal formatting.** {@link javaFormatFixed} reproduces `String.format(Locale.US,
 *    "%.Nf", d)` exactly, including HALF_UP ties and negative zero. `toFixed` is banned.
 *
 * 3. **Integer narrowing.** {@link doubleToLong} / {@link doubleToInt} / {@link longToInt}
 *    separate Java's saturating double→integral casts from its wrapping long→int cast.
 *
 * Every export is covered by a fixture generated from real Java
 * (`pipeline/java-exporter/src/websim/exporter/MathxFixtureDumper.java`).
 */

export { fdlibmLog, FDLIBM_LOG_CONSTANT_BITS } from "./log.js";
export { fdlibmExp, FDLIBM_EXP_CONSTANT_BITS } from "./exp.js";
export { fdlibmPow, FDLIBM_POW_CONSTANT_BITS } from "./pow.js";
export { fdlibmSin, fdlibmCos, FDLIBM_TRIG_CONSTANT_BITS } from "./trig.js";
export { fdlibmAtan, fdlibmAtan2, FDLIBM_ATAN_CONSTANT_BITS } from "./atan.js";
export { fdlibmSqrt } from "./sqrt.js";
export { fdlibmLog1p, FDLIBM_LOG1P_CONSTANT_BITS } from "./log1p.js";
export { fdlibmCbrt, FDLIBM_CBRT_CONSTANT_BITS } from "./cbrt.js";
export { fdlibmHypot } from "./hypot.js";
export { fdlibmAtanh } from "./atanh.js";

export { javaFormatFixed, javaFormatFixedOrEmpty } from "./format.js";

export {
  doubleToInt,
  doubleToLong,
  intToLong,
  longToInt,
  wrapLong,
  INT_MAX,
  INT_MIN,
  LONG_MAX,
  LONG_MIN,
} from "./truncCast.js";

export {
  decomposeDouble,
  doubleToHex,
  floatToHex,
  getHighWord,
  getLowWord,
  hexToDouble,
  insertWords,
  intToHex,
  longToHex,
  scalbn,
  setHighWord,
  setLowWord,
  HI,
  LO,
} from "./bits.js";
