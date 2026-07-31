# DR-S5 — RNG bit-parity clones (`JavaRandom`, `ColtMT19937`)

**Spike:** WP2-S5 (plan §3.3, §10 spike list). **Risk closed:** W15 (“colt `nextIntFromTo`
semantics assumed not verified”). **Status: PASS** — primary approach held, no fallback
invoked. **Date:** 2026-07-31.

---

## 1. Verdict

Both generators the Java/Repast model depends on are cloned in TypeScript and verified
**bit-exactly against fixtures dumped from real Java**, as raw IEEE-754 / two's-complement
hex — never decimal text.

| | |
|---|---|
| Fixture sequences | **263** (144 `java.util.Random` + 119 colt) |
| Draws per sequence | 10 000 |
| Total draws compared | **2 630 000**, all byte-exact |
| Depth tier (added 2026-07-31) | **100 000 000** more draws — 10^7 × 5 seeds × 2 generators, the plan §3.3/§5.1 criterion, in `rng-volume.json`. See DR-WP3-cross-engine §6. These fixtures are unchanged by it. |
| Engine tests | **289 passed / 0 failed** (with the opt-in full-dump suite active) |
| Full `websim` CI | **457 passed, 3 skipped, 0 failed** — the 3 skips are the opt-in full-dump suite, absent in CI by design. Typecheck clean, claim linter clean. Stable over 3 consecutive full runs (460/460 with dumps present). |
| Repast `RandomHelper` cross-check | **IDENTICAL over 40 000 draws** |

The `nextIntFromTo` formula is documented in §3 with decompiled-bytecode evidence, which
is the W15 acceptance criterion.

---

## 2. What was built

| Path | Role |
|---|---|
| `pipeline/java-exporter/src/websim/exporter/RngFixtureDumper.java` | Ground-truth dumper |
| `pipeline/java-exporter/dump-rng-fixtures.ps1` | Reproducible compile + run |
| `engine/src/rng/JavaRandom.ts` | `java.util.Random` clone (+ BigInt reference LCG) |
| `engine/src/rng/ColtMT19937.ts` | colt `MersenneTwister` + `Uniform` scaling clone |
| `engine/src/rng/fdlibm.ts` | fdlibm `__ieee754_log` — required by `nextGaussian` |
| `engine/src/rng/bits.ts` | IEEE-754 hex helpers |
| `engine/test/fixtures/rng/*.json` | Committed fixtures, 916 KB total |
| `engine/test/rng/*.test.ts` | 4 suites: 2 fixture-parity, 1 fdlibm, 1 opt-in full-dump |

Sources of truth: colt `1.2.0-no_hep.jar` from
`RepastSimphony-2.11.0/eclipse/plugins/repast.simphony.core_2.11.0/lib/`; JDK 17.0.19
(Temurin), the same JDK `scripts/run-headless.ps1` uses.

### Fixture format — and why it is not a raw dump

Full one-token-per-line dumps of all 263 sequences are **27 MB**. Committing that to a
repo that already carries an LFS validation set is not worth it, so each committed
sequence stores the first 256 draws verbatim **plus a SHA-256 over all 10 000** (digest
taken over the exact UTF-8 byte stream `token + "\n"`, reproduced identically in Node).
That is still a bit-exact comparison — a single flipped bit anywhere changes the digest —
and the verbatim head means a failure names the exact draw index instead of just “digest
differs”.

To keep this honest rather than assumed, `dump-rng-fixtures.ps1 -Full` emits the 27 MB
dumps into git-ignored `pipeline/out/rng-full/`, and `full-dump.parity.test.ts` compares
**every draw** of four representative sequences token by token. It passes, and self-skips
in CI where the dumps are absent (verified both ways).

**Reproducibility:** the dumper was run three times; the two committed JSON files came out
byte-identical each time (`diff` clean). A future digest change means the JDK or the colt
jar moved under the port — a finding, not a fixture to overwrite.

---

## 3. W15 — colt `nextIntFromTo`, verified against bytecode

`javap -c -p -classpath colt-1.2.0-no_hep.jar cern.jet.random.Uniform`:

```
public int nextIntFromTo(int, int);
   0: iload_1        1: i2l          // (long) from
   2: lconst_1       3: iload_2      4: i2l     5: ladd    // 1L + (long) to
   6: iload_1        7: i2l          8: lsub                // - (long) from
   9: l2d                                                   // (double) width
  10..14: getfield randomGenerator ; 14: invokevirtual RandomEngine.raw:()D
  17: dmul           18: d2l         19: ladd    20: l2i    21: ireturn
```

