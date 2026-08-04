# DR-WP10-uithread-perf — where the UI-thread time actually goes

**Status:** measurement complete; **no fix implemented** (none was authorised, and the
measurement changes which fix is correct).
**Date:** 2026-08-03. **Box:** Windows 11 Home 10.0.26200, 16 logical cores.
**Subject:** WP10 acceptance clause 2 — *"UI thread long-task-free (< 50 ms) at max
speed"* — which `npm run test:browser` reports red on Firefox and WebKit.

---

## 0. Verdict up front

The clause is red, and **the red number is not produced by anything in WP10.**

A cold Firefox page, running the accepted long-task probe **with no worker, no
simulation, no frame stream and no snapshot ring** — nothing under test at all — produces
two long tasks of **138 / 139 / 143 ms** followed by **65 / 64 / 65 ms**, three runs out
of three, at t ≈ 3.4 s and t ≈ 4.9 s of a 40-second window. That is the same signature,
to within ±15 ms, that the gate reports as a WP10 failure.

Everything the gate varies is irrelevant to it. Measured on Firefox, each cell the *first*
run in a fresh page:

| what was changed | still 2 long tasks ≥ 50 ms? | worst gap |
|---|---|---|
| the gated configuration (frame/tick, batch 1, snapshots/120) | yes, 3/3 | 180–209 ms |
| **frames disabled entirely** (14,560 bytes delivered in total) | yes, 3/3 | 155–165 ms |
| frames disabled **and** snapshots disabled (ring = 0 MB) | yes, 2/2 | 153–158 ms |
| max frame rate, snapshots disabled | yes, 2/2 | 154–162 ms |
| **the shipped `RUN_OPTION_DEFAULTS`**, 6,842 × 455 h | yes, 2/2 | 153–156 ms |
| the shipped defaults at the **default preset** (2,037 × 312 h, 8 s run) | yes, 2/2 | 143–144 ms |
| **no worker at all** | yes, 3/3 | 138–143 ms |

And the same configuration that is red as the first run in a page is **clean when it is
not first** — 0 long tasks in 22 consecutive runs, worst gap 9–34 ms.

So: **read literally, clause 2 is false on Firefox and cannot be made true by any change
to `websim` code.** Section 8 sets out what to do about that. Sections 1–7 are the
evidence, question by question.

Two genuine defects *were* found on the way, neither of which is the long task:

* **D1 — the frame stream emits 12–136 frames for every animation frame the page can
  paint.** 92–99 % of the 1.68 GB streamed at max speed can never be displayed. On WebKit
  this makes the page the bottleneck: at 800 residents the worker's tick loop finishes in
  **3.6 s** and the wall clock is **21.6 s**.
* **D2 — `sliceTicks: 30` costs WebKit 15.3–18.0 s of pure waiting** over 910 worker
  yields (16.8–19.8 ms each), against 0.1 s over 114 yields at `sliceTicks: 240`. The
  comment at `engine/src/worker/simHost.ts:93-96` — "a MessageChannel round-trip is a
  macrotask with no clamp" — holds in Chromium (0.08–0.37 ms) and Firefox (0.10–0.95 ms)
  and does not hold in WebKit.

And one prior attribution has to be withdrawn (§7).

---

## 1. Method, and what it can and cannot see

### 1.1 Instruments

Three, all preallocated and allocation-free after `start()`:

1. **`AttributingProbe`** (`engine/test-browser/profile/instrument.ts`) — the accepted
   `LongTaskProbe` histogram from `engine/test-browser/worker/probe.ts`, extended so that
   every gap ≥ 15 ms records *what was inside it*: stream messages handled, bytes carried,
   handler self-time, animation frames. A 200 ms gap containing 300 messages and 190 ms of
   handler time is a throughput problem; the same gap containing zero of both is not
   application code.
2. **Per-message timing** — `performance.now()` at the top and bottom of the stream-message
   handler, so UI-thread application cost is separable from everything else.
3. **A transfer audit inside the worker** (`profile/profileWorker.ts`) — the shipped
   `SimWorkerApi` with one substitution: the `StreamPort` handed to `subscribe` is wrapped
   so the worker can read `ArrayBuffer.byteLength` **immediately after**
   `port.postMessage(message, transfer)`. 0 means the buffer was transferred out; non-zero
   means it was copied and the worker still owns the bytes. Nothing in `engine/src/` is
   re-implemented; the run lifecycle, the encoders and the transfer lists are the shipped
   ones.

Page and worker clocks are aligned through `performance.timeOrigin` (Unix-epoch ms in
both), so "was the worker still sending while the page was stalled?" is answerable.

### 1.2 Harness

