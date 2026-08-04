/**
 * artifact-policy.ts — the ONE skip-vs-fail policy for artifact-gated tests.
 *
 * Plan §5.3 requires the harness to degrade **loudly** when archive/oracle data
 * is absent, and never to skip silently; plan §5.2 (WP9) requires every gate to
 * be provably able to fail. A suite that quietly disappears when a git-ignored
 * dump is missing satisfies neither: nobody reading CI output can tell a green
 * run that proved something from a green run that proved nothing.
 *
 * The policy this module implements, in full:
 *
 *  1. **Every** artifact-gated suite declares, in code, (a) which artifacts it
 *     needs, (b) what evidence is lost if they are absent, and (c) the command
 *     that produces them. There is no way to gate a suite without saying those
 *     three things — the spec type requires them and {@link artifactGate}
 *     rejects a spec that leaves them blank.
 *  2. When the artifacts are present the suite runs, exactly as before.
 *  3. When they are absent and `WEBSIM_REQUIRE_ARTIFACTS` is off, the suite is
 *     SKIPPED (vitest reports it as skipped, never as passed) **and** a loud,
 *     file-attributed banner naming the missing artifact and the forgone
 *     evidence is printed to stderr.
 *  4. When they are absent and `WEBSIM_REQUIRE_ARTIFACTS` is on, the gate is a
 *     HARD FAILURE: a real failing test carrying the same banner. This is the
 *     mode a runner that *has* the artifacts uses, so an artifact that silently
 *     stopped being produced turns CI red instead of turning it quiet.
 *
 * The env var is parsed strictly (see {@link parseRequireArtifacts}): a typo
 * throws rather than being read as "off", because "off" is the permissive
 * setting and a permissive default reached by accident is exactly the failure
 * mode this module exists to remove.
 *
 * This module is deliberately **vitest-free**: importing `vitest` outside a test
 * worker throws (`getWorkerState`), and `tools/test-strict.ts` — a plain CLI —
 * needs the env-var name and the parse. The `describe`/`it` bindings therefore
 * live next door in `artifact-gate.ts`, which re-exports everything here, so
 * test files still import a single module. The decision functions are pure and
 * are unit-tested directly in `tools/test/artifact-gate.test.ts`, alongside an
 * end-to-end proof that a child vitest run really does go red under strict mode.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path of `websim/` — banners render paths relative to it. */
export const WEBSIM_ROOT: string = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

/** The environment variable that turns artifact skips into hard failures. */
export const REQUIRE_ARTIFACTS_ENV = "WEBSIM_REQUIRE_ARTIFACTS";

const TRUTHY = new Set(["1", "true", "yes", "on"]);
const FALSY = new Set(["", "0", "false", "no", "off"]);

/**
 * Parse `WEBSIM_REQUIRE_ARTIFACTS`.
 *
 * Unset means off. `1|true|yes|on` (any case, surrounding space ignored) means
 * on, `0|false|no|off|<empty>` means off, and **anything else throws**. Silently
 * treating `WEBSIM_REQUIRE_ARTIFACTS=ture` as "off" would hand back the silent
 * pass this whole module removes, so a misspelling is an error, not a default.
 */
export function parseRequireArtifacts(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env[REQUIRE_ARTIFACTS_ENV];
  if (raw === undefined) {
    return false;
  }
  const value = raw.trim().toLowerCase();
  if (TRUTHY.has(value)) {
    return true;
  }
  if (FALSY.has(value)) {
    return false;
  }
  throw new Error(
    `${REQUIRE_ARTIFACTS_ENV}=${JSON.stringify(raw)} is not a recognised boolean. ` +
      `Use one of ${[...TRUTHY].join("|")} to require artifacts, or ` +
      `${[...FALSY].filter((v) => v !== "").join("|")} (or leave it unset) to allow loud skips.`,
  );
}

// --- the artifact catalogue --------------------------------------------------

/**
 * A class of artifact, with the one true answer to "how do I get this?".
 *
 * Gates reference a source by key so the produce instructions live in exactly
 * one place; `tools/test/artifact-gate.test.ts` asserts every entry is complete.
 */