**The formula:**

```java
(int) ((long) from + (long) ((1L + (long) to - (long) from) * randomGenerator.raw()))
```

Four load-bearing details, each of which a plausible port gets wrong:

1. **Width is computed in `long`** (`i2l`/`ladd`/`lsub` before `l2d`). For the full int
   range the width is `2^32`, not a wrapped `0`. An int-width port returns `from` every
   time and looks superficially fine.
2. **The multiply is a `double` multiply** (`l2d` then `dmul`), not a 64-bit integer
   scale. JS reproduces it natively; both operands are exactly representable here.
3. **`d2l` truncates toward zero**, which equals `floor` only for a non-negative product —
   i.e. only when `from <= to`. See the mutation result in §6.
4. **The final `(int)` is `l2i`, a narrowing wrap**, not a clamp.

Supporting bytecode, same method of verification:

- `RandomEngine.raw()` — `do { i = nextInt(); } while (i == 0); return (double)(i & 0xFFFFFFFFL) * 2.3283064365386963E-10;`
  Zero is **rejected**, and the scale is exactly `2^-32`, so `raw()` is supported on
  `[2^-32, 1 - 2^-32]` — not `[0, 1)`.
- `RandomEngine.nextLong()` — `((nextInt() & 0xFFFFFFFFL) << 32) | (nextInt() & 0xFFFFFFFFL)`;
  high word drawn **first**.
- `RandomEngine.nextDouble()` — retry loop on `((double) nextLong() - -9.223372036854776E18) * 5.421010862427522E-20`;
  those literals are exactly `-(2^63)` and `2^-64`.

**Consequence worth recording:** with `from = Integer.MIN_VALUE, to = Integer.MAX_VALUE`,
`nextIntFromTo` can never return `Integer.MIN_VALUE`, because `raw()` never returns 0.
Asserted directly over 200 000 draws.

### Repast wiring confirmed empirically

`RandomHelper.nextIntFromTo` → `getUniform().nextIntFromTo`, and `RandomHelper.setSeed(int)`
→ `DefaultRandomRegistry.setSeed` + `createUniform()`. Rather than trust the bytecode
reading, the dumper reflectively drives the **real Repast runtime** and compares against
`new Uniform(new MersenneTwister(seed))`: **identical over 40 000 draws** across 5 seeds ×
4 ranges. This licenses modelling the default stream as a bare seeded `MersenneTwister`
(PORT_MAP §1.8) and confirms registry construction consumes no draws.

---

## 4. Semantics surprises (the reason this spike existed)

### 4.1 colt's seeding uses an *arithmetic* right shift — it is not textbook MT19937

Bytecode `setSeed(int)` contains `bipush 30; ishr` — signed shift:

```java
mt[i] = (1812433253 * (mt[i-1] ^ (mt[i-1] >> 30)) + i);
```

Reference MT19937's `init_genrand` uses the **unsigned** `>>>`. The state tables diverge
as soon as a negative word appears in the expansion, which for almost every seed is almost
immediately. **Any port built on a stock MT19937 library — or on the reference C — is
wrong from draw 1.** This is precisely the reason plan §3.2 refuses third-party PRNG code,
and it is now an executable assertion contrasting the two.

### 4.2 `nextGaussian` needs fdlibm `log`, not `Math.log`

`java.util.Random.nextGaussian()` computes `StrictMath.sqrt(-2 * StrictMath.log(s) / s)`.
`sqrt` is IEEE-correctly-rounded so JS `Math.sqrt` matches by definition — but
`StrictMath.log` is **fdlibm**, whose result is deliberately *not* the correctly rounded
logarithm, and ECMA-262 leaves `Math.log` implementation-approximated. So `fdlibm.ts`
ports `__ieee754_log` directly.

**Measured:** over 1 000 000 samples in (0,1) on Node 24 / V8, `Math.log` differed from
`fdlibmLog` **0 times**, and substituting it changed **0 of 100 000** `nextGaussian`
outputs. That is because V8's `base::ieee754::log` is itself an fdlibm port.

Read that carefully: it means the shortcut *happens* to work on V8 today. It says nothing
about SpiderMonkey or JavaScriptCore, which this spike did **not** test (Node only — a
real limitation of this measurement). The explicit kernel costs nothing measurable and
removes a per-engine, per-version bet, so it stays. The cross-browser CI gate in §3.3
remains the thing that would catch a regression here.