`engine/vitest.profile.config.mts`, `fileParallelism: false`, **one engine per
invocation** throughout — three engines sharing 16 cores measures the box. The profile
files match `*.profile.ts`, so `npm run test:browser` does not collect them: it lists the
same five files before and after this work.

Playwright 1.56.1 — Chromium `HeadlessChrome/141.0.7390.37`, Firefox `rv:142.0`, WebKit
build 2215. Vitest 3.2.7.

### 1.3 The world, and the one caveat it carries

The browser tests cannot read `Geography/` (plan §4, Q4), so they run the synthetic
404-node / **4-shelter** world in `engine/test/worker/world.ts` through the real
`buildWorld` and the real `Simulation`. Only the graph bytes are invented. The single
consequence for this document is the frame payload: with the production 46 shelters each
frame would be **168 bytes larger** — 61,774 instead of 61,606 at 6,842 residents,
**+0.27 %**. Nothing here turns on that.

### 1.4 What the probe cannot see, stated before it matters

A self-rescheduling macrotask probe hops at 200,000/s on Firefox and therefore **occupies
the main thread continuously**. Measured handler duty is 0.02–1.6 %; the probe is
essentially the rest. That is fine for measuring "time between two adjacent tasks", which
is the definition of a long task — but it also **denies the browser idle time**, and
idle time is when browsers do incremental garbage collection. §6.3 shows this is not a
footnote: it is most of the result.

---

## 2. Reproduction (the "before")

```
npx vitest run --config engine/vitest.browser.config.ts --browser=firefox \
  engine/test-browser/worker/uithread.scale.worker.test.ts
```

**FAIL**, isolated, nothing else on the box:

```
samples 10,216,103   p50 0.1   p99 0.1   p99.9 1.1   max 209 ms
longTasks 2   >=25ms 11   window 57,055 ms
worst: 209, 90, 36, 36, 31, 29, 27, 26, 25, 25, 25, 24 ms
residents 6,842   hours 455   frames 27,300   messages 28,671
bytes 1,681,858,328   workerRunMs 56,102   snapshots 228   ring 122,006,832 B
```

Note the shape before reading anything else into it: **p99.9 is 1.1 ms across 10.2 million
samples, and exactly two samples exceed 50 ms.** This is not a sustained cost. It is two
events.

---

## 3. Q1 — what runs on the UI thread per frame

### 3.1 Enumeration

Everything, in order, for one frame message:

1. `engine/test-browser/worker/harness.ts:78-95` — `port1.onmessage`: increment a counter,
   read five `.byteLength`s, accumulate bytes, dispatch.
2. `uithread.scale.worker.test.ts:197-220` — the renderer stand-in: a loop over all 6,842
   residents reading `positions[2i]` and `states[i]`, then 4 occupancy slots. Over the run
   that is **186,793,442** resident touches, forced by the test's own non-vacuity
   assertion.
3. Nothing else. There is no renderer: `app/src/index.ts` is a constants scaffold — no
   canvas, no deck.gl, no DOM writes. WP11–WP13 have not been built.

**No per-agent model computation happens UI-side.** The only per-agent geometry,
`materialisePosition`, runs in the *worker*, inside `FrameEncoder.capture`
(`engine/src/worker/frames.ts:169`) — which is DR-S3 action A1 working as designed. The
bug the question asks about is not present.

### 3.2 Cost

6,842 residents / 455 h, gated configuration:

| engine | Σ handler | max | p99 | duty | same run, walk removed |
|---|---|---|---|---|---|
| Chromium | 370.9 ms / 30.1 s | 1.4 ms | — | **1.23 %** | 5.2 ms → 0.02 % |
| Firefox | 388 ms / 59.4 s | 1 ms | 1 ms | **0.65 %** | 10 ms → 0.02 % |
| WebKit | 268 ms / 57.0 s | 1 ms | 1 ms | **0.47 %** | 16 ms → 0.03 % |

The single most expensive UI-thread callback in the whole matrix is **2 ms**, against a
50 ms budget. Application code cannot produce a long task here, and removing it (cell G)
does not remove the long tasks.

---

## 4. Q2 — transferred, or structured-cloned?

**Transferred.** Verified from inside the worker, not from the call site.

Gated configuration, 6,842 × 455 h:

| engine | buffers offered | detached after `postMessage` | still live | bytes still owned | views 0-length | transferables per frame msg |
|---|---|---|---|---|---|---|
| Chromium | 139,690 | **139,690** | 0 | **0** | 139,690 | 5 |
| Firefox | 139,690 | **139,690** | 0 | **0** | 139,690 | 5 |
| WebKit | 139,690 | **139,690** | 0 | **0** | 139,690 | 5 |