export interface ArtifactSource {
  /** Stable slug, printed in banners. */
  readonly id: string;
  /** What this artifact is, in one clause. */
  readonly what: string;
  /** How to produce it, as something a reader can run or follow. */
  readonly produce: string;
  /** `true` when the artifact lives outside `websim/` (read-only inputs). */
  readonly external: boolean;
}

export const ARTIFACT_SOURCES = {
  "graph-asset": {
    id: "graph-asset",
    what: "the packed graph containers (topology/geometry/names) under pipeline/out/assets",
    produce: "npm run build:graph -w @websim/pipeline (after the Java exporter graph dump)",
    external: false,
  },
  "graph-dump": {
    id: "graph-dump",
    what: "the raw 88,100-node exporter graph dump under pipeline/out/graph-dump",
    produce: "pipeline/java-exporter/run-export.ps1 (JDK 17 + the read-only Geography/ tree)",
    external: false,
  },
  "world-fixtures": {
    id: "world-fixtures",
    what: "the DR-F1 world/tree/snap/shelter/closure oracle dumps under pipeline/out/world-fixtures",
    produce: "pipeline/java-exporter/build-and-dump.ps1 then dump-world-fixtures.ps1",
    external: false,
  },
  "decision-fixtures": {
    id: "decision-fixtures",
    what:
      "the WP8 decision-layer trace oracle under pipeline/out/decision-fixtures — 20 instrumented " +
      "Java runs, 3.78 M sampled agent-hours, every float as raw %016x bits",
    produce: "powershell -File websim/pipeline/java-exporter/dump-decision-trace.ps1 (JDK 17 + Repast 2.11.0)",
    external: false,
  },
  "closure-fixtures": {
    id: "closure-fixtures",
    what:
      "the WP8 closure-wave oracle under pipeline/out/closure-fixtures — per-wave blocked edge " +
      "sets, shelter-tree digests, the certified reaction trace and the connectivity comparison",
    produce:
      "powershell -File websim/pipeline/java-exporter/dump-closure-fixtures.ps1 (JDK 17 + Repast 2.11.0)",
    external: false,
  },
  "archive-bundles": {
    id: "archive-bundles",
    what: "the archive bundle digests under pipeline/out/archive-bundles",
    produce:
      "npm run build:archive-bundles -w @websim/pipeline (needs docs/runs/, or WEBSIM_ARCHIVE_ROOT)",
    external: false,
  },
  "built-assets": {
    id: "built-assets",
    what: "the shipped data assets (smoke, shelters, registry, manifest) under pipeline/out/assets",
    produce: "npm run build:data -w @websim/pipeline",
    external: false,
  },
  "local-raw": {
    id: "local-raw",
    what: "the git-ignored local raw encampment feed under pipeline/local-raw",
    produce: "supply the local raw CSV; it never enters git and never ships (plan Q4)",
    external: false,
  },
  "rng-full": {
    id: "rng-full",
    what: "the ~27 MB opt-in full RNG draw dumps under pipeline/out/rng-full",
    produce:
      "java -Dwebsim.rng.full=true -cp <cp> websim.exporter.RngFixtureDumper " +
      "engine/test/fixtures/rng pipeline/out/rng-full",
    external: false,
  },
  archive: {
    id: "archive",
    what: "the read-only 375 MB Java golden archive of per-agent run outputs (docs/runs/)",
    produce:
      "check out the repository with docs/runs/, or point WEBSIM_ARCHIVE_ROOT at a local copy " +
      "(the curated ~40 MB working set is described in websim/validation/working-set/)",
    external: true,
  },
  geography: {
    id: "geography",
    what: "the read-only certified instrument tree Geography/ beside websim/",
    produce: "check out the full repository, not websim/ alone — Geography/ is never copied in",
    external: true,
  },
  "playwright-browsers": {
    id: "playwright-browsers",
    what:
      "the ~400 MB Playwright browser builds (Chromium, Firefox, WebKit) the WP10 acceptance " +
      "matrix and the cross-engine determinism gate run inside",
    produce: "npx playwright install chromium firefox webkit (add --with-deps on Linux)",
    external: true,
  },
  "policy-proof": {
    id: "policy-proof",
    what: "a stand-in artifact used ONLY by this policy's own proof fixture",
    produce:
      "not a real artifact — tools/test/fixtures/artifact-gate-proof.spec.ts drives both the " +
      "present and the deliberately-absent case so the policy is shown able to fail",
    external: false,
  },
} as const satisfies Record<string, ArtifactSource>;