> **Update, 2026-07-31 (DR-WP3-cross-engine §4).** That gate now exists and has been run.
> The result is worse than the caveat above feared: `Math.log/exp/pow/sin/cos/atan/atan2`
> over one adversarial grid produce **four different digests on four engines**, and two of
> those four are both V8 — Node 24.18.0 and Chromium 141 disagree with each other. The
> "V8's `base::ieee754::log` is itself an fdlibm port" shortcut is therefore not stable even
> within V8 across versions. The ported kernels are byte-identical on all four. This bet was
> worth taking.

### 4.3 `Uniform.nextInt()` returns 0 or 1 — not a full-range int

`Uniform.nextInt()` is `nextIntFromTo((int) Math.round(min), (int) Math.round(max))`, and
`new Uniform(engine)` sets `min = 0, max = 1`. So `RandomHelper.nextInt()` yields only 0 or
1. The model does not call it, but the name is a trap, so the TS method is deliberately
named `uniformDefaultNextInt()` rather than `nextInt()`.

### 4.4 The Gaussian cache survives intervening draws of other kinds

`nextGaussian` either consumes an even number of `nextDouble`s and stashes a partner, or
consumes none. A fixture that only ever calls `nextGaussian` cannot detect a port that
drops `haveNextNextGaussian` when other draw types intervene — so each seed also has a
`-mixed` sequence interleaving Gaussian/double/int/long/boolean draws, plus a state
round-trip test that snapshots mid-pair. `setSeed` clearing the cache is asserted too.

### 4.5 `nextLong` adds a *signed* low word

`java.util.Random.nextLong()` is `((long) next(32) << 32) + next(32)` — `+`, with the low
word signed, so it can underflow `Long.MIN_VALUE` and wrap. colt's `nextLong` uses `|`
with both words masked unsigned. Different operators, different generators; both cloned
as written.

---

## 5. Coverage

**Seeds.** `java.util.Random`: `{0, 42, -1, 2147483647}` plus five derived seeds —
`42*1000003+17` (PopulationSampler), `42*1000003+7919` (ELayerSampler),
`2147483647*2654435761 + 104729` (per-agent, large but no overflow), and two that
**genuinely wrap signed 64-bit**: `9223372036854775783*1000003+17` and
`9223372036854775783*2654435761 + 6841*104729`. Those confirm the `BigInt.asIntN(64, …)`
derivation path required by §3.3. The Java source was checked to confirm the model uses
`long` arithmetic (`PopulationSampler.java:257` `new Random(seed * 1000003L + 17L)`;
`ELayerSampler.java:148,170`), so the overflow is Java's, not an artefact.

colt: `{0, 42, -1, 2147483647, 4357 (DEFAULT_SEED)}` plus the two derived seeds narrowed to
`int`.

**Draw types.** `java.util.Random`: `nextDouble`, `nextGaussian`, `nextLong`, `nextInt()`,
`nextFloat`, `nextBoolean`, `nextInt(bound)` for
`{2, 3, 10, 45, 46, 100, 6842, 1073741824, 2147483647}` — covering both the power-of-two
fast path and the modulo-rejection loop — and the `mixed` interleave.
colt: `nextInt`, `raw`, `nextDouble`, `nextLong`, `nextFloat`, `uniformNextInt`, and
`nextIntFromTo` over 11 ranges including the model's own `(0, 45)`, non-power-of-two
`(1, 6)`, sign-straddling `(-5, 5)`, wholly negative `(-100, -1)`, degenerate `(0, 0)`,
inverted `(10, 3)`, the full int range, and both int extremes.

---

## 6. Non-vacuity: the tests were proven to fail

A green suite means nothing unless it can go red. Two deliberate mutations were introduced
and reverted:

| Mutation | Result |
|---|---|
| colt seeding `>>` → `>>>` (i.e. use textbook MT19937) | **113 of 129 colt tests fail** |
| `nextIntFromTo` `Math.trunc` → `Math.floor` | **8 tests fail — all and only the inverted-range `(10, 3)` fixtures** |

The second is the more instructive: the truncate-vs-floor distinction is invisible on every
non-inverted range, so without that one deliberately odd fixture the bug would have shipped
silently. It is kept for that reason.