Across all 27 profiled runs and every other cell (5,320 / 3,185 / 619 / 418 buffers),
**not one buffer survived a `postMessage` and not one byte stayed with the sender.**
`postMessage` self-time: mean 0.01–0.04 ms, max 0.4 ms (Chromium) / 2 ms (Firefox) / 1 ms
(WebKit) — with one exception, the 3.94 MB batches of cell D, where Firefox's mean rises
to 0.58 ms and max to 5 ms.

A structured clone of a 6,842-agent frame would indeed have explained a lot. It is not
happening. This hypothesis is closed.

---

## 5. Q3 and Q4 — cadence and payload

### 5.1 Cadence: the page is sent 12–136 frames for every one it can paint

At max speed, 6,842 residents, frame per tick:

| engine | frame msgs/s arriving | animation frames/s | **frames per paint** | never paintable |
|---|---|---|---|---|
| Chromium | 907 | 60.0 | **15.1** | 93.4 % |
| Firefox | 460–512 | 32.8–36.3 | **12.7–15.6** | 92.1–93.6 % |
| WebKit | 483 | 39.9 | **12.1** | 91.7 % |

At 800 residents the worker is ~9x faster and it gets worse: **135.8** frames per paint on
Chromium, **123.0** on Firefox, **31.6** on WebKit.

The worker emits one frame per tick at 451–7,626 ticks/s. The page can consume 33–60/s.
Over the 455-hour run the page receives **27,300 frames and can paint at most ~2,000** of
them. (Headless refresh rates: Chromium 60 Hz, WebKit ~40 Hz, Firefox ~33–36 Hz. A
headed display would be 60 Hz for all three, which improves the ratio by at most 1.8x and
changes nothing about the conclusion.)

### 5.2 Payload

Per frame message: `9N + 4S + 12` bytes — `8N` positions (Float32 lon/lat), `N` states
(Uint8), `4S` occupancy (Int32), 4 tick, 8 smoke.

| residents | measured (S = 4) | formula | with production S = 46 |
|---|---|---|---|
| 800 | 7,228 | 7,228 | 7,396 |
| 2,037 | 18,361 | 18,361 | 18,529 |
| 6,842 | **61,606** | 61,606 | **61,774** |

Exactly linear in residents; **independent of hours per frame**. Total volume is
`(60·H / frameEveryTicks) × (9N + 4S + 12)` — linear in hours, linear in residents,
inverse in the decimation factor. At 6,842 / 455 h / frame-per-tick: 27,300 × 61,606 =
1,681,843,800 B, measured 1,681,919,966 B (the difference is the metric stream).
**3.70 MB per simulated hour.**

Batching does not change the byte total, only the message count: cell D (batch 64) carried
1,679,640,544 B in 427 frame messages of 3,942,784 B.

---

## 6. Q5 and Q6 — where the long task is, and what drives it

### 6.1 What is inside the gap: nothing

Every long gap measured, attributed:

| run | gap | msgs handled inside | handler ms inside | unaccounted | rAF inside | worker sends inside | worker's expected sends |
|---|---|---|---|---|---|---|---|
| matrix A-gated | 183 ms | **0** | **0** | 183 | 1 | 14 | ~88 |
| replicate A-r1 | 180 ms | 1 | **0** | 180 | 1 | 16 | ~95 |
| order O1, frames **off** | 165 ms | **0** | **0** | 165 | 1 | 5 | ~6 |
| cold C2, frames+ring off | 153 ms | **0** | **0** | 153 | 1 | 5 | ~6 |
| cold C5, shipped defaults | 153 ms | **0** | **0** | 153 | 1 | 2 | ~0.8 |
| null N1, **no worker** | 138 ms | **0** | **0** | 138 | 1 | — | — |

Every one is followed by a second gap of 64–102 ms.

So the 156 ms Firefox gap the WP9/WP10 verification asked about is:

* **not message deserialization** — no message was deserialized inside it;
* **not the render path** — there is no render path, and the animation-frame callback that
  did fire inside it did nothing;
* **not application code** — handler self-time inside the gap is 0.00 ms;
* **not confined to the page** — `requestAnimationFrame` also stalls for 164–218 ms in the
  same runs, and in the two cells whose baseline send rate is high enough to resolve it,
  the *worker's* output during the gap fell to 16–18 % of its own baseline.

It is the browser's own machinery. The mechanism consistent with all of it — a stop-the-
world collection in the Firefox content process, whose worker runtimes are children of the
page's — is an **inference**, not a measurement: no content-facing API exposes SpiderMonkey
GC events, and none of the recommendations below depend on which internal mechanism it is.

### 6.2 Q6's hypothesis: right for WebKit, wrong for Chromium and Firefox