export type ArtifactSourceId = keyof typeof ARTIFACT_SOURCES;

// --- gate specs and decisions ------------------------------------------------

export interface ArtifactRef {
  /** Which catalogue entry produces this path. */
  readonly source: ArtifactSourceId;
  /** Absolute path probed for existence. */
  readonly path: string;
  /** Optional label when one source contributes several distinct files. */
  readonly label?: string;
}

/**
 * The four sentences the banner is built from.
 *
 * They are overridable per gate because not every gate's strictness is decided
 * by `WEBSIM_REQUIRE_ARTIFACTS`. `tools/browser-gate.ts` runs the same policy
 * over Playwright's browser builds with **no permissive mode at all**, and a
 * banner telling that reader to "set WEBSIM_REQUIRE_ARTIFACTS=1 to make this a
 * hard failure" would be naming a variable that changes nothing — the same class
 * of defect as the wrong-`produce:` banner the catalogue exists to prevent.
 */
export interface GatePolicyText {
  /** First line when artifacts are absent and the gate is permissive. */
  readonly degradedHead: string;
  /** First line when artifacts are absent and the gate is strict. */
  readonly strictHead: string;
  /** Closing `policy:` line, permissive. */
  readonly degradedPolicy: string;
  /** Closing `policy:` line, strict. */
  readonly strictPolicy: string;
}

export const DEFAULT_GATE_TEXT: GatePolicyText = {
  degradedHead: "!! ARTIFACT-GATED SUITE SKIPPED — this run is DEGRADED, not fully green.",
  strictHead: `!! ARTIFACT-GATED SUITE CANNOT RUN and ${REQUIRE_ARTIFACTS_ENV} is set — FAILING.`,
  degradedPolicy:
    `set ${REQUIRE_ARTIFACTS_ENV}=1 to make this a hard failure ` +
    "(see websim/README.md, 'Skip-vs-fail policy').",
  strictPolicy:
    `${REQUIRE_ARTIFACTS_ENV} is on, so a missing artifact is a hard failure. ` +
    "Provide the artifact or run without it (see websim/README.md, 'Skip-vs-fail policy').",
};

export interface ArtifactGateSpec {
  /** Stable gate id, `package:suite` — printed in banners and greppable. */
  readonly gate: string;
  /** The `describe()` title used when the gate runs. */
  readonly suite: string;
  /** Concretely, what evidence is lost when this suite does not run. */
  readonly evidence: string;
  /** Every artifact the suite needs. Must be non-empty. */
  readonly artifacts: readonly ArtifactRef[];
  /**
   * Overrides for any of {@link DEFAULT_GATE_TEXT}'s four sentences. Omit for
   * gates whose strictness really is `WEBSIM_REQUIRE_ARTIFACTS`.
   */
  readonly text?: Partial<GatePolicyText>;
}

export interface ProbedArtifact extends ArtifactRef {
  readonly present: boolean;
}

export type GateAction = "run" | "skip-loudly" | "fail";

export interface ArtifactGate {
  readonly spec: ArtifactGateSpec;
  readonly probed: readonly ProbedArtifact[];
  readonly missing: readonly ProbedArtifact[];
  /** `true` when every declared artifact is present. */
  readonly satisfied: boolean;
  /** `true` when `WEBSIM_REQUIRE_ARTIFACTS` is on for this process. */
  readonly strict: boolean;
  readonly action: GateAction;
  /** The loud banner; empty string when the gate is satisfied. */
  readonly report: string;
}

