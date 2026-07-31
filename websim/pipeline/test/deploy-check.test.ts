/**
 * The publication gate (WP4 (d), plan §4).
 *
 * A gate that has never been seen to fail is not evidence of anything, so the
 * centrepiece here is a **seeded positive fixture**: an asset directory
 * deliberately poisoned with each leak shape, which the checker must catch. The
 * clean-directory case is asserted alongside it so "catches everything" and
 * "flags nothing real" are both demonstrated rather than assumed.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import { artifactGate, describeGated, itGated } from "../../tools/artifact-gate.js";
import {
  DEFAULT_ASSET_DIR,
  DEFAULT_RAW_CSV,
  DEFAULT_SALT_FILE,
  FALLBACK_RAW_CSV,
  PUBLISHED_MIN_CELL_COUNT,
  buildRawReference,
  densityCellsIn,
  resolveSalt,
  runDeployCheck,
  scanAsset,
  scanDisplayGrid,
  scanSalt,
} from "../scripts/deploy-check.js";

const TMP = join(import.meta.dirname, "..", "out", "test-tmp", "deploy-check");
const WEBSIM_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEPLOY_CHECK_SCRIPT = join("pipeline", "scripts", "deploy-check.ts");

/** A stand-in salt with the real one's shape: 32 bytes of hex. */
const SALT = "9f1c7a20b4e6d83512aa07cf63b9d4e1806f2c5a9d3b7e40f1a62c8d05e73b19";

/** A stand-in feed with the real one's shape: 6 dp coordinates, `NN-NNNNNN` ids. */
const RAW_CSV =
  '"lon","lat","inc_date","inc_id","is_vehicle"\r\n' +
  '"-122.692724","45.536235","2026-07-23","26-150147","No"\r\n' +
  '"-122.569351","45.491046","2026-07-23","26-150146","Yes"\r\n';

function writeRaw(): string {
  mkdirSync(TMP, { recursive: true });
  const p = join(TMP, "raw.csv");
  writeFileSync(p, RAW_CSV);
  return p;
}

afterAll(() => rmSync(TMP, { recursive: true, force: true }));

describe("deploy-check detectors", () => {
  const reference = buildRawReference(RAW_CSV);

  it("catches a raw coordinate hidden as float64 bits, either endianness", () => {
    const buf = new Uint8Array(64);
    const view = new DataView(buf.buffer);
    view.setFloat64(8, -122.692724, true);
    view.setFloat64(40, 45.491046, false);
    const findings = scanAsset("poisoned.bin", buf, reference);
    const bits = findings.filter((f) => f.kind === "raw-coordinate-bits");
    expect(bits.length).toBeGreaterThanOrEqual(2);
    expect(bits.every((f) => f.blocking)).toBe(true);
  });

  it("catches a fully located report — both components of one row as text", () => {
    const bytes = new TextEncoder().encode('{"lon":-122.692724,"lat":45.536235}');
    const findings = scanAsset("poisoned.json", bytes, reference);
    const pair = findings.filter((f) => f.kind === "raw-coordinate-pair");
    expect(pair).toHaveLength(1);
    expect(pair[0]!.blocking).toBe(true);
    expect(pair[0]!.detail).toMatch(/raw report row 0 fully located/u);
  });

  it("catches a raw inc_id and anything with its shape", () => {
    const bytes = new TextEncoder().encode("agent starting_encampment=26-150147 other=99-000001");
    const findings = scanAsset("poisoned.csv", bytes, reference);
    expect(findings.filter((f) => f.kind === "raw-inc-id")).toHaveLength(1);
    expect(findings.filter((f) => f.kind === "inc-id-shape")).toHaveLength(1);
    expect(findings.every((f) => f.blocking)).toBe(true);
  });

  it("still catches a leak that survived a rounding to 7 dp", () => {
    const bytes = new TextEncoder().encode("-122.6927240,45.5362350");
    const pair = scanAsset("rounded.json", bytes, reference).filter((f) => f.kind === "raw-coordinate-pair");
    expect(pair).toHaveLength(1);
  });

  it("treats a lone component in third-party text as advisory, not a failure", () => {
    // a named shelter whose longitude happens to equal a raw one at 6 dp
    const bytes = new TextEncoder().encode("Jeans_Place,18 NE 11th Ave,-122.692724,45.523278\n");
    const findings = scanAsset("data/shelters/x.csv", bytes, reference);
    expect(findings.map((f) => f.kind)).toEqual(["raw-coordinate-component"]);
    expect(findings[0]!.blocking).toBe(false);
  });

  it("treats the same lone component inside one of our own binaries as blocking", () => {
    const bytes = new TextEncoder().encode("...-122.692724...");
    const findings = scanAsset("graph-topology.bin", bytes, reference);
    expect(findings[0]!.kind).toBe("raw-coordinate-component");
    expect(findings[0]!.blocking).toBe(true);
  });

  it("ignores decimals that are too coarse to locate anything", () => {
    expect(scanAsset("coarse.json", new TextEncoder().encode("-122.69,45.53"), reference)).toHaveLength(0);
  });
});