Per-message dispatch floor, measured directly (the probe *is* an empty `MessageChannel`
round trip):

| engine | probe hops/s, near-idle cell | µs per port message |
|---|---|---|
| Chromium | 310,175 – 320,678 | **3.1 – 3.2** |
| Firefox | 199,370 – 203,614 | **4.9 – 5.0** |
| WebKit | 1,870 – 3,796 | **264 – 535** |

WebKit's port dispatch is **~100–170x** Chromium's and Firefox's.

Drain-limited throughput — 800 residents / 455 h, where the worker outruns the page:

| engine | worker tick loop | wall span | messages | ms per message | of which app code |
|---|---|---|---|---|---|
| Chromium | 3.2 s | 3.3 s | 28,675 | 0.115 | 1.6 % |
| Firefox | 5.5 s | 5.6 s | 28,675 | 0.193 | 0.7 % |
| WebKit | **3.6 s** | **21.6 s** | 28,642 | **0.754** | 0.2 % |

Byte-bound or message-bound? Same engine, 8.52x payload ratio, everything else fixed:

| engine | 61.6 KB msgs | 7.2 KB msgs | verdict |
|---|---|---|---|
| Chromium | 952 msg/s, **55.9 MB/s** | 8,559 msg/s, **58.9 MB/s** | **byte-bound**, ~57 MB/s |
| Firefox | 483 msg/s, **28.3 MB/s** | 5,158 msg/s, **35.5 MB/s** | **byte-bound**, ~30–36 MB/s |
| WebKit | 507 msg/s, 29.8 MB/s | 1,325 msg/s, **9.1 MB/s** | **message-bound**, ~1,325 msg/s |

Chromium and Firefox move a near-constant number of megabytes per second regardless of how
those bytes are packaged. WebKit moves a near-constant number of *messages* per second
regardless of how big they are — cutting the payload 8.5x bought only 2.6x more messages,
and the throughput in MB/s fell by 3.3x.

**The premise of the question does not replicate, though.** "Firefox fails at 800
residents (132 ms)" was measured under three-up parallelism, in a window of ~0.67 s. Run
isolated, `uithread.worker.test.ts` on Firefox **passes 3/3** — max 43, 39, 38 ms. And at
800 residents × 455 h (27,301 messages at 5,158/s and 35.5 MB/s, a *higher* message rate
and byte rate than production) Firefox measures **max 18 ms, 0 long tasks**. The 800-
resident failure was neither about messages nor about bytes; §6.3 says what it was.

### 6.3 The controls that decide it

Three experiments, each run to a plan stated before it was run.

**(a) Ordering.** The cheapest cell in the matrix runs first in a fresh page; the red
configuration runs second and third in the same page.

| pass | O1 — frames OFF, **first** | O2 — gated, second | O3 — gated, third |
|---|---|---|---|
| 1 | **165 ms, 2 long tasks** | 20 ms, 0 | 11 ms, 0 |
| 2 | **155 ms, 2** | 22 ms, 0 | 12 ms, 0 |
| 3 | **158 ms, 2** | 16 ms, 0 | 9 ms, 0 |

The stall follows **position**, not configuration. It happens with the frame stream
switched off entirely — the page receives 14,560 bytes in total.

**(b) Warm-up.** A 0.7-second run at 800 residents / 24 h goes first, then the production
cells.

| pass | W0 — 0.7 s, first | W1 — frames off, second | W2 — gated, third |
|---|---|---|---|
| 1 | 36 ms, 0 | **75 ms, 1** | 12 ms, 0 |
| 2 | 35 ms, 0 | **78 ms, 2** | 20 ms, 0 |
| 3 | 36 ms, 0 | **80 ms, 1** | 19 ms, 0 |

A 0.7-second warm-up **halves** the event (165 → 78 ms) and does not remove it. A full
39-second run does remove it.

**(c) Null.** No worker, no simulation, no stream. Just the probe, on a cold page, 40 s.

| cell | engine | probe hops/s | max | ≥ 50 ms | when |
|---|---|---|---|---|---|
| N1, probe only | **Firefox** | ~201,000 | **138 / 139 / 143 ms** | **2 / 2 / 2** | t = 3.36–3.52 s and 4.84–5.00 s |
| N1, probe only | Chromium | 320,678 | 17.6 ms | 0 | t = 3.21 s |
| N1, probe only | WebKit | 3,796 | 15 ms | 0 | t = 5.47 s |
| N3, probe at 36 Hz | Firefox | 36 | 33 / 32 / 33 ms | **0 / 0 / 0** | (its own 27 ms sleep) |

All three engines have a cold-page event at t ≈ 3–5 s. Firefox's is 138–143 ms; Chromium's
is 17.6 ms; WebKit's is 15 ms.

