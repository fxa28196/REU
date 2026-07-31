/**
 * Square root.
 *
 * <p><b>Provenance.</b> fdlibm `e_sqrt.c` exists, but porting it would be actively wrong
 * here. IEEE-754 §5.4.1 *requires* `sqrt` to be correctly rounded, so fdlibm's bit-twiddling
 * implementation and a hardware `sqrtsd` produce identical results by construction, and
 * `java.lang.StrictMath.sqrt` is specified to return "the correctly rounded positive square
 * root" — not "whatever fdlibm computes". Every JavaScript engine lowers `Math.sqrt` to the
 * hardware instruction (it is also what WebAssembly's `f64.sqrt` mandates). So a wrapper is
 * the faithful port and a hand-rolled Newton iteration would be the risk.
 *
 * <p>This is stated as a claim, not an assumption: `mathx.parity.test.ts` checks
 * {@link fdlibmSqrt} against `StrictMath.sqrt` fixtures dumped from real Java on the same
 * inputs as every other routine in this module. If a host engine ever ships a
 * non-conforming `sqrt`, that test goes red rather than the divergence going unnoticed.
 *
 * <p><b>Call site.</b> `java.util.Random.nextGaussian` (`StrictMath.sqrt` of the Marsaglia
 * polar multiplier — already relied on by `JavaRandom`) and GeographicLib-Java's 25
 * `Math.sqrt` calls inside the geodesic solve (DR-S1 §3.2).
 */

/**
 * Bit-exact equivalent of Java's `StrictMath.sqrt(x)`.
 *
 * Exists as a named export so that call sites and the fixture suite reference the same
 * symbol as every other `mathx` routine, and so a future engine-specific workaround has
 * one place to live.
 */
export function fdlibmSqrt(x: number): number {
  return Math.sqrt(x);
}
