# Smoke Field Audit

**The reviewer question this document exists to answer:**

> *"How do you estimate PM2.5 between monitors?"*

**The exact answer: we do not interpolate. There is no spatial model. Every
resident in the county breathes the same concentration at the same hour.**

**Audit date:** 2026-07-26 · **Model commit:** `b69fc6d`

---

## 1. What is actually implemented

| Property | Implementation |
|---|---|
| Spatial method | **None.** Not IDW, not kriging, not nearest-monitor, not raster. A single scalar per hour applies county-wide |
| Aggregation | Unweighted arithmetic mean of the **two in-county monitors** for that clock hour |
| Temporal resolution | **Hourly**, held constant within the hour (step function, no sub-hourly interpolation) |
| Vertical / microscale | None. No street-canyon, plume, indoor-infiltration or breathing-height adjustment |
| Class | **M (measured)** for the concentration series; **A (assumption)** for its spatial uniformity |

In code: `SmokeField` filters AQS rows on `County Name == "Multnomah"`, buckets
them by `ChronoUnit.HOURS.between(SIM_START, observation)`, and stores
`{sum, count}` per hour. `concentrationForTick()` returns `sum/count`.

So a resident in St. Johns and a resident in Lents receive **identical**
concentrations at every tick. All between-resident exposure variation in this
study arises from **time outdoors**, never from where they were.

---

## 2. The measured series

Verified independently from the raw file during this audit:

| Property | Value |
|---|---|
| Source | U.S. EPA Air Quality System, hourly, parameter **88502** |
| Rows | 4,795 (7 monitors, tri-county); **1,454 Multnomah** |
| In-county monitors | Site **0080** (45.4966, −122.6029) and Site **2011** (45.5622, −122.5757) |
| Units | µg/m³ (local conditions) |
| Simulation window | 2020-09-07 00:00 → 2020-09-19 23:00 — **312 of 312 hourly slices present, zero gaps** |
| Peak (county hourly mean) | **562.7 µg/m³** at 2020-09-12 20:00 |
| Peak (single monitor) | **588.9 µg/m³**, site 2011, 2020-09-13 21:00 |
| Mean over window | 173.09 µg/m³ |
| Hours ≥ 55.5 µg/m³ | **194 of 312** |
| Full-window integral | **54,002.7 µg·m⁻³·h** (model: 54,002.8; ratio 1.0000) |

**Two "peak" figures exist and must not be conflated.** 562.7 is the two-monitor
hourly *mean*; 588.9 is the highest single-monitor hour. The model uses and
reports 562.7 because that is the field it actually integrates. Documents quoting
588.9 are quoting the monitor maximum.

**Primary-agency corroboration of the event window.** EPA's own AQS informational
qualifier **`IT` = "Wildfire – U.S."** is set on 1,576 rows, spanning exactly
**2020-09-07 → 2020-09-19** — the simulation window to the day. This is EPA
attesting that these observations are wildfire-influenced, and it is the
strongest external validation of the study period available.

---

## 3. Why no interpolation — the defensible answer

**Two in-county monitors cannot support a spatial model.**

Inverse-distance weighting, kriging, or any surface fitted to two points does not
recover a real concentration field; it manufactures a gradient whose shape is an
artefact of the interpolant and the placement of two instruments. A kriging
variogram cannot be estimated from two stations at all. Presenting such a surface
would create the appearance of spatial precision the data cannot support, and
would make every "exposure hot-spot" in the results an artefact.

The alternative — **stating plainly that the field is uniform and that all
exposure variation is therefore temporal** — is weaker-looking and more honest,
and it makes the study's actual mechanism unambiguous.

Registered as assumption **A-01**, active.

### Why the tri-county monitors are not used

Five further monitors exist in Washington and Clackamas counties. They are not
used to interpolate because (a) they lie outside the modelled geography, and
(b) adding them would define a surface across a region containing no agents,
without adding a single in-county constraint. They remain available for a
future cross-validation (§5).

---

## 4. What this assumption does to the results — stated plainly

This is the consequence a reviewer will probe, so it is stated before they ask:

1. **Placement cannot help by moving people to cleaner air**, because there is no
   cleaner air. In this model, better shelter placement helps **only** by
   shortening journeys. The measured placement benefit (−5.65% exposure, −12.57%
   inhaled dose) is therefore a **pure travel-time effect** and a **lower bound**
   on what placement could achieve in a real, spatially varying smoke field.
2. **Exposure inequality is not environmental inequality.** With a uniform field
   and exposure ending at admission, cumulative exposure is a deterministic
   function of time outdoors. Any Gini or stratified exposure contrast reported
   here is an **access/duration** statistic wearing exposure units.
3. **Absolute concentrations are county-representative, not location-specific.**
   A resident modelled at 562.7 µg/m³ was breathing whatever their actual
   neighbourhood held that hour, which the data cannot resolve.

---

## 5. What would improve it, and why it was not done

| Option | Feasibility | Why not adopted |
|---|---|---|
| IDW over all 7 tri-county monitors | Feasible | Specified in `DESIGN_SPEC.md` V5 Option B, to be adopted **only if it beats the uniform field in leave-one-out cross-validation**. With 2 in-county stations, LOOCV leaves **one** — a test with essentially no power. The specified decision test is therefore not executable as written, which is itself the finding. |
| Kriging | Not feasible | A variogram cannot be estimated from 2 in-county points |
| Low-cost sensor (PurpleAir) fusion | Possibly feasible | Not attempted: 2020 PurpleAir coverage for Portland was not acquired, calibration against FRM is a research task in itself, and correction factors for dense wood smoke are contested. Recorded as future work, not as an oversight |
| Satellite AOD downscaling | Not feasible here | Coarse resolution and heavy smoke/cloud confusion during the event |

**Verdict: the limitation is real, it is documented, and it is not resolvable
with the data in hand.** No improvement was implemented, because every available
option would have added apparent precision without adding information.

---

## 6. Instrument limitations

All 7 monitors report parameter **88502** via method **771** (heated-inlet
nephelometry), POC 3 — a **single instrument type with no method diversity and
no FRM co-location**. The `Uncertainty` column is empty in all 4,795 rows, so
there is no per-observation uncertainty to propagate.

Direction of bias: a heated inlet volatilises semi-volatile organics, which are a
large mass fraction of fresh wood smoke, so **these readings likely understate
true PM2.5 mass during the event**. With one method there is no internal way to
detect or bound that bias. 88502 is designated "acceptable for AQI" but is not a
Federal Reference Method; 88101 (FRM/FEM) has **no Multnomah monitors** in this
period, which is why 88502 was used.

---

## 7. Summary for the reviewer

> The smoke field is a **county-uniform hourly time series**, computed as the
> unweighted mean of the two EPA AQS monitors inside Multnomah County
> (parameter 88502, 312 hourly values, no gaps, peak 562.7 µg/m³, EPA-flagged as
> wildfire-influenced across exactly the study window). **No spatial
> interpolation is performed**, because two in-county monitors cannot support a
> defensible surface. Consequently all between-resident exposure differences in
> this study arise from time spent outdoors, and the reported benefit of
> optimized shelter placement is a pure travel-time effect — a lower bound on
> what placement would achieve in a spatially varying field.