And N3 is the important qualifier on all of it: **when the probe samples at 36 Hz instead
of 200,000 Hz, the Firefox stall does not occur at all.** Its largest gap is 33 ms, only
~5 ms above its own sleep interval, over three 40-second runs. The event needs a main
thread that never goes idle — which, in this measurement, the probe itself guarantees.

That cuts both ways and both must be said:

* The gate's red number is **not attributable to WP10**. It reproduces with the subject of
  the measurement deleted.
* It is also **partly manufactured by the instrument**, which is the accepted probe used
  by both gated tests. A real UI thread at 0.65 % duty would have idle time the probe does
  not leave it.

### 6.4 The full Firefox tally

Every Firefox production-scale run taken for this document, classified by position:

| position | runs | with ≥ 1 long task | worst gaps |
|---|---|---|---|
| **first in a fresh page**, window ≥ 5 s | **17** | **17** | 138–209 ms |
| second, after only a 0.7 s warm-up | 3 | 3 | 75–80 ms |
| second or later, after a full run | **22** | **0** | 9–34 ms |
| first in page, window 0.67 s (the 800-res gate) | 3 | 0 | 38–43 ms |
| first in page, 36 Hz probe | 3 | 0 | 32–33 ms |

The gate measures for ~57 s. The event lives in the first ~5 s of it. The gate is
therefore ~90 % a steady-state measurement — which is clean, on every engine, in every
configuration — and ~10 % a cold-start measurement, which is what fails.

### 6.5 The other two engines, for completeness

**Chromium** never exceeds **6.3 ms** in any of the nine cells, with a rock-steady 60 Hz
rAF and `rafMaxGap` 21–23 ms. It has 8x headroom everywhere and needs nothing.

**WebKit** never exceeded 50 ms in any isolated cell here (max 46 ms), but it has almost no
headroom and the reason is structural, not ours: **with no frame stream at all** (cell B,
29 msg/s, ~0 bytes) it still records 168 gaps ≥ 25 ms and a max of 34 ms. That floor is
present in seven of its eight cells at 144–168 occurrences. The one cell without it is
`H-defaults` — **max 16 ms, zero gaps ≥ 25 ms**, WebKit's best result by a factor of two,
and the only cell with both a low message rate and `sliceTicks: 240`.

WebKit's worst cell is `F-800res` (**46 ms**, 425 gaps ≥ 25 ms), whose gaps each contain
**30–32 messages and 0.22 MB with ~0 ms of handler time**: a queue drain, at ~1.4 ms per
message of engine-side dispatch. That is the per-message cost of §6.2 in visible form, and
it is why WebKit is the engine D1 actually threatens.

---

## 7. Withdrawal: the prior attribution does not reproduce

The header of `engine/test-browser/worker/uithread.scale.worker.test.ts` attributes the
stall to *"the snapshot ring at production population (228 snapshots, 122 MB) combined
with the short slice cadence"*, and exonerates the frame protocol on the strength of a 2×2
in which the frames-disabled cell measured **157 ms, 2 long tasks**.

The exoneration of the frame protocol is **correct and is confirmed here** — more strongly
than the original argument made it, because frames-off *and* ring-off also stalls.

The positive half of the attribution does not survive:

* Every cell of that 2×2 was a single run of a **bimodal, low-rate event**, and every cell
  that stalled was the first run in its page.
* Holding the ring footprint roughly constant and varying its churn 16x changes nothing:
  `J-snap480` (57 snapshots, 126 MB) → **max 18 ms, 0**; `K-snap30` (911 snapshots,
  144 MB) → **max 11 ms, 0**. Both clean, both non-first.
* Removing the ring entirely from a **cold** page does not help: `C2` (no frames, no
  snapshots, ring 0 MB) → **153 / 158 ms, 2 long tasks**.
* And the gated configuration itself is clean 2 runs out of 3 when it is not first
  (`A-gated-r2` 23 ms, `A-gated-r3` 15 ms).

Consequence for the gate, which matters independently of any fix: **`uithread.scale.worker.test.ts`
is non-deterministic.** Of five isolated Firefox runs of the gated configuration today,
three were red and two would have passed. A gate that reports a coin flip cannot be used
to accept or reject a change.

The whole suite says the same thing. `npm run test:browser`, run three-up as configured,
before and after this investigation with **no shipped code changed between them**:

| | verdict | failing cases |
|---|---|---|
| as reported in `DR-WP9-WP10-verification` §II.8 | `4 failed \| 95 passed`, exit 1 | FF 6,842 (156 ms) · WK 6,842 (61 ms) · FF 800 (132 ms) · WK 800 (50 ms) |
| this run, 2026-08-03 | `3 failed \| 96 passed`, exit 1 | FF 6,842 (**131, 107, 55 ms** — 3 gaps) · WK 6,842 (**115, 69 ms**) · FF 800 (**97 ms**) |

