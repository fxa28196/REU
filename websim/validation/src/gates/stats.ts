/**
 * stats.ts — the pandas/numpy statistics the WP9 gates recompute, spelled out.
 *
 * `scripts/analyze_run.py` and `scripts/verify_E_runs.py` lean on pandas'
 * *skipna* defaults and on numpy's *linear* percentile. Neither is what a naive
 * JavaScript reduction does, and the differences are large enough to change a
 * verdict rather than a digit:
 *
 *  - `Series.mean()` / `.min()` / `.max()` / `.var()` **skip NaN**. A blank
 *    `travel_time_min` (4,782 of 6,842 rows in `A-seed42`) must not drag the
 *    mean to NaN, and `Array.prototype.reduce` would.
 *  - `Series.sum()` skips NaN too, and returns **0.0** over an empty selection
 *    where `.mean()` returns NaN. Two different empty-cases, both load-bearing.
 *  - `Series.var()` defaults to **ddof = 1** — the sample variance. Gate (c)'s
 *    two-sample SE is `sqrt(var1/n1 + var0/n0)` with that ddof, and using the
 *    population variance would shrink the SE and manufacture exceedances.
 *  - `Series.quantile(q, interpolation="linear")` is numpy's `linear` rule:
 *    `idx = q * (n - 1)`, then interpolate between the bracketing order
 *    statistics. `OutcomeLogger.pct` uses the same rule, which is precisely why
 *    `analyze_run.py`'s recomputation is a real cross-check of the Java writer
 *    rather than a comparison of two different definitions of "median".
 *
 * Every function here takes an already-coerced numeric view (`RawFrame.num`),
 * i.e. the analogue of `pd.to_numeric(col, errors="coerce")`, so the empty-cell
 * rule stays in exactly one place (`harness/frame.ts`).
 */

/** `Series.dropna()` — drop NaN, preserve order. */
export function dropna(values: readonly number[]): readonly number[] {
  return values.filter((v) => !Number.isNaN(v));
}

/** `Series.mean()` — skipna, NaN over an all-NaN or empty selection. */
export function nanMean(values: readonly number[]): number {
  let total = 0;
  let n = 0;
  for (const v of values) {
    if (!Number.isNaN(v)) {
      total += v;
      n += 1;
    }
  }
  return n === 0 ? Number.NaN : total / n;
}

/** `Series.sum()` — skipna, **0.0** over an all-NaN or empty selection. */
export function nanSum(values: readonly number[]): number {
  let total = 0;
  for (const v of values) {
    if (!Number.isNaN(v)) {
      total += v;
    }
  }
  return total;
}

/** `Series.min()` — skipna, NaN over an all-NaN or empty selection. */
export function nanMin(values: readonly number[]): number {
  let best = Number.NaN;
  for (const v of values) {
    if (!Number.isNaN(v) && (Number.isNaN(best) || v < best)) {
      best = v;
    }
  }
  return best;
}

/** `Series.max()` — skipna, NaN over an all-NaN or empty selection. */
export function nanMax(values: readonly number[]): number {
  let best = Number.NaN;
  for (const v of values) {
    if (!Number.isNaN(v) && (Number.isNaN(best) || v > best)) {
      best = v;
    }
  }
  return best;
}

/**
 * `Series.var(ddof=1)` — the sample variance, skipna, NaN when fewer than two
 * observations survive. Two-pass, because gate (c) divides by it.
 */
export function varDdof1(values: readonly number[]): number {
  const clean = dropna(values);
  const n = clean.length;
  if (n < 2) {
    return Number.NaN;
  }
  const m = nanMean(clean);
  let acc = 0;
  for (const v of clean) {
    acc += (v - m) * (v - m);
  }
  return acc / (n - 1);
}

/**
 * `scripts/analyze_run.py`'s `pctl(series, p)`:
 * `series.dropna().quantile(p / 100.0, interpolation="linear")`, NaN on empty.
 *
 * `p` is a **percentile** (0–100), matching the Python's call sites.
 */
export function pctl(values: readonly number[], p: number): number {
  const s = [...dropna(values)].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) {
    return Number.NaN;
  }
  if (n === 1) {
    return s[0] as number;
  }
  const idx = (p / 100) * (n - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const a = s[lo] as number;
  const b = s[hi] as number;
  return lo === hi ? a : a + (b - a) * (idx - lo);
}

/**
 * `analyze_run.py`'s `gini(values)` — *"identical definition to
 * OutcomeLogger.gini(): mean absolute difference / (2 * mean)"*:
 *
 * ```python
 * x = sorted(float(v) for v in values)
 * n = len(x); m = sum(x) / n
 * acc = sum((2 * (i + 1) - n - 1) * v for i, v in enumerate(x))
 * return acc / (n * n * m)
 * ```
 *
 * Transcribed literally, including the two early returns (`n == 0` and
 * `m == 0` both give 0.0) and including the fact that it does **not** drop NaN.
 * The Python would sort a NaN into an arbitrary position and return NaN; a port
 * that quietly dropped it would report a *different, better-behaved* statistic
 * than the certified script and would hide a writer that started emitting blank
 * doses. The archive suite asserts the dose column has no blank cell, which is
 * what keeps the difference theoretical.
 */
export function gini(values: readonly number[]): number {
  const x = [...values].sort((a, b) => a - b);
  const n = x.length;
  if (n === 0) {
    return 0.0;
  }
  let total = 0;
  for (const v of x) {
    total += v;
  }
  const m = total / n;
  if (m === 0) {
    return 0.0;
  }
  let acc = 0;
  for (let i = 0; i < n; i += 1) {
    acc += (2 * (i + 1) - n - 1) * (x[i] as number);
  }
  return acc / (n * n * m);
}

/**
 * `analyze_run.py`'s `approx(a, b, rtol=1e-3, atol=0.51)`:
 *
 * ```python
 * if a is None or b is None: return False
 * return abs(a - b) <= max(atol, rtol * max(abs(a), abs(b)))
 * ```
 *
 * The tolerance is `max(atol, relative)`, **not** the `atol + rtol*|b|` of
 * `numpy.isclose` — at the archive's exposure magnitudes (2.6e8 total) the
 * relative arm dominates and the difference is six orders of magnitude, so the
 * distinction is not academic. `atol = 0.51` is a *rounding* budget: the
 * manifest prints these to 2–4 decimals.
 *
 * A NaN on either side returns false, which is what Python's `<=` does too.
 */
export function approx(a: number | null | undefined, b: number | null | undefined, atol = 0.51, rtol = 1e-3): boolean {
  if (a === null || a === undefined || b === null || b === undefined) {
    return false;
  }
  return Math.abs(a - b) <= Math.max(atol, rtol * Math.max(Math.abs(a), Math.abs(b)));
}
