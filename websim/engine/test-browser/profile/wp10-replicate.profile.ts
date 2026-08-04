/**
 * WP10 UI-thread profile — **replicate pass**, and two cells the first matrix
 * could not separate (DR-WP10-uithread-perf).
 *
 * The stall this investigation is about is *rare*: 2 gaps out of 10.4 million
 * probe samples in the red configuration. A single 60-second run per cell
 * therefore cannot distinguish "this configuration is clean" from "this
 * configuration was lucky", and the first matrix is exactly that — one run per
 * cell. This file repeats the red cell three times and the two nearest clean
 * cells twice, so the claim rests on an event rate rather than on a single
 * observation.
 *
 * It also adds the cell the first matrix was missing. `A` (snapshots every 120
 * ticks) and `C` (no snapshots) differ in **two** things at once: how many
 * snapshots are allocated over the run, and how many megabytes the ring holds
 * live at the end. `J` and `K` hold the ring footprint roughly constant
 * (~57 live keyframes either way, because the sparse index caps at 64 and thins)
 * while changing the allocation churn 16-fold:
 *
 * ```
 *   J  snapshotEveryTicks 480 →  57 snapshots taken, ~107 MB live
 *   A  snapshotEveryTicks 120 → 228 snapshots taken, ~122 MB live
 *   K  snapshotEveryTicks  30 → 910 snapshots taken, ~122 MB live
 * ```
 *
 * If the stall tracks *live bytes* all three behave alike; if it tracks
 * *allocation churn* they separate. That is the difference between "shrink the
 * ring" and "take fewer snapshots" as a fix, so it is worth one more run.
 */

import { describe, it } from "vitest";

import { ENGINE_LABEL } from "./instrument.js";
import { GATED, runConfig } from "./matrix.js";

describe(`WP10 UI-thread replicate [${ENGINE_LABEL}]`, () => {
  it("A gated, replicate 1", async () => {
    await runConfig("A-gated-r1", GATED);
  }, 1_800_000);

  it("A gated, replicate 2", async () => {
    await runConfig("A-gated-r2", GATED);
  }, 1_800_000);

  it("A gated, replicate 3", async () => {
    await runConfig("A-gated-r3", GATED);
  }, 1_800_000);

  it("B frames off, replicate", async () => {
    await runConfig("B-noframes-r2", { ...GATED, frameEveryTicks: 0 });
  }, 1_800_000);

  it("C snapshots off, replicate", async () => {
    await runConfig("C-nosnap-r2", { ...GATED, snapshotEveryTicks: 0 });
  }, 1_800_000);

  it("J snapshots every 480 ticks: same ring footprint, 1/4 the churn of A", async () => {
    await runConfig("J-snap480", { ...GATED, snapshotEveryTicks: 480 });
  }, 1_800_000);

  it("K snapshots every 30 ticks: same ring footprint, 4x the churn of A", async () => {
    await runConfig("K-snap30", { ...GATED, snapshotEveryTicks: 30 });
  }, 1_800_000);
});