Same code, same box, same command; a different failure *set*, a different failure *count*,
and gaps ranging 55–156 ms on the same assertion. WebKit's 800-resident case — the one
whose `expected 50 to be less than 50` exposed the rounded-vs-raw defect — passed this
time. The clause is red either way, which is why the verdict below is still NO-GO, but
neither the count nor the magnitude is a stable measurement of anything.

---

## 8. Recommendation

### 8.1 The smallest change the evidence supports

**Make clause 2 differential, by adding the empty-page control to the gate.** Concretely,
in `engine/test-browser/worker/uithread.scale.worker.test.ts`:

1. Add one `it` that runs the existing `LongTaskProbe` for the same duration on the same
   cold page **with no worker** — roughly 20 lines, reusing `probe.ts`, no new
   infrastructure. Record its distribution.
2. Change the two assertions from absolute to differential: the streamed run must produce
   **no gap the empty page does not also produce**, within a stated margin.

This is not a relaxation. The 50 ms threshold is untouched, the population is untouched,
the horizon is untouched, and the gate keeps its ability to go red — a regression that
made the *streaming* path stall would still fail it, because the empty page would not
stall with it. What it removes is the gate's current inability to tell "our code stalls
the UI thread" from "a cold Firefox page stalls". Today it reports the second as the
first.

It also fixes the flakiness in §7, because both arms see the same cold-start event.

### 8.2 What must be said plainly, and signed off

**Read literally, clause 2 is false on Firefox and no change to `websim` can make it
true.** N1 proves it: the clause fails with nothing under test. Adopting §8.1 is therefore
a **renegotiation of a WP10 acceptance criterion** and needs a decision record and the
user's/mentor's sign-off under plan §9.3 — it is not an engineering judgement to be made
inside a gate file.

The honest restatement is two clauses, both measured, neither weakened:

* **2a — steady state.** Once the page is warm, the UI thread stays long-task-free
  (< 50 ms) at max speed. **Measured green: 22 consecutive runs, all three engines, worst
  gap 34 ms** (Firefox 9–34, Chromium 5.5–6.3, WebKit 15–46).
* **2b — cold start.** The page's first-run pause, reported not gated, because it is a
  property of the browser: **Firefox 138–165 ms, Chromium 17.6 ms, WebKit 15 ms**, with
  nothing under test.

The alternative on the table — narrowing the clause to Chromium — is worse. It would hide
a ~140 ms pause that a Firefox user *will* experience on their first run, and it would
throw away the one thing here that is genuinely actionable for the product (§8.3).

### 8.3 Independently justified, and not motivated by the gate

**D1 — cap frame emission at display cadence.** `SimHost` should not emit a frame batch
more often than the page can paint one: a `maxFramesPerSecond` on `RunOptions`, defaulting
to 60, enforced by a wall-clock check in `captureFrame`. Justification stands on §5.1
alone — 12–136 frames delivered per paintable frame, 92–99 % of 1.68 GB discarded
unrendered — and it is worth most where the product is weakest: on WebKit the current
cadence costs **6.0x wall clock** (3.6 s of tick loop, 21.6 s of wall) at 800 residents.
Supporting evidence, weaker and stated as such: the two lowest-frame-rate cells are the
cleanest on every engine, and WebKit's `H-defaults` (16 ms, zero gaps ≥ 25 ms) is its best
cell of the nine — but those are single runs each and, per §6.3, single runs cannot decide
anything about the long task. **Do not present this as the fix for clause 2. It is not.**

**D2 — do not ship `sliceTicks: 30`.** It costs WebKit 15.3–18.0 s of wall clock per
455-hour run for nothing (§0). `RUN_OPTION_DEFAULTS.sliceTicks` is already 240 and is
fine; the value belongs in a documented lower bound, and the "no clamp" comment at
`simHost.ts:93-96` needs the WebKit measurement next to it.

**A note on the cold-start pause as a product concern.** The warm-up control (§6.3b) shows
it can be *moved* — a 0.7 s run halves it — so running a throwaway warm-up behind the
existing "building…" phase would put most of it where nothing is being interacted with.
That is a real improvement and it is measured. It is **not** a route to clause 2 as
written: after a 0.7 s warm-up Firefox still recorded 75–80 ms. How long a warm-up is
needed to get under 50 ms was not measured, and should be measured before anyone builds
it.

### 8.4 Not recommended

* Raising the 50 ms threshold, shrinking the population, shortening the horizon, or
  lowering the frame rate *in order to pass* — all four are available and all four would
  be dishonest, and §6.3 shows the first three would not even work.
