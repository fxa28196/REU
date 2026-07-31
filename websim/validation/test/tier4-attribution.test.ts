/**
 * Tier-4 attribution — turning "that's the ordering channel" into assertions.
 *
 * Arm A's `agents.csv` differs from the archive on 114 of 6,842 `final_state`
 * cells, and `shelters.csv` agrees on only 19/36 `refused_count` and 10/36
 * `mean_travel_dist_m_admitted`. Every one of those is *declared* to be
 * divergence 1 (within-tick agent order). A declaration is not evidence, so this
 * file pins the four structural consequences the ordering channel must have, and
 * which a real defect would break:
 *
 *  1. **The state flips are a balanced swap set.** Beds are conserved: if order
 *     decides who gets the last bed, then for every resident we shelter and Java
 *     did not there is exactly one Java sheltered and we did not, and no other
 *     state changes at all. A routing, smoke or capacity defect would move the
 *     totals or produce an UNREACHABLE/REFUSED flip, and neither is a swap.
 *  2. **Per-site admitted cardinality is exact.** 36/36 sites admit the same
 *     number of people. Order redistributes *which* seat, never how many.
 *  3. **`mean_travel_dist_m_admitted` matches a site if and ONLY if that site's
 *     admitted set is identical.** This is the sharp one: it says the column
 *     carries no error of its own — its whole divergence is set membership. A
 *     distance defect would show as a site with an identical admitted set and a
 *     different mean, which is the `set same & col differs` cell below and must
 *     be empty.
 *  4. **Co-admitted residents walk byte-identical distances.** For every
 *     resident that both runs put in the same shelter, `total_travel_distance_m`
 *     is the same *text*. That is the direct measurement that the port's routing
 *     arithmetic is not contributing to the Tier-4 divergence.
 *
 * Plus the numerical envelope: the observed divergence must sit inside the
 * permutation distribution committed in `validation/order-census/`, which is
 * produced by `validation/scripts/order-permutation-census.ts`.
 *
 * Gated on the git-ignored packed graph AND on the archive, both through the
 * shared skip-vs-fail policy: a clean clone SKIPS loudly, a runner with
 * `WEBSIM_REQUIRE_ARTIFACTS=1` fails.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

import { PARAM_NAMES, parseRunConfig, PRESETS, type RunConfig } from "@websim/shared";
import { describeArchive } from "@websim/pipeline/archive";

import { artifactGate, describeGated, type ArtifactRef } from "../../tools/artifact-gate.js";
import { runHeadless, type HeadlessResult } from "../src/headless.js";

const here = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url));

/** The archived Java run this file attributes against. */
const ARCHIVE_RUN = "present-day-three-arm/A-seed42";
const ARCHIVE_DIR = path.join(describeArchive().root, ...ARCHIVE_RUN.split("/"));

const TOPOLOGY: ArtifactRef = {
  source: "graph-asset",
  label: "topology",
  path: here("../../pipeline/out/assets/graph-topology.bin"),
};
const GEOMETRY: ArtifactRef = {
  source: "graph-asset",
  label: "geometry",
  path: here("../../pipeline/out/assets/graph-geometry.bin"),
};
const ARCHIVE_AGENTS: ArtifactRef = {
  source: "archive",
  label: `${ARCHIVE_RUN}/agents.csv`,
  path: path.join(ARCHIVE_DIR, "agents.csv"),
};
const ARCHIVE_SHELTERS: ArtifactRef = {
  source: "archive",
  label: `${ARCHIVE_RUN}/shelters.csv`,
  path: path.join(ARCHIVE_DIR, "shelters.csv"),
};

const gate = artifactGate({
  gate: "validation:tier4-attribution",
  suite: "Tier-4 attribution — the residual divergence IS the ordering channel",
  evidence:
    "A full arm-A run (preset A_present_day, seed 42, n=6,842, 312 h) compared row by row " +
    `against ${ARCHIVE_RUN}: the final_state flips are a balanced SHELTERED swap set with ` +
    "zero non-shelter flips, per-site admitted cardinality is 36/36 exact, " +
    "mean_travel_dist_m_admitted matches a site iff its admitted set is identical, and " +
    "co-admitted residents walk byte-identical distances. Envelope from " +
    "validation/order-census/order-permutation-census.json",
  artifacts: [TOPOLOGY, GEOMETRY, ARCHIVE_AGENTS, ARCHIVE_SHELTERS],
});