A third guard is structural: `JavaRandom`'s 24-bit split LCG is cross-checked against
`JavaRandomBigIntReference` — an independent from-the-spec BigInt implementation — for
5 000 draws × 7 bit-widths × 6 seeds, asserting both the returned value and the full 48-bit
state at every step.

---

## 7. Implementation notes worth carrying into WP3

- **48-bit state as two 24-bit halves.** A single-Number seed cannot hold the LCG product
  (`2^48 × 2^35` exceeds 2^53). Split into 24-bit halves every partial product stays under
  2^48 and is exact. Java's `(int)` narrowing is exactly JS `| 0`.
- **`nextInt(bound)` power-of-two path avoids 64-bit math.** Java's
  `(int)((bound * (long) r) >> 31)` reaches 2^61; for `bound = 2^p` it is identically
  `r >>> (31 - p)` = `r >>> Math.clz32(bound)`, which stays in 32-bit ops.
- **The rejection loop's overflow is the loop condition.** `u - (r = u % bound) + m < 0`
  only ever fires *because* it overflows int; `| 0` reproduces that wrap. Dropping it
  produces a subtly non-uniform generator that still passes casual range checks.
- **Snapshot state is implemented now** (plan §3.5): `JavaRandom` exposes hi/lo + Gaussian
  cache, `ColtMT19937` exposes the 624 words + index, both with round-trip tests including
  across a block boundary and mid-Gaussian-pair.

**Measured throughput** (Node 24, this machine, single-threaded):

| Operation | Rate |
|---|---|
| `JavaRandom.nextDouble` | 10^7 draws / 247 ms ≈ **40.5 M/s** |
| `ColtMT19937.nextIntFromTo(0,45)` | 10^7 draws / 98 ms ≈ **102 M/s** |

For scale, the worst-case preset is ≈1.9·10^8 agent-ticks with roughly a handful of draws
per agent-tick. RNG is comfortably not the §3.6 bottleneck; movement and SSSP remain the
things WP7 must measure. (These are single-op microbenchmarks, not an engine benchmark —
they bound the RNG's contribution, nothing more.)

---

## 8. Limitations / open items

1. ~~**Node/V8 only.**~~ **CLOSED 2026-07-31 by DR-WP3-cross-engine.** Every measurement in
   *this* record ran on Node 24, and cross-engine identity was an expectation rather than a
   result. It has since been measured: both generators are byte-identical on Node 24,
   Chromium 141, Firefox 142 and WebKit 26, as is `mathx` (including the `Math.sqrt`
   assumption). The `Math.log` result in §4.2 was indeed V8-specific — see the update there.
2. **Draw-order contracts are not this spike's scope.** §3.3 item 4 (PopulationSampler's
   fixed 8-draw order, ELayerSampler's 5 unconditional draws, `n = 6 842` at seeds 42–44) is
   WP3 and needs a *model-level* fixture, not a generator-level one. S5 proves the
   generators; it does not prove the call sites.
3. **The stream registry is not built.** Four-stream wiring and the `shuffle-mt` Fisher–Yates
   permutation are WP3.
4. **`nextGaussian` truncated-normal rejection loop** (bounds [0.40, 2.20], ≤100 attempts
   then clamp the mean) is a PopulationSampler concern, not a generator concern — untouched
   here.
5. **JDK version sensitivity.** `java.util.Random`'s algorithms are frozen by its
   specification, so JDK drift is very low risk; colt is a pinned jar. Both are recorded in
   the fixture headers (`javaVersion: 17.0.19`) so a mismatch is visible rather than silent.

---

## 9. How to reproduce

```powershell
# regenerate fixtures from real Java (add -Full for the 27 MB dumps)
pwsh websim/pipeline/java-exporter/dump-rng-fixtures.ps1 -Full

# verify the TypeScript clones
cd websim && npm test -w @websim/engine     # 289 with dumps present, 286 + 3 skipped without
cd websim && npm run ci                     # typecheck + 457 passed / 3 skipped + claim linter
```

### A note on test cost

The range-sweep tests originally called `expect()` once per draw — ~800 000 assertion
calls — which cost far more than the generators themselves and intermittently blew
vitest's 5 s timeout once the other workspace projects ran in parallel. They now
accumulate plain counters and assert once. Same coverage, no timeout, and it is worth
remembering for WP3: in a determinism suite the assertion framework, not the arithmetic,
is usually the bottleneck.