* Any change to the transfer protocol. It is provably zero-copy in all three engines (§4).
* Shrinking the snapshot ring **for this reason**. It does not help (§7). If the ring
  should shrink, it should shrink on a memory argument, measured separately.

---

## 9. Reproducing this

```
npx vitest run --config engine/vitest.profile.config.mts --browser=firefox
npx vitest run --config engine/vitest.profile.config.mts --browser=firefox \
  engine/test-browser/profile/wp10-order.profile.ts
npx vitest run --config engine/vitest.profile.config.mts --browser=firefox \
  engine/test-browser/profile/wp10-warmup.profile.ts
# one cell per page — the effect is positional, so the others must be skipped
npx vitest run --config engine/vitest.profile.config.mts --browser=firefox \
  engine/test-browser/profile/wp10-cold.profile.ts -t "C5"
npx vitest run --config engine/vitest.profile.config.mts --browser=firefox \
  engine/test-browser/profile/wp10-null.profile.ts -t "N1"
```

Files added by this investigation, all new, none of them a gate:

| path | what |
|---|---|
| `engine/vitest.profile.config.mts` | profiling config; matches `*.profile.ts`, so the gate does not collect it |
| `engine/test-browser/profile/instrument.ts` | attributing probe, per-message timing, rAF log, worker starter |
| `engine/test-browser/profile/profileWorker.ts` | shipped `SimWorkerApi` + the detachment audit |
| `engine/test-browser/profile/matrix.ts` | the one-configuration runner |
| `engine/test-browser/profile/wp10-uithread.profile.ts` | cells A–I |
| `engine/test-browser/profile/wp10-replicate.profile.ts` | replicates + ring-churn cells J, K |
| `engine/test-browser/profile/wp10-order.profile.ts` | the ordering control |
| `engine/test-browser/profile/wp10-warmup.profile.ts` | the warm-up control |
| `engine/test-browser/profile/wp10-cold.profile.ts` | cold-page cells C2, C3, C5, C6 |
| `engine/test-browser/profile/wp10-null.profile.ts` | the null control |

**Nothing under `engine/src/`, `app/`, `pipeline/`, `shared/`, `validation/`, `Geography/`
or `docs/runs/` was modified**, and no fix was implemented. `git status --porcelain` shows
three additions and zero modifications: this file, `engine/vitest.profile.config.mts`, and
`engine/test-browser/profile/`.

End state, measured:

* `npm run test:browser` → **exit 1, `3 failed | 96 passed (99)`** — still red, still the
  UI-thread budget, same 99 collected tests and same five collected files as before, so the
  profile matrix is genuinely outside the gate.
* `npm run typecheck` → exit 0 (both engine projects, all five workspaces, `tools`).
* `npm run lint:claims` → exit 0, *0 hits in 0 files, 451 files scanned against 23 rules*.
* `npm run check:scratch` → exit 0, *13 produced entries allowed, `test-tmp/` empty*.
* `pipeline/out` → **852 files, 831 MB, unchanged. No `--clean` was ever run and nothing
  under it was deleted.**

**WP10 clause 2 remains NO-GO.** This document does not close it; it says what the red
number is and is not, and §8 says what closing it would require.

---

## Appendix — the full matrix

Each row is one run. All at 6,842 residents / 455 h unless stated. `A` is the
configuration the gate uses.