// ---------------------------------------------------------------------------

interface Table {
  readonly header: readonly string[];
  readonly index: ReadonlyMap<string, number>;
  readonly rows: ReadonlyMap<string, readonly string[]>;
}

function parseCsv(text: string): Table {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const header = lines[0]!.split(",");
  const index = new Map(header.map((h, i) => [h, i]));
  const rows = new Map<string, readonly string[]>();
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i]!.split(",");
    rows.set(cells[0]!, cells);
  }
  return { header, index, rows };
}

function cell(t: Table, key: string, col: string): string {
  const row = t.rows.get(key);
  const at = t.index.get(col);
  if (row === undefined || at === undefined) {
    throw new Error(`no cell ${key}/${col}`);
  }
  return row[at]!;
}

/** `shelter_id -> set of agent_ids admitted there`, from an `agents.csv`. */
function admittedSets(t: Table): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const key of t.rows.keys()) {
    if (cell(t, key, "final_state") !== "SHELTERED") {
      continue;
    }
    const site = cell(t, key, "shelter_reached");
    let set = out.get(site);
    if (set === undefined) {
      set = new Set();
      out.set(site, set);
    }
    set.add(key);
  }
  return out;
}

function armA(): RunConfig {
  return {
    ...parseRunConfig(PRESETS.A_present_day, "preset A_present_day"),
    numAgents: 6842,
    randomSeed: 42,
    simulationHours: 312,
  };
}

let cached: HeadlessResult | null = null;
function run(): HeadlessResult {
  cached ??= runHeadless({ config: armA(), paramNames: PARAM_NAMES });
  return cached;
}

/**
 * Parsed once each. Memoised deliberately and not as a micro-optimisation: an
 * accessor that re-parsed a 6,842-row CSV per call turns a nested loop into
 * minutes of blocked event loop, which vitest reports as an unhandled
 * `onTaskUpdate` RPC timeout *alongside* passing tests — a green run with an
 * error attached, which is the worst possible signal.
 */
function memo<T>(make: () => T): () => T {
  let value: T | undefined;
  let made = false;
  return () => {
    if (!made) {
      value = make();
      made = true;
    }
    return value as T;
  };
}

const ours = memo((): Table => parseCsv(run().parity.agentsCsv));
const oursShelters = memo((): Table => parseCsv(run().parity.sheltersCsv));
const java = memo((): Table => parseCsv(readFileSync(ARCHIVE_AGENTS.path, "utf8")));
const javaShelters = memo((): Table => parseCsv(readFileSync(ARCHIVE_SHELTERS.path, "utf8")));

interface Envelope {
  readonly final_state_divergence: {
    readonly streams: number;
    readonly min: number;
    readonly max: number;
    readonly observed: number;
  };
}

// ---------------------------------------------------------------------------