/** Render an absolute path relative to `websim/` when it is inside it. */
export function displayPath(abs: string): string {
  const rel = path.relative(WEBSIM_ROOT, abs);
  if (rel.startsWith("..")) {
    const outer = path.relative(path.dirname(WEBSIM_ROOT), abs);
    return outer.startsWith("..") ? abs : `<repo>/${outer.split(path.sep).join("/")}`;
  }
  return `websim/${rel.split(path.sep).join("/")}`;
}

function assertSpec(spec: ArtifactGateSpec): void {
  const blank = (s: string): boolean => s.trim().length === 0;
  if (blank(spec.gate) || blank(spec.suite) || blank(spec.evidence)) {
    throw new Error(
      `artifact gate ${JSON.stringify(spec.gate)} must declare a non-empty gate id, suite ` +
        "title and evidence sentence — a gate that cannot say what it proves cannot say " +
        "what is lost when it is skipped.",
    );
  }
  if (spec.artifacts.length === 0) {
    throw new Error(
      `artifact gate ${spec.gate} declares no artifacts; use a plain describe() for a ` +
        "suite that needs none.",
    );
  }
  for (const ref of spec.artifacts) {
    if (!Object.prototype.hasOwnProperty.call(ARTIFACT_SOURCES, ref.source)) {
      throw new Error(`artifact gate ${spec.gate} names unknown source ${String(ref.source)}`);
    }
    if (!path.isAbsolute(ref.path)) {
      throw new Error(
        `artifact gate ${spec.gate} declares a relative path ${ref.path}; probes must be ` +
          "absolute so the banner names the file that was actually looked for.",
      );
    }
  }
}

/**
 * The loud banner. Deliberately verbose and prefixed with `!!` on every line so
 * a degraded run cannot be mistaken for a clean one when scrolling CI output.
 */
export function artifactGateReport(
  spec: ArtifactGateSpec,
  probed: readonly ProbedArtifact[],
  strict: boolean,
): string {
  const missing = probed.filter((p) => !p.present);
  const text = { ...DEFAULT_GATE_TEXT, ...spec.text };
  const head = strict ? text.strictHead : text.degradedHead;
  const lines = [
    head,
    `!! gate:     ${spec.gate}`,
    `!! suite:    ${spec.suite}`,
    `!! forgone:  ${spec.evidence}`,
  ];
  for (const m of missing) {
    const src = ARTIFACT_SOURCES[m.source];
    lines.push(`!! MISSING:  [${src.id}${m.label === undefined ? "" : `/${m.label}`}] ${displayPath(m.path)}`);
    lines.push(`!!           ${src.what}`);
    lines.push(`!!           produce: ${src.produce}`);
  }
  for (const p of probed.filter((q) => q.present)) {
    lines.push(`!! present:  [${ARTIFACT_SOURCES[p.source].id}] ${displayPath(p.path)}`);
  }
  for (const line of (strict ? text.strictPolicy : text.degradedPolicy).split("\n")) {
    lines.push(`!! policy:   ${line}`);
  }
  return lines.join("\n");
}

/**
 * Probe a spec's artifacts and decide what the harness should do.
 *
 * `strictOverride` exists for gates whose strictness is not
 * `WEBSIM_REQUIRE_ARTIFACTS` — see {@link GatePolicyText}. Pass `true` for a
 * gate that has no permissive mode. Leave it undefined and the env var decides,
 * which is what every in-suite gate does.
 */
export function artifactGate(
  spec: ArtifactGateSpec,
  env: NodeJS.ProcessEnv = process.env,
  probe: (p: string) => boolean = existsSync,
  strictOverride?: boolean,
): ArtifactGate {
  assertSpec(spec);
  const strict = strictOverride ?? parseRequireArtifacts(env);
  const probed: ProbedArtifact[] = spec.artifacts.map((ref) => ({
    ...ref,
    present: probe(ref.path),
  }));
  const missing = probed.filter((p) => !p.present);
  const satisfied = missing.length === 0;
  const action: GateAction = satisfied ? "run" : strict ? "fail" : "skip-loudly";
  return {
    spec,
    probed,
    missing,
    satisfied,
    strict,
    action,
    report: satisfied ? "" : artifactGateReport(spec, probed, strict),
  };
}