| engine | cell | what changed | max ms | ≥50 | ≥25 | window | frames/s | rAF/s | f/paint | MB/s | ring MB | snaps |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| firefox | A-gated | — (first in page) | **183** | **2** | 4 | 59 s | 460 | 36.3 | 12.7 | 28.3 | 122 | 228 |
| firefox | B-noframes | frames off | 24 | 0 | 0 | 40 s | 0 | 34.5 | — | 0.0 | 122 | 228 |
| firefox | C-nosnap | snapshots off | 22 | 0 | 0 | 51 s | 533 | 33.1 | 16.1 | 32.9 | 0 | 0 |
| firefox | D-batch64 | batch 64 (same bytes) | 12 | 0 | 0 | 50 s | 8 | 33.2 | 16.3 | 33.4 | 122 | 228 |
| firefox | E-decim64 | frame/64 ticks | 11 | 0 | 0 | 39 s | 11 | 34.6 | 0.31 | 0.67 | 122 | 228 |
| firefox | F-800res | 800 residents | 18 | 0 | 0 | 6 s | 4,911 | 39.9 | 123.0 | 35.5 | 14 | 228 |
| firefox | G-nowalk | no UI walk | 34 | 0 | 81 | 53 s | 515 | 32.7 | 15.7 | 31.7 | 122 | 228 |
| firefox | H-defaults | shipped defaults | 24 | 0 | 0 | 44 s | 1 | 33.4 | 0.31 | 0.64 | 142 | 456 |
| firefox | A-gated-r1 | replicate (first in page) | **180** | **2** | 3 | 55 s | 501 | 33.7 | 14.8 | 30.8 | 122 | 228 |
| firefox | A-gated-r2 | replicate | 23 | 0 | 0 | 53 s | 512 | 32.8 | 15.6 | 31.6 | 122 | 228 |
| firefox | A-gated-r3 | replicate | 15 | 0 | 0 | 54 s | 505 | 32.8 | 15.4 | 31.1 | 122 | 228 |
| firefox | B-noframes-r2 | replicate | 10 | 0 | 0 | 40 s | 0 | 33.6 | — | 0.0 | 122 | 228 |
| firefox | C-nosnap-r2 | replicate | 12 | 0 | 0 | 52 s | 525 | 33.3 | 15.8 | 32.4 | 0 | 0 |
| firefox | J-snap480 | ring kept, churn ÷4 | 18 | 0 | 0 | 51 s | 533 | 33.4 | 16.0 | 32.8 | 126 | 57 |
| firefox | K-snap30 | ring kept, churn ×4 | 11 | 0 | 0 | 62 s | 440 | 33.2 | 13.3 | 27.1 | 144 | 911 |
| chromium | A-gated | — | 5.7 | 0 | 0 | 30 s | 907 | 60.0 | 15.1 | 55.9 | 122 | 228 |
| chromium | B-noframes | frames off | 5.6 | 0 | 0 | 22 s | 0 | 60.1 | — | 0.0 | 122 | 228 |
| chromium | C-nosnap | snapshots off | 6.1 | 0 | 0 | 29 s | 955 | 60.0 | 15.9 | 58.8 | 0 | 0 |
| chromium | D-batch64 | batch 64 | 6.3 | 0 | 0 | 31 s | 14 | 60.0 | 14.7 | 54.3 | 122 | 228 |
| chromium | E-decim64 | frame/64 ticks | 5.9 | 0 | 0 | 22 s | 19 | 60.0 | 0.32 | 1.2 | 122 | 228 |
| chromium | F-800res | 800 residents | 5.5 | 0 | 0 | 3 s | 8,149 | 60.0 | 135.8 | 58.9 | 14 | 228 |
| chromium | G-nowalk | no UI walk | 5.8 | 0 | 0 | 30 s | 924 | 60.0 | 15.4 | 56.9 | 122 | 228 |
| chromium | H-defaults | shipped defaults | 5.7 | 0 | 0 | 24 s | 2 | 60.0 | 0.32 | 1.2 | 142 | 456 |
| webkit | A-gated | — | 39 | 0 | 144 | 57 s | 483 | 39.9 | 12.1 | 29.8 | 122 | 228 |
| webkit | B-noframes | frames off | 34 | 0 | **168** | 47 s | 0 | 39.6 | — | 0.0 | 122 | 228 |
| webkit | C-nosnap | snapshots off | 34 | 0 | 150 | 54 s | 502 | 40.0 | 12.6 | 30.9 | 0 | 0 |
| webkit | D-batch64 | batch 64 | 35 | 0 | 155 | 52 s | 8 | 39.9 | 13.3 | 32.5 | 122 | 228 |
| webkit | E-decim64 | frame/64 ticks | 34 | 0 | 164 | 45 s | 9 | 39.6 | 0.24 | 0.58 | 122 | 228 |
| webkit | F-800res | 800 residents | **46** | 0 | **425** | 22 s | 1,261 | 39.9 | 31.6 | 9.1 | 14 | 228 |
| webkit | G-nowalk | no UI walk | 33 | 0 | 155 | 55 s | 499 | 39.9 | 12.5 | 30.7 | 122 | 228 |
| webkit | H-defaults | shipped defaults | **16** | 0 | **0** | 31 s | 2 | 39.8 | 0.36 | 0.89 | 142 | 456 |

Worker-yield cost, derived from the same runs (`sendSpan − tickLoop`, over
`ceil(27,300 / sliceTicks)` yields):

| engine | `sliceTicks: 30` (910 yields) | `sliceTicks: 240` (114 yields) |
|---|---|---|
| Chromium | 0.1–0.3 s total, **0.08–0.37 ms/yield** | ~0 |
| Firefox | 0.1–0.9 s total, **0.10–0.95 ms/yield** | 0.4 s, 3.8 ms/yield |
| WebKit | **15.3–18.0 s total, 16.8–19.8 ms/yield** | 0.1 s, 1.1 ms/yield |
