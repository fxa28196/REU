# WP13 accessibility evidence

**Status of the acceptance clause "axe clean": the automated half is now MET.
The manual keyboard / screen-reader half is NOT, and no one has executed it.**

Read §4 before quoting this document as clearance for anything.

---

## 0. Why this file exists

The independent acceptance gate of **2026-08-04** returned WP13's accessibility
clause UNMET, and its evidence was not a judgement call:

> full-source grep for `axe.run` / `injectAxe` / `vitest-axe` / `jest-axe` /
> `axe-core` over `websim` (excluding `node_modules`) returns NOTHING;
> `axe-core` appears only as a transitive lockfile dep of
> `eslint-plugin-jsx-a11y`. No manual keyboard/screen-reader script record
> exists anywhere in `websim/docs`.

That was correct. WP13 had shipped real accessibility work — accessible chart
names, data-table alternatives, an `aria-live` ticker throttled to simulated
hours, the reduced-motion swap, a skip link, and Node tests for all of it — and
the clause had been carried on the strength of that adjacent work. **No axe run
had ever happened.** The clause was being reported green on the basis of effort
rather than measurement.

This file records the measurement that was missing, what it found, what was
fixed, and — separately and explicitly — what is still not done.

---

## 1. The automated gate

**`npm run axe`** → `tools/axe-gate.ts`. Not in `npm run ci` yet (see §5).

| property | value |
|---|---|
| Scanner | `axe-core` 4.12.1 via `@axe-core/playwright` 4.12.1 |
| Browser | Chromium via Playwright 1.56.1, headless, 1440×960 |
| Target | `app/dist` — the **built** app, served over a local `node:http` static server |
| Tags | `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa` (WCAG 2.2 Level AA) |
| Fails on | any violation of impact `serious` or `critical` |
| Advisory | `minor` / `moderate` violations, and all `incomplete` results |

### 1.1 The anti-spinner contract

A headless scan of a page that has not finished booting reports "0 violations"
about a loading screen. That is worse than a red gate — it is a false green with
an artefact attached. So each screen carries an explicit readiness contract (a
selector that must be present, the loading sentences that must be gone, the
failure sentences that must never appear). A screen that cannot reach ready
inside **180 000 ms** fails loudly with a snapshot of what was actually on
screen; it is never scanned anyway. Each result is printed with a **DOM census**
so a reader can check the scan saw a populated screen rather than an empty
shell — a "0 violations" over 38 elements means something different from one
over 1786.

---

## 2. The run of 2026-08-05

`npm run axe` → **exit 0**. Six scans. **0 serious/critical violations.**

Run conditions recorded by the gate: *"Every asset the page requested was served
(no 404s). No page errors or console errors."*

| # | scan | DOM census | rules passed | violations | incomplete |
|---|---|---|---|---|---|
| 1 | Run screen | 630 el, 8 headings, 27 buttons, 2 tables, 1 live region, 5194 chars | 32 | **0** | 1 rule / 21 nodes |
| 2 | Compare screen | 38 el, 2 headings, 6 buttons, 0 tables, 0 live regions, 1097 chars | 18 | **0** | 1 rule / 1 node |
| 3 | Archive screen | 1786 el, 18 headings, 177 buttons, 16 tables, 0 live regions, 12408 chars | 21 | **0** | 1 rule / 1 node |
| 4 | Provenance screen | 1110 el, 18 headings, 5 buttons, 6 tables, 0 live regions, 24933 chars | 24 | **0** | 1 rule / 47 nodes |
| 5 | Run + capability dialog open | 630 el, 5942 chars (dialog in top layer) | 14 | **0** | 1 rule / 12 nodes |
| 6 | Run + both chart data tables expanded | 630 el, 5380 chars | 32 | **0** | 1 rule / 21 nodes |

### 2.1 What the FIRST run found (all now fixed)

