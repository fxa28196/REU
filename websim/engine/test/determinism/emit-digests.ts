/**
 * Regeneration entry point for `digests.ts` and the geodesic reference fixture.
 *
 *   cd websim && npx tsx engine/test/determinism/emit-digests.ts          # print
 *   cd websim && npx tsx engine/test/determinism/emit-digests.ts --write  # print + write fixture
 *
 * It is NOT a "fix the test" button: a digest that changes without a deliberate corpus edit
 * means an engine plane moved under the port, which is a finding to explain before it is a
 * constant to overwrite (same discipline as the RNG fixtures — DR-S5 §2).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildCorpus,
  digestCorpus,
  gatedSections,
  geodesicDirectTokens,
  sectionText,
  sha256Hex,
  GEODESIC_DIRECT_SUBSECTION,
  GEODESIC_SECTION,
  HOST_MATH_SECTION,
} from "./corpus.js";

const t0 = Date.now();
const corpus = buildCorpus();
const t1 = Date.now();
const digest = await digestCorpus(corpus);
const t2 = Date.now();

const gatedNames = new Set(gatedSections(corpus).map((s) => s.name));

const lines: string[] = ["export const EXPECTED_SECTION_DIGESTS = Object.freeze({"];
for (const section of corpus) {
  if (gatedNames.has(section.name)) {
    lines.push(`  "${section.name}": "${digest.sections[section.name]!}",`);
  }
}
lines.push("});");
lines.push(`export const EXPECTED_JOINT_DIGEST = "${digest.joint}";`);
lines.push(`export const NODE_GEODESIC_DIGEST = "${digest.sections[GEODESIC_SECTION]!}";`);
lines.push(
  `export const EXPECTED_GEODESIC_DIRECT_DIGEST = "${await sha256Hex(
    sectionText({
      name: GEODESIC_DIRECT_SUBSECTION,
      tokens: geodesicDirectTokens(corpus.find((s) => s.name === GEODESIC_SECTION)!),
    }),
  )}";`,
);
lines.push("export const EXPECTED_TOKEN_COUNTS = Object.freeze({");
for (const section of corpus) {
  lines.push(`  "${section.name}": ${digest.tokenCounts[section.name]!},`);
}
lines.push("});");

process.stdout.write(`${lines.join("\n")}\n`);

if (process.argv.includes("--write")) {
  const dir = fileURLToPath(new URL("../fixtures/determinism/", import.meta.url));
  mkdirSync(dir, { recursive: true });
  const geodesic = corpus.find((s) => s.name === GEODESIC_SECTION)!;
  const file = path.join(dir, "geodesic-node-reference.json");
  writeFileSync(
    file,
    `${JSON.stringify(
      {
        note:
          "Node reference values for the geodesic corpus section. Since WP7 task C1 the " +
          "section IS byte-gated across engines (the solver is vendored onto mathx), so " +
          "these tokens must be reproduced exactly by Chromium, Firefox and WebKit. The " +
          "browser suite still reports the per-field magnitudes against them, because a " +
          "magnitude is the diagnostic when the byte gate fails. Regenerate with " +
          "emit-digests.ts --write.",
        engine: `node ${process.version}`,
        section: GEODESIC_SECTION,
        digest: digest.sections[GEODESIC_SECTION]!,
        tokens: geodesic.tokens,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  process.stderr.write(`wrote ${file}\n`);
}

process.stderr.write(
  `corpus built in ${t1 - t0} ms, digested in ${t2 - t1} ms; ` +
    `${corpus.reduce((n, s) => n + s.tokens.length, 0)} tokens over ${corpus.length} sections.\n` +
    `${HOST_MATH_SECTION} (recorded, not gated) = ${digest.sections[HOST_MATH_SECTION]!}\n`,
);
