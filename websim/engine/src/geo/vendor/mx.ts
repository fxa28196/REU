/**
 * The deterministic math namespace the vendored `geographiclib-geodesic` sources are
 * rewritten onto (WP7 task C1, DR-WP3 §5, plan §1.2 / Q12).
 *
 * <p>`geographiclib-geodesic@2.2.0` calls the host `Math` for `sin`, `cos`, `atan`, `atan2`,
 * `pow`, `log`, `log1p`, `cbrt` and `atanh`. ECMA-262 §21.3.2 declares every one of those
 * *implementation-approximated*: the last ulp is a property of the browser build. DR-WP3 §5
 * measured the consequence — Chromium 141, Firefox 142 and WebKit 26 each produced a
 * different `geo.geodesic` digest, differing on 142 / 126 / 249 of 1,200 doubles. The
 * vendoring step (`tools/vendor-geodesic.ts`) rewrites exactly those call sites onto this
 * object, whose members are the `mathx` fdlibm kernels, so the geodesic plane depends only
 * on IEEE-754 double arithmetic — which *is* specified — and can be byte-gated across
 * engines rather than magnitude-bounded.
 *
 * <p><b>What is deliberately *not* rewritten.</b> `Math.abs`, `Math.floor`, `Math.round`,
 * `Math.min`, `Math.max` and `Math.PI` are exactly specified by ECMA-262 and stay on the
 * host; `Math.sqrt` stays too, on the same IEEE-754 §5.4.1 argument that
 * `engine/src/mathx/sqrt.ts` makes and that DR-WP3 §4 measured on four engines. Keeping the
 * rewrite to the approximated members is what makes the diff against upstream auditable.
 *
 * <p><b>`hypot` is present but unreachable from the vendored code.</b> geographiclib defines
 * its own `m.hypot` as `sqrt(x*x + y*y)` and the upstream source explains why ("Built in
 * Math.hypot give incorrect results from GeodSolve92"), so the library never calls the host
 * `hypot`. The member exists so this namespace is a complete cover of the approximated set,
 * and so the vendoring transform's allow-list needs no exception.
 */

import {
  fdlibmAtan,
  fdlibmAtan2,
  fdlibmAtanh,
  fdlibmCbrt,
  fdlibmCos,
  fdlibmExp,
  fdlibmHypot,
  fdlibmLog,
  fdlibmLog1p,
  fdlibmPow,
  fdlibmSin,
} from "../../mathx/index.js";

/**
 * Every ECMA-262 implementation-approximated `Math` member the vendoring transform may
 * rewrite, mapped to its fdlibm equivalent.
 *
 * <p>Members geographiclib never calls are still present: the transform's allow-list is
 * this object's key set, so a future upstream release that starts calling `expm1` or `tanh`
 * fails the vendoring step loudly instead of silently keeping a host call.
 */
export const Mx = {
  sin: fdlibmSin,
  cos: fdlibmCos,
  atan: fdlibmAtan,
  atan2: fdlibmAtan2,
  pow: fdlibmPow,
  exp: fdlibmExp,
  log: fdlibmLog,
  log1p: fdlibmLog1p,
  cbrt: fdlibmCbrt,
  atanh: fdlibmAtanh,
  hypot: fdlibmHypot,
} as const;

/** The member names {@link Mx} covers — the vendoring transform's rewrite allow-list. */
export const MX_MEMBERS: readonly string[] = Object.freeze(Object.keys(Mx));