describe("deploy-check k-anonymity detector", () => {
  const k = PUBLISHED_MIN_CELL_COUNT;

  it("blocks a display grid that ships a cell below k", () => {
    const bytes = new TextEncoder().encode(
      JSON.stringify({ cells: [{ i: 1, j: 2, level: 0, count: k }, { i: 3, j: 4, level: 0, count: 1 }] }),
    );
    const findings = scanDisplayGrid("encampments-display.json", bytes);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.kind).toBe("display-cell-below-k");
    expect(findings[0]!.blocking).toBe(true);
    expect(findings[0]!.detail).toMatch(/\$\.cells\[1\] has count 1/u);
  });

  it("passes a grid whose every cell reaches k", () => {
    const bytes = new TextEncoder().encode(
      JSON.stringify({ cells: [{ i: 1, j: 2, level: 0, count: k }, { i: 3, j: 4, level: 3, count: k + 40 }] }),
    );
    expect(scanDisplayGrid("encampments-display.json", bytes)).toEqual([]);
  });

  it("finds counted cells nested, keyed, or under a renamed array", () => {
    // the gate must not be escapable by moving the layer somewhere else
    expect(densityCellsIn({ layers: { density: { cells: [{ count: 2 }] } } })).toEqual([
      { path: "$.layers.density.cells[0]", count: 2 },
    ]);
    expect(densityCellsIn({ cells: { "29568/100342": { count: 1 } } })).toEqual([
      { path: "$.cells.29568/100342", count: 1 },
    ]);
    // renaming `cells` does not help while the entries still look like cells
    expect(densityCellsIn({ bins: [{ i: 1, j: 2, count: 1 }] })).toEqual([{ path: "$.bins[0]", count: 1 }]);
    expect(densityCellsIn({ bins: [{ x: 1, y: 2, count: 1 }] })).toEqual([{ path: "$.bins[0]", count: 1 }]);
    // and a plain counter that is not a cell is not a finding
    expect(densityCellsIn({ summary: { count: 1 } })).toEqual([]);
    const nested = new TextEncoder().encode(JSON.stringify({ a: { b: { cells: [{ count: 4 }] } } }));
    expect(scanDisplayGrid("something-else.json", nested)).toHaveLength(1);
  });

  it("refuses to pass a density asset it cannot read", () => {
    const broken = scanDisplayGrid("encampments-display.json", new TextEncoder().encode("{not json"));
    expect(broken.map((f) => f.kind)).toEqual(["display-grid-unreadable"]);
    expect(broken[0]!.blocking).toBe(true);
    const empty = scanDisplayGrid("encampments-display.json", new TextEncoder().encode('{"total":3400}'));
    expect(empty.map((f) => f.kind)).toEqual(["display-grid-unreadable"]);
    // a non-density JSON with no cells is somebody else's asset, not a finding
    expect(scanDisplayGrid("shelter-index.json", new TextEncoder().encode('{"total":3400}'))).toEqual([]);
  });

  it("does not treat a non-JSON asset as a grid", () => {
    expect(scanDisplayGrid("graph-topology.bin", new Uint8Array(64))).toEqual([]);
  });
});