Before remediation the same command reported
`FAIL: 6 serious/critical violation(s) across 5 scan(s)` — six *rule-instances*
(a rule counted once per scan it fired in), covering **20 failing node-instances
= 17 distinct nodes** (the fifth scan re-reports the Run screen's three). The
dialog pass did not exist yet. All 17 are listed below.

**`color-contrast` (serious)** — every instance was one mistake made in four
places: **an Okabe-Ito hex used as TEXT on a dark surface.** Okabe-Ito is a
palette for colourblind-safe *data marks*; it carries no luminance-contrast
promise as small text.

| node | measured | required |
|---|---|---|
| `.app-topbar-badge` (all four screens) | 3.49:1 — `#14161a` ink on the `#0072b2` chip | 4.5:1 |
| `section[aria-label="Run badge and provenance"] > span` (BadgePanel chip) | 3.49:1 | 4.5:1 |
| `.chip` / `.chip-live` ("Live browser simulation") | 3.49:1 | 4.5:1 |
| `.panel-warn` ("Blocking assumptions …") | 4.27:1 — `#d55e00` on `#1c1f24` | 4.5:1 |
| 3 × `(placeholder — inert)` spans, Provenance | 4.27:1 | 4.5:1 |
| 4 × `blocking` status cells, Provenance | 4.27:1 | 4.5:1 |

**`scrollable-region-focusable` (serious)** — 2 nodes on Provenance:

- `#main-content > div` — the whole Provenance page body. It scrolls and, unlike
  Archive and Compare, contains **nothing focusable**, so a keyboard-only user
  could not reach the governance registry or the asset manifest below the fold.
  WCAG 2.1.1 (Keyboard).
- `section[aria-label="Asset manifest"] > div > div:nth-child(4)` — the manifest
  table's horizontal scroll container, same failure.

**`aria-prohibited-attr` (serious, reported as `incomplete`)** —
`span[aria-label="Simulated clock"]` in the Scrubber. `aria-label` is prohibited
on the generic role a bare `<span>` carries, so support is engine-dependent —
which is exactly why axe returned it as undecidable rather than as a violation.

### 2.2 What was fixed

New pure module **`app/src/a11y/contrast.ts`** — the WCAG relative-luminance and
contrast-ratio formulas, plus the tokens derived from them. The principle: the
palette is kept and only what is *drawn in it* changes.

- **Fills stay Okabe-Ito, untouched.** `BADGE_COLORS`, occupancy bars, map
  symbols, the diverging shelter bars and the INVALID watermark are unchanged.
  A test asserts `BADGE_COLORS` still equals its four original hexes, so the
  remediation cannot have quietly moved a data-mark colour.
- **Ink on a fill is computed, not assumed** — `inkOn(fill)` returns whichever
  ink actually clears AA on that swatch. Dark ink keeps winning on green
  (5.29:1), amber (8.04:1) and vermillion (4.68:1); white takes over on the blue
  (5.19:1), which is the violation.
  Applied in `App.tsx` (`.app-topbar-badge`), `badge/BadgePanel.tsx` (chip), and
  `theme.css` (`.chip-live` → white).
- **Coloured TEXT uses a lightened tint of the same hue** — `WARN_TEXT`
  `#da711f` (5.01:1 on panel, 5.49:1 on bg; raw `#d55e00` was 4.27:1) and
  `LIVE_TEXT` `#4095c5` (4.98:1 on panel; raw `#0072b2` was 3.19:1). Mirrored in
  `theme.css` as `--ws-warn-text` / `--ws-live-text`. Applied in `theme.css`
  (`.panel-warn`), `screens/Provenance.tsx`, `screens/Archive.tsx`,
  `screens/Compare.tsx` and `badge/ExecutedDiff.tsx`.

New component **`app/src/a11y/ScrollRegion.tsx`** — `role="region"` +
`aria-label` + `tabIndex={0}`, the WAI-ARIA Authoring Practices pattern for a
scrollable container. Applied to the Provenance page body, its four table
wrappers, Compare's family-range table, and `DataTable`'s `.data-table-wrap`.
Deliberately **not** applied to the Run rails, the Archive page or the Compare
page: those scroll but contain buttons, which already satisfies the rule, and
wrapping them would add tab stops that buy nothing.

`controls/Scrubber.tsx` — the prohibited `aria-label` on a generic `<span>` was
replaced with a real `.visually-hidden` label, so the clock reads as
"Simulated clock 03:00" with no engine-dependent behaviour.

**Rules and tests: nothing was weakened.** One tension had to be resolved:
`jsx-a11y/no-noninteractive-tabindex` forbids exactly the `tabIndex` that axe's
`scrollable-region-focusable` requires. The lint rule is a *static* heuristic and
cannot see `overflow: auto`; axe measured the rendered page. For a WCAG
conformance clause the rendered-page measurement is the authority, so the
disagreement is resolved by **one justified per-line disable inside
`ScrollRegion.tsx`** — the rule stays on everywhere else, including for every
caller of that component. The eslint config was not touched.

### 2.3 The `incomplete` results — checks that did NOT run

An incomplete is not a pass. Every one in the run above is `color-contrast`, and
the gate now prints axe's own reason:

| reason | nodes | assessment |
|---|---|---|
| "Element content contains only non-text characters" | 8 (Run), 1 (Compare), 1 (Archive), 1 (Provenance) | The `aria-hidden="true"` glyph spans (`◆`, `✓`, the map-legend glyphs). Not text, and hidden from the accessibility tree — no contrast requirement applies. Resolved: non-issue. |
| "Element content is too short to determine if it is actual text content" | 2 (Run) | Map-legend items. Same palette as the surrounding legend text. Resolved: non-issue. |
| "background could not be determined because it is overlapped / partially obscured / partially overlaps" | 11 (Run), 46 (Provenance), 12 (dialog) | axe cannot composite through the map canvas, the sticky table headers or the `<dialog>` top layer. **NOT resolved by the scanner — see §4 step 7.** |

---

## 3. What the Node a11y tests cover (`app/test/a11y.test.ts`)

**35 tests** (26 before this work, +9 for the contrast module). They test *pure
functions in Node with no DOM* — which is their strength and their limit: they
pin the logic that produces accessible text, and can say nothing about layout,
focus or rendering.

| group | tests | what it pins |
|---|---|---|
| `tickerMessage` | 7 | The live-region message style verbatim (`"Hour 79: closure wave 1; 412 sheltered; PM2.5 562 ug/m3"`); the wave clause only at the wave hour; `done` wave events ignored; **NaN spoken as a data gap, never as a number**; run-complete / paused appended from the status phase; `null` with no rows (nothing fabricated). |
| `nextAnnouncement` | 3 | The **hour-change throttle** — a new hour announces, the same hour refuses to re-announce, silence with no data. This is what stops a 60 fps frame stream from producing 60 announcements a second. |
| `censusChartSummary` | 3 | The `aria-describedby` text for the state-census chart: hour range, per-state counts in `STATES` order, honest empty sentence, NaN as "unavailable". |
| `smokeChartSummary` | 4 | Peak, threshold count and units, **the threshold named as a concentration and never as an index**, gaps counted as gaps, the constructed-counterfactual label carried verbatim. |
| `censusTableModel` / `smokeTableModel` | 4 | The data-table alternative's numbers: `Hour` + one column per state, true de-stacked counts, NaN → `"missing"` (never `0`), empty rather than fabricated. |
| `runCenterMode` | 2 | The reduced-motion decision as a pure function, and that it queries the standard media feature. |
| `scrubberValueText` | 1 | The scrubber's `aria-valuetext` (spoken simulated clock, clamped to the track). |
| non-colour channels | 2 | `STATE_GLYPHS` and `BADGE_GLYPHS` are total and distinct — colour is never the sole channel. |
| WCAG contrast math *(new)* | 4 | The formula (black/white = 21:1), order-independence, **refusal to parse a bad hex rather than defaulting to black**, and reproduction of the three ratios axe measured (4.27, 3.19, 3.49). |
| `inkOn` *(new)* | 3 | Every badge fill clears AA with its computed ink; the green/amber/vermillion→dark, blue→white split; `BADGE_COLORS` unchanged. |
| coloured-text tokens *(new)* | 2 | Both tokens clear AA on both surfaces while the raw hues they replace do not; and the tokens **equal the values `theme.css` serves**, so the CSS and TS halves cannot drift apart. |

---

## 4. NOT DONE — the manual keyboard / screen-reader pass

> **This has not been executed. No human has run it. The acceptance clause's
> manual portion remains UNMET, and nothing in §2 or §3 discharges it.**

Automated scanning detects roughly a third of WCAG failures. Tab *order*, focus
*visibility* in practice, whether the live region announces at a usable cadence,
and whether the reduced-motion path is comprehensible are not decidable by a
scanner. Nor is anything behind a live run: **the scan ran with no simulation
executed**, so the chart data tables were scanned in their empty state
("No rows yet — press Play…"), the live ticker in its resting state, and the
map with no agents on it.

### Script for whoever runs it

Setup: `npm run build -w app && npx vite preview --outDir dist` from
`websim/app`, or serve `app/dist` any other way. Record **pass/fail plus what
you observed** for each step, and append the result to this file with a date and
your name. A step you did not run is recorded as not run.

**Screen reader:** at least one of NVDA + Firefox (Windows), VoiceOver + Safari
(macOS), or Orca + Firefox (Linux). Note which you used — behaviour differs.

#### A. Tab order and focus visibility (WCAG 2.4.3, 2.4.7, 2.1.1)

1. Load the page. Press **Tab** once. The **"Skip to main content"** link must
   become visible (it is off-screen until focused) at the top-left. Press
   **Enter**; focus must move into `#main-content` and the next Tab must land
   inside the Run screen, not back in the top bar.
2. Reload. Tab through the whole top bar. Expected order: skip link → Run →
   Compare → Archive → Provenance → Copy permalink. Every stop must show the
   **2px `#e69f00` focus ring with 2px offset**. Flag any stop where the ring is
   invisible, clipped by an ancestor's `overflow: hidden`, or lost against the
   background.
3. Continue tabbing through the Run screen: preset picker, sliders, chart
   data-table toggles, export buttons, the scrubber. Confirm the visual order
   matches the DOM order — anything that jumps backwards or skips a rail is a
   2.4.3 failure. Confirm **nothing is a trap**: Shift+Tab must always get back
   out.
4. Activate every control with **Enter and Space** (not the mouse). Buttons must
   respond to both.
5. Go to **Provenance** and Tab. You should land on the new scroll regions
   ("Provenance details", "Variables in evidence class …", "Assumptions table",
   "Graph correction records table", "Asset manifest table"). On each, confirm
   **Arrow Up/Down and Page Up/Down actually scroll the region**. This is the
   fix for the `scrollable-region-focusable` violation; if the keys do not
   scroll, the fix is cosmetic and the clause is still failed.
6. Press **Play** on the Run screen to open the capability dialog. Confirm:
   focus moves into the dialog and lands on **"Show archived certified results
   only"**; Tab cycles **only within** the dialog; **Escape** closes it and
   focus returns somewhere sensible; the page behind is inert.
7. **The unresolved contrast items from §2.3.** With the map rendered and the
   dialog open, eyeball the map legend, the slider value spans, the sticky
   table headers over scrolled rows, and the dialog body. axe could not
   composite these backgrounds; a human can. Report anything that looks thin.

#### B. Live-region announcements (WCAG 4.1.3)

8. With the screen reader running, press Play and accept the capability dialog.
   Listen to the ticker above the scrubber. You must hear, once per **simulated
   hour** and in this shape:
   `"Hour 79: closure wave 1; 412 sheltered; PM2.5 562 ug/m3"`.
9. **The throttle is the thing to verify.** Frames arrive at up to 60/s; the
   text must change only on hour boundaries. If you hear a continuous stream, or
   overlapping interrupted speech, the throttle has regressed — this is the
   defect the `nextAnnouncement` tests exist to prevent, but only the ear can
   confirm it end to end.
10. Confirm the region is **polite**, not assertive: it must not interrupt you
    mid-sentence while you read something else.
11. Let a run finish. Confirm you hear the run-complete clause. Pause a run;
    confirm you hear the paused clause.
12. Before any run, confirm the region's resting text is the honest empty
    sentence and not silence-that-sounds-broken.

#### C. Reduced motion (WCAG 2.3.3)

13. Turn the OS setting on (Windows: Settings → Accessibility → Visual effects →
    Animation effects off; macOS: Accessibility → Display → Reduce motion;
    Firefox: `ui.prefersReducedMotion=1`). Reload the Run screen.
14. The animated map **must be replaced** by the state-census flow chart, with
    the explanatory sentence above it. Confirm there is **no continuous
    motion anywhere** — the chart advances once per simulated hour.
15. Run a simulation in this mode and confirm it is still comprehensible: you
    can tell what is happening without the map.
16. Toggle the OS setting back off with the page open and confirm it recovers.

#### D. Data-table alternatives (WCAG 1.1.1)

17. **Run a simulation first** — this is what the automated scan could not do.
    The tables are empty until metrics exist, so everything below is untested
    territory.
18. On each chart, activate "View … as data table". Confirm the button's state
    is announced (`aria-expanded` true/false) and the label text flips to
    "Hide …".
19. Navigate the revealed table with screen-reader table commands. Confirm the
    **caption** is announced, the **column headers** are announced when moving
    across, and the **hour row header** is announced when moving down.
20. Confirm the numbers **match the chart** for at least three sampled hours.
21. Find an hour the chart draws as a gap and confirm the table says
    **"missing"**, not `0`. If a real gap is not reachable, say so rather than
    marking this passed.
22. Confirm the expanded table scrolls by keyboard (it is a `ScrollRegion`).

---

## 5. Not yet wired into CI

`npm run axe` is **deliberately not in the `ci` script**. Like `gate:browser` it
needs Playwright browser binaries (`npx playwright install chromium`) that
`npm ci` does not fetch, and it needs `app/dist` to exist. It passes today at
exit 0, so adding it is a decision about a fresh clone's first `npm run ci`
rather than a question of whether it would go green. That decision belongs with
the WP13 sign-off.

Prerequisites when it is added:

```
npm run build -w app     # produces app/dist
npm run axe
```

---

## 6. Reproducing this record

```
cd websim
npm install
npx playwright install chromium     # once
npm run build -w app
npm run axe                         # exit 0 as of 2026-08-05
npm run typecheck                   # exit 0
npm run lint                        # exit 0
npx vitest run --project app        # 377 passed
```
