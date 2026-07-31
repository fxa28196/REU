/**
 * The RNG plane: bit-exact clones of the two generators the Java/Repast model uses, plus
 * the four-stream registry that wires them to their draw sites (PORT_MAP §1.8). No
 * third-party PRNG code is trusted for bit-exactness (plan §3.2 table).
 *
 * The fdlibm kernels the generators depend on live one layer down, in `engine/src/mathx`.
 */

export { JavaRandom, JavaRandomBigIntReference, LCG_MULTIPLIER_PARTS } from "./JavaRandom.js";
export type { JavaRandomState } from "./JavaRandom.js";
export { ColtMT19937, COLT_CONSTANTS, COLT_DEFAULT_SEED } from "./ColtMT19937.js";
export type { ColtMT19937State } from "./ColtMT19937.js";
export {
  StreamRegistry,
  agentDecisionSeed,
  eLayerSamplerSeed,
  populationSamplerSeed,
  shuffleMt,
} from "./streams.js";
export type { StreamRegistryOptions, StreamRegistryState } from "./streams.js";
export { fdlibmLog, FDLIBM_LOG_CONSTANT_BITS } from "../mathx/log.js";
export { doubleToHex, floatToHex, longToHex, intToHex } from "../mathx/bits.js";