describe("deploy-check salt detector", () => {
  it("blocks the salt as hex text, as raw bytes and as base64", () => {
    const raw = Buffer.from(SALT, "hex");
    const hexHit = scanSalt("leak.json", new TextEncoder().encode(`{"salt":"${SALT}"}`), SALT);
    expect(hexHit.some((f) => f.kind === "salt-material" && f.blocking)).toBe(true);

    const byteHit = scanSalt("leak.bin", new Uint8Array(Buffer.concat([Buffer.alloc(16), raw])), SALT);
    expect(byteHit.some((f) => f.detail.includes("verbatim"))).toBe(true);
    expect(byteHit[byteHit.length - 1]!.offset).toBeGreaterThanOrEqual(0);

    const b64Hit = scanSalt("leak.txt", new TextEncoder().encode(`salt=${raw.toString("base64")}`), SALT);
    expect(b64Hit.some((f) => f.detail.includes("base64"))).toBe(true);
  });

  it("blocks a partially leaked salt — 16 hex of it is still salt material", () => {
    const chopped = SALT.slice(24, 44);
    const findings = scanSalt("leak.json", new TextEncoder().encode(`{"seed":"${chopped}"}`), SALT);
    expect(findings.map((f) => f.kind)).toContain("salt-material");
  });

  it("is case-insensitive about the hex", () => {
    const findings = scanSalt("leak.json", new TextEncoder().encode(SALT.toUpperCase()), SALT);
    expect(findings.map((f) => f.kind)).toContain("salt-material");
  });

  it("does not fire on the shipped pseudonyms, which are derived from the salt", () => {
    // 12-hex salted hashes are what the public asset legitimately carries
    const hashes = ["a1b2c3d4e5f6", "0f1e2d3c4b5a", "deadbeef0000"].join("");
    expect(scanSalt("encampments-public.bin", new TextEncoder().encode(hashes), SALT)).toEqual([]);
  });

  it("refuses a salt too short to be one", () => {
    expect(() => scanSalt("x.json", new Uint8Array(0), "abc")).toThrow(/at least 16 bytes/u);
  });
});

describe("deploy-check salt resolution", () => {
  it("prefers --salt, then the environment, then the withheld salt file", () => {
    mkdirSync(TMP, { recursive: true });
    const file = join(TMP, "salt.txt");
    writeFileSync(file, `${SALT}\n`);
    expect(resolveSalt(["--salt", "aa".repeat(32)], {}, file).salt).toBe("aa".repeat(32));
    expect(resolveSalt([], { ENCAMPMENT_SALT: "bb".repeat(32) }, file).salt).toBe("bb".repeat(32));
    expect(resolveSalt([], {}, file).salt).toBe(SALT);
    expect(resolveSalt([], {}, join(TMP, "absent.txt")).salt).toBeNull();
  });

  it("points at the path build-encampments writes the withheld salt to", () => {
    expect(DEFAULT_SALT_FILE.split(/[\\/]/u).slice(-2)).toEqual(["local-raw", "encampment-salt.txt"]);
  });
});

describe("deploy-check on a seeded asset directory", () => {
  it("fails a directory that contains a poisoned asset, and names it", () => {
    const raw = writeRaw();
    const assets = join(TMP, "poisoned-assets");
    rmSync(assets, { recursive: true, force: true });
    mkdirSync(assets, { recursive: true });
    writeFileSync(join(assets, "clean.json"), '{"nodes":88100,"edges":109434}\n');
    const poisoned = new Uint8Array(80);
    new DataView(poisoned.buffer).setFloat64(16, -122.569351, true);
    writeFileSync(join(assets, "leak-bits.bin"), poisoned);
    writeFileSync(join(assets, "leak-text.json"), '[{"lon":-122.692724,"lat":45.536235,"id":"26-150147"}]\n');
    // the two disclosure shapes this fix added, seeded into the same directory
    writeFileSync(
      join(assets, "encampments-display.json"),
      `${JSON.stringify({ cells: [{ i: 29568, j: 100342, level: 0, count: 1 }] })}\n`,
    );
    writeFileSync(join(assets, "leak-salt.json"), `{"salt":"${SALT}"}\n`);

    const result = runDeployCheck(assets, raw, { salt: SALT });
    expect(result.saltChecked).toBe(true);
    expect(result.blocking.length).toBeGreaterThan(0);
    const kinds = new Set(result.blocking.map((f) => f.kind));
    expect(kinds.has("raw-coordinate-bits")).toBe(true);
    expect(kinds.has("raw-coordinate-pair")).toBe(true);
    expect(kinds.has("raw-inc-id")).toBe(true);
    expect(kinds.has("display-cell-below-k")).toBe(true);
    expect(kinds.has("salt-material")).toBe(true);
    expect(new Set(result.blocking.map((f) => f.asset))).toEqual(
      new Set(["leak-bits.bin", "leak-text.json", "encampments-display.json", "leak-salt.json"]),
    );
    expect(result.findings.some((f) => f.asset === "clean.json")).toBe(false);
  });

  it("passes a directory built the sanctioned way", () => {
    const raw = writeRaw();
    const assets = join(TMP, "clean-assets");
    rmSync(assets, { recursive: true, force: true });
    mkdirSync(join(assets, "nested"), { recursive: true });
    writeFileSync(join(assets, "graph-topology.bin"), new Uint8Array(4096));
    writeFileSync(
      join(assets, "nested", "encampments-display.json"),
      `${JSON.stringify({ cells: [{ i: 29568, j: 100342, level: 0, count: PUBLISHED_MIN_CELL_COUNT }] })}\n`,
    );
    const result = runDeployCheck(assets, raw, { salt: SALT });
    expect(result.blocking).toHaveLength(0);
    expect(result.advisory).toHaveLength(0);
    expect(result.assetsScanned).toHaveLength(2);
    expect(result.saltChecked).toBe(true);
  });

  it("records that the salt went UNCHECKED when none is supplied", () => {
    const raw = writeRaw();
    const assets = join(TMP, "clean-assets");
    expect(runDeployCheck(assets, raw).saltChecked).toBe(false);
  });
});