describeGated(gate, () => {
  it("compares the same 6,842 keys against the same archive run", () => {
    expect(ours().rows.size).toBe(6842);
    expect(java().rows.size).toBe(6842);
    for (const key of java().rows.keys()) {
      expect(ours().rows.has(key)).toBe(true);
    }
  }, 120_000);

  it("(1) final_state flips are a BALANCED swap set with zero non-shelter flips", () => {
    const a = ours();
    const j = java();
    let lost = 0;
    let gained = 0;
    let other = 0;
    for (const key of j.rows.keys()) {
      const ja = cell(j, key, "final_state");
      const us = cell(a, key, "final_state");
      if (ja === us) continue;
      if (ja === "SHELTERED") lost++;
      else if (us === "SHELTERED") gained++;
      else other++;
    }
    console.log(`[tier4] final_state: ${lost + gained + other} flips = ${lost} lost / ${gained} gained / ${other} other`);
    // Beds are conserved, so an ordering-only divergence is a permutation of
    // who occupies them. A non-zero `other` would be a state the ordering
    // channel cannot reach and is release-blocking.
    expect(other).toBe(0);
    expect(lost).toBe(gained);
    expect(lost).toBeGreaterThan(0);
  }, 120_000);

  it("(2) every site admits exactly as many residents as the archive did", () => {
    const mine = admittedSets(ours());
    const theirs = admittedSets(java());
    const js = javaShelters();
    let sites = 0;
    for (const site of js.rows.keys()) {
      sites++;
      expect((mine.get(site)?.size ?? 0)).toBe(theirs.get(site)?.size ?? 0);
    }
    expect(sites).toBe(36);
  }, 120_000);

  it("(3) mean_travel_dist_m_admitted matches a site IFF its admitted set is identical", () => {
    const mine = admittedSets(ours());
    const theirs = admittedSets(java());
    const os = oursShelters();
    const js = javaShelters();

    let setSameColSame = 0;
    let setSameColDiff = 0;
    let setDiffColSame = 0;
    let setDiffColDiff = 0;
    for (const site of js.rows.keys()) {
      const A = mine.get(site) ?? new Set<string>();
      const B = theirs.get(site) ?? new Set<string>();
      const setSame = A.size === B.size && [...A].every((k) => B.has(k));
      const colSame =
        cell(os, site, "mean_travel_dist_m_admitted") ===
        cell(js, site, "mean_travel_dist_m_admitted");
      if (setSame && colSame) setSameColSame++;
      else if (setSame && !colSame) setSameColDiff++;
      else if (!setSame && colSame) setDiffColSame++;
      else setDiffColDiff++;
    }
    console.log(
      `[tier4] mean_travel 2x2: same/same ${setSameColSame}  same/diff ${setSameColDiff}  ` +
        `diff/same ${setDiffColSame}  diff/diff ${setDiffColDiff}`,
    );
    // A site whose admitted set is identical but whose mean differs would be a
    // per-agent DISTANCE defect wearing the ordering channel's clothes.
    expect(setSameColDiff).toBe(0);
    // The converse cell is the weaker direction (two different sets could mean
    // the same to 2 dp by coincidence) but it is empty here, so it is asserted:
    // if it ever fills, the "iff" in this file's name has become an "if".
    expect(setDiffColSame).toBe(0);
    expect(setSameColSame + setDiffColDiff).toBe(36);
  }, 120_000);

  it("(4) residents admitted to the same shelter in both runs walked identical distances", () => {
    const a = ours();
    const j = java();
    let coAdmitted = 0;
    let textDiffers = 0;
    for (const key of j.rows.keys()) {
      if (cell(j, key, "final_state") !== "SHELTERED") continue;
      if (cell(a, key, "final_state") !== "SHELTERED") continue;
      if (cell(j, key, "shelter_reached") !== cell(a, key, "shelter_reached")) continue;
      coAdmitted++;
      if (cell(j, key, "total_travel_distance_m") !== cell(a, key, "total_travel_distance_m")) {
        textDiffers++;
      }
    }
    console.log(`[tier4] co-admitted ${coAdmitted}, distance text differs on ${textDiffers}`);
    expect(coAdmitted).toBeGreaterThan(1500);
    // Byte identity, not tolerance: these residents took the same route to the
    // same door, so any difference at all is ours.
    expect(textDiffers).toBe(0);
  }, 120_000);

  it("(5) refused_count is self-consistent with the per-agent door counter, in BOTH runs", () => {
    const sumAgents = (t: Table): number => {
      let n = 0;
      for (const key of t.rows.keys()) n += Number(cell(t, key, "door_refusals"));
      return n;
    };
    const sumSites = (t: Table): number => {
      let n = 0;
      for (const key of t.rows.keys()) n += Number(cell(t, key, "refused_count"));
      return n;
    };
    // The identity holding on BOTH sides is what makes `refused_count`'s
    // divergence a redistribution rather than a miscount: each side's door
    // ledger closes against its own agents.
    expect(sumSites(javaShelters())).toBe(sumAgents(java()));
    expect(sumSites(oursShelters())).toBe(sumAgents(ours()));
    console.log(
      `[tier4] door ledger: java ${sumSites(javaShelters())}  ours ${sumSites(oursShelters())}`,
    );
  }, 120_000);

  it("(6) the observed divergence sits inside the committed permutation envelope", () => {
    const env = JSON.parse(
      readFileSync(here("../order-census/order-permutation-census.json"), "utf8"),
    ) as Envelope;
    const e = env.final_state_divergence;
    const a = ours();
    const j = java();
    let flips = 0;
    for (const key of j.rows.keys()) {
      if (cell(j, key, "final_state") !== cell(a, key, "final_state")) flips++;
    }
    expect(flips).toBe(e.observed);
    expect(e.streams).toBeGreaterThanOrEqual(50);
    expect(flips).toBeGreaterThanOrEqual(e.min);
    expect(flips).toBeLessThanOrEqual(e.max);
  }, 120_000);
});
