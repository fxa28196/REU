/**
 * ESLint flat config for the websim workspace (WP14).
 *
 * Before this file existed there was NO lint config and NO lint script anywhere
 * in websim/ — yet the tree carried `// eslint-disable-next-line no-console`
 * comments, which were therefore inert: the codebase believed it was linted and
 * was not. This config makes those comments meaningful again:
 *
 *   - typescript-eslint recommended (syntax-level, not type-aware — the type
 *     plane is `npm run typecheck`, which runs the real compiler per package);
 *   - react-hooks/rules-of-hooks + exhaustive-deps as ERRORS (app UI);
 *   - jsx-a11y recommended on the app's TSX (WP13 is a first-class program);
 *   - no-console as an ERROR everywhere, so console output is a deliberate,
 *     per-line-justified act (the measurement suites' "the census IS the
 *     evidence" disables) rather than ambient noise.
 *
 * Run: `npm run lint` from websim/. Wired into `npm run ci` before the tests.
 */
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      // Generated / staged outputs — not source.
      "pipeline/out/**",
      "pipeline/local-raw/**",
      "app/public/**",
      "app/dist/**",
      // Vendored third-party numerical source (DR-C1: it carries its own
      // `@ts-nocheck` + blanket `eslint-disable`; neither the compiler nor the
      // linter looks at it — its guard is `engine/test/geo/vendor.provenance.test.ts`,
      // which pins the vendoring transform byte-for-byte).
      "engine/src/geo/vendor/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // The lint plane is syntax-level; `no-undef` on TS files is the compiler's
    // job and tseslint already disables it there. For the few plain-JS files
    // (this config, the pipeline .mjs CLIs) declare the Node globals.
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    rules: {
      // ERROR so every console line is a deliberate, justified act — this is
      // what re-arms the existing `eslint-disable-next-line no-console -- the
      // census IS the evidence` comments across the measurement suites.
      "no-console": "error",
      // The tree's standing convention for deliberately-discarded bindings is
      // a `_` prefix (`_omit`, `_dropped`, `_shelter` …), usually a
      // destructuring rest-sibling omission. tsc's own noUnusedLocals already
      // accepts the pattern; the lint rule is told the same convention.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          varsIgnorePattern: "^_",
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    // React hooks rules on the REACT plane only (app UI). Not tree-wide,
    // because the plugin keys on the `use` name prefix alone: the engine's
    // `useL1` flag in `agents/step.ts` is a fail-fast switch in certified
    // simulation code, not a hook, and `engine/src/**` may not be edited to
    // appease a linter (WP12-14 finish; the engine is a frozen plane here).
    files: ["app/src/**/*.ts", "app/src/**/*.tsx"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
  {
    files: ["app/src/**/*.tsx"],
    plugins: { "jsx-a11y": jsxA11y },
    rules: { ...jsxA11y.flatConfigs.recommended.rules },
  },

  // -------------------------------------------------------------------------
  // Narrowly-scoped exemptions. Every block below exists because the flagged
  // files are OUTSIDE what WP14 may edit (engine/src, pipeline, validation are
  // frozen planes) or because the finding is a measured false positive. Each
  // names its findings so a future widening is visible in review.
  // -------------------------------------------------------------------------
  {
    // fdlibm ports mirror the C sources: constants are spelled with the
    // sources' full digit strings (no-loss-of-precision fires although each
    // literal parses to exactly the intended double, bit-for-bit — proved by
    // `engine/test/mathx/*.parity.test.ts`), and locals keep the sources'
    // mutable spelling (prefer-const). The stale `naming-convention` disable
    // directives in these files reference a rule this config does not enable;
    // they cannot be removed here, so the unused-directive report is silenced
    // for exactly these files.
    files: ["engine/src/mathx/**"],
    linterOptions: { reportUnusedDisableDirectives: "off" },
    rules: {
      "no-loss-of-precision": "off",
      "prefer-const": "off",
    },
  },
  {
    // Determinism corpus / synthetic Java-dump helper: excess-digit literals
    // are deliberate adversarial inputs (the corpus exists to pin how such
    // literals parse), not mistakes.
    files: ["engine/test/determinism/corpus.ts", "pipeline/test/helpers/synthetic-dump.ts"],
    rules: { "no-loss-of-precision": "off" },
  },
  {
    // CLI entry points: their console output IS the deliverable (measurement
    // tables, gate verdicts, replay censuses). `tools/artifact-gate.ts` prints
    // the skip-vs-fail `!!` banner via console.warn ON PURPOSE — its module
    // doc explains vitest attributes console stderr to the test file, which
    // is the attribution the policy needs.
    files: [
      "validation/scripts/**",
      "validation/spikes/**",
      "pipeline/scripts/**",
      "tools/artifact-gate.ts",
    ],
    rules: { "no-console": "off" },
  },
  {
    // Measurement suites whose console lines are the recorded evidence
    // ("the census IS the evidence") but which predate this linter and carry
    // no per-line disables. They sit in frozen planes (engine/test,
    // validation/test), so the exemption is per-FILE here instead; sibling
    // suites that do carry per-line disables stay fully linted.
    files: [
      "engine/test/decision/oracle.trace.test.ts",
      "engine/test/decision/decision.units.test.ts",
      "validation/test/tier4-attribution.test.ts",
      "validation/test/wp7-vertical-slice.test.ts",
      "validation/test/wp9-replay-acceptance.test.ts",
    ],
    rules: { "no-console": "off" },
  },
  {
    // One vestigial local (`brInteriorLossy`) in a frozen measurement CLI;
    // the file cannot be edited in WP14, and turning the rule off for this
    // single file beats losing it tree-wide.
    files: ["pipeline/scripts/measure-graph-wire.mjs"],
    rules: { "@typescript-eslint/no-unused-vars": "off" },
  },
);