describe("deploy-check CLI", () => {
  /**
   * These fixtures live outside `pipeline/out` on purpose. The CLI cases spawn a
   * second process while holding paths open, and `pipeline/out` is exactly the
   * tree a clean-clone rehearsal renames out from under a running test — a gate
   * test that fails for that reason teaches nothing about the gate.
   */
  const CLI_TMP = join(tmpdir(), "websim-deploy-check-cli");
  const seedRaw = (): string => {
    mkdirSync(CLI_TMP, { recursive: true });
    const p = join(CLI_TMP, "raw.csv");
    writeFileSync(p, RAW_CSV);
    return p;
  };
  const seedAssets = (name: string): string => {
    const dir = join(CLI_TMP, name);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    return dir;
  };
  afterAll(() => rmSync(CLI_TMP, { recursive: true, force: true }));

  const run = (args: readonly string[]): { status: number; out: string } => {
    try {
      const out = execFileSync(process.execPath, ["--import", "tsx", DEPLOY_CHECK_SCRIPT, ...args], {
        cwd: WEBSIM_ROOT,
        encoding: "utf8",
        env: { ...process.env, ENCAMPMENT_SALT: "" },
        stdio: ["ignore", "pipe", "pipe"],
      });
      return { status: 0, out };
    } catch (error) {
      const e = error as { status?: number; stdout?: string; stderr?: string };
      return { status: e.status ?? -1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
    }
  };

  it("refuses to pass when it has no salt to prove absence against", () => {
    const raw = seedRaw();
    const assets = seedAssets("cli-clean");
    writeFileSync(join(assets, "graph-topology.bin"), new Uint8Array(64));
    const result = run(["--assets", assets, "--raw", raw, "--salt-file", join(CLI_TMP, "absent-salt.txt")]);
    expect(result.status).toBe(2);
    expect(result.out).toMatch(/cannot be proved without the salt/u);
  }, 120_000);

  it("exits non-zero on a below-k cell and on a leaked salt, and zero on a clean build", () => {
    const raw = seedRaw();
    const assets = seedAssets("cli-seeded");
    const cells = (count: number): string =>
      `${JSON.stringify({ cells: [{ i: 29568, j: 100342, level: 0, count }] })}\n`;

    writeFileSync(join(assets, "encampments-display.json"), cells(1));
    const small = run(["--assets", assets, "--raw", raw, "--salt", SALT]);
    expect(small.status).toBe(1);
    expect(small.out).toMatch(/display-cell-below-k/u);

    writeFileSync(join(assets, "encampments-display.json"), cells(PUBLISHED_MIN_CELL_COUNT));
    writeFileSync(join(assets, "notes.json"), `{"salt":"${SALT}"}\n`);
    const leaked = run(["--assets", assets, "--raw", raw, "--salt", SALT]);
    expect(leaked.status).toBe(1);
    expect(leaked.out).toMatch(/salt-material/u);

    rmSync(join(assets, "notes.json"));
    const clean = run(["--assets", assets, "--raw", raw, "--salt", SALT]);
    expect(clean.status).toBe(0);
    expect(clean.out).toMatch(/PASS/u);
  }, 180_000);
});

const REAL_RAW = existsSync(DEFAULT_RAW_CSV) ? DEFAULT_RAW_CSV : existsSync(FALLBACK_RAW_CSV) ? FALLBACK_RAW_CSV : null;

/**
 * The withheld salt of the last real build. Present only while the salt is
 * withheld; once it is destroyed the real-asset tier can no longer prove salt
 * absence, and says so by reporting `saltChecked: false` rather than by
 * pretending it checked.
 */
const REAL_SALT = existsSync(DEFAULT_SALT_FILE) ? readFileSync(DEFAULT_SALT_FILE, "utf8").trim() : null;

/** The salt file, as an artifact ref, so both salt-gated cases name it once. */
const SALT_ARTIFACT = {
  source: "local-raw" as const,
  label: "encampment-salt.txt",
  path: DEFAULT_SALT_FILE,
};

describeGated(
  artifactGate({
    gate: "pipeline:deploy-check-real-assets",
    suite: "deploy-check on the real built assets",
    evidence:
      "the publication gate run over the assets that would actually ship — zero raw coordinates, " +
      "zero raw inc_ids, zero salt material and zero below-k display cells across every public asset",
    artifacts: [
      {
        source: "local-raw",
        label: "raw encampment CSV",
        // The gate names the path it would have used; the suite itself falls
        // back between the two locations exactly as the builder does.
        path: REAL_RAW ?? DEFAULT_RAW_CSV,
      },
      {
        source: "built-assets",
        label: "encampments-public.bin",
        path: join(DEFAULT_ASSET_DIR, "encampments-public.bin"),
      },
    ],
  }),
  () => {
  it(
    "finds zero raw coordinates, zero raw inc_ids, zero salt material and zero below-k cells",
    () => {
      const result = runDeployCheck(DEFAULT_ASSET_DIR, REAL_RAW!, { salt: REAL_SALT });
      expect(result.rawRows).toBe(3400);
      expect(result.assetsScanned.length).toBeGreaterThan(0);
      expect(result.blocking).toEqual([]);
      // the assets this work package built must be clean of *any* finding
      const mine = ["encampments-public.bin", "encampments-display.json", "graph-topology.bin"];
      for (const name of mine) {
        expect(result.assetsScanned.some((a) => a.name === name)).toBe(true);
        expect(result.findings.filter((f) => f.asset === name)).toEqual([]);
      }
    },
    180_000,
  );

  itGated(
    artifactGate({
      gate: "pipeline:deploy-check-display-k",
      suite: "deploy-check on the real built assets",
      evidence:
        "the cell-by-cell proof that the shipped display layer satisfies its k-anonymity floor",
      artifacts: [SALT_ARTIFACT],
    }),
    "proves the shipped display layer satisfies k, cell by cell",
    () => {
    const bytes = new Uint8Array(readFileSync(join(DEFAULT_ASSET_DIR, "encampments-display.json")));
    expect(scanDisplayGrid("encampments-display.json", bytes)).toEqual([]);
    const grid = JSON.parse(Buffer.from(bytes).toString("utf8")) as {
      cells: { count: number; level: number }[];
      k: number;
      published: number;
      suppressed: number;
      total: number;
      minPublishedCount: number;
    };
    expect(grid.k).toBe(PUBLISHED_MIN_CELL_COUNT);
    expect(grid.cells.length).toBeGreaterThan(0);
    expect(Math.min(...grid.cells.map((c) => c.count))).toBeGreaterThanOrEqual(PUBLISHED_MIN_CELL_COUNT);
    expect(grid.minPublishedCount).toBe(Math.min(...grid.cells.map((c) => c.count)));
    expect(grid.published + grid.suppressed).toBe(grid.total);
    // every cell declares the level its index is relative to
    expect(grid.cells.every((c) => Number.isInteger(c.level))).toBe(true);
    },
  );

  itGated(
    artifactGate({
      gate: "pipeline:deploy-check-salt-absence",
      suite: "deploy-check on the real built assets",
      evidence:
        "the proof that the withheld build salt appears in none of the shipped assets — without " +
        "the salt file the checker reports saltChecked: false rather than pretending it checked",
      artifacts: [SALT_ARTIFACT],
    }),
    "finds the build's own salt in none of the shipped assets",
    () => {
      const result = runDeployCheck(DEFAULT_ASSET_DIR, REAL_RAW!, { salt: REAL_SALT });
      expect(result.saltChecked).toBe(true);
      expect(result.findings.filter((f) => f.kind === "salt-material")).toEqual([]);
    },
    180_000,
  );
  },
);
