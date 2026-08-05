/**
 * contrast.ts — WCAG 2.2 contrast math and the text-colour tokens derived from
 * it (WP13 axe remediation, 2026-08-05).
 *
 * ## Why this module exists
 *
 * The first real `axe-core` run over the built app (`npm run axe`,
 * `tools/axe-gate.ts`) returned six `color-contrast` violations at `serious`
 * impact, and every one of them was the same mistake made in four places:
 * **Okabe-Ito hexes were used as TEXT colours on the dark surfaces.**
 *
 * Okabe-Ito is a palette for colourblind-safe *data marks* — fills, bars, map
 * symbols, chips read as swatches. It carries no promise about luminance
 * contrast against an arbitrary background, and on this project's two dark
 * surfaces (`--ws-bg` #14161a, `--ws-panel` #1c1f24) three of its entries fall
 * under the 4.5:1 that WCAG 1.4.3 requires for body-size text:
 *
 * | use                                | measured | required |
 * |------------------------------------|----------|----------|
 * | #14161a ink on #0072b2 blue chip   | 3.49:1   | 4.5:1    |
 * | #d55e00 vermillion text on panel   | 4.27:1   | 4.5:1    |
 * | #0072b2 blue text on panel         | 3.19:1   | 4.5:1    |
 *
 * The fix keeps the palette and changes only what is drawn in it:
 *
 *   - **Fills stay Okabe-Ito, untouched.** `BADGE_COLORS`, the occupancy bars,
 *     the map symbols and the diverging shelter bars are unchanged — they are
 *     data marks and the colourblind-safety argument is about them. The badge
 *     hexes are pinned by `app/test/badge-machine.test.ts` and this module does
 *     not move them.
 *   - **Ink on a fill is computed, not assumed** ({@link inkOn}): whichever of
 *     the two inks actually contrasts better with that swatch wins. Dark ink
 *     keeps winning on green/amber/vermillion chips; white takes over on the
 *     blue one, where dark ink measured 3.49:1.
 *   - **Coloured TEXT uses a lightened tint of the same hue**
 *     ({@link WARN_TEXT}, {@link LIVE_TEXT}), documented below with its measured
 *     ratio. Small coloured text is not a data mark and never needed to be a
 *     palette entry.
 *
 * The formulas are WCAG 2.x §relative-luminance and §contrast-ratio verbatim.
 * They are pure and tested in Node (`app/test/a11y.test.ts`), so the ratios
 * quoted above and in the tokens below are asserted rather than asserted-about.
 */

// ---------------------------------------------------------------------------
// WCAG contrast math
// ---------------------------------------------------------------------------

/** Parse `#rgb` / `#rrggbb` into 0-255 channels. Throws on anything else. */
export function parseHex(hex: string): readonly [number, number, number] {
  const body = hex.startsWith("#") ? hex.slice(1) : hex;
  const full =
    body.length === 3
      ? [...body].map((c) => `${c}${c}`).join("")
      : body;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    // A colour that cannot be parsed must not silently become black — a
    // "contrast 21:1" report about a mis-typed hex is exactly the false green
    // this whole remediation exists to prevent.
    throw new Error(`not a hex colour: ${JSON.stringify(hex)}`);
  }
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}

/** WCAG relative luminance of an sRGB colour, in [0, 1]. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  const channel = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two colours, in [1, 21]. Order-independent. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG 1.4.3 Level AA floor for text below the large-text threshold. */
export const AA_NORMAL_TEXT = 4.5;

/** WCAG 1.4.3 Level AA floor for large text (>=18.66px bold, >=24px). */
export const AA_LARGE_TEXT = 3;

// ---------------------------------------------------------------------------
// Ink tokens
// ---------------------------------------------------------------------------

/** The project's dark ink (`--ws-bg`), used on light/saturated swatches. */
export const INK_DARK = "#14161a";

/** Plain white, used where {@link INK_DARK} cannot reach AA on a swatch. */
export const INK_LIGHT = "#ffffff";

/**
 * The readable ink for text drawn ON a coloured fill: whichever of
 * {@link INK_DARK} / {@link INK_LIGHT} contrasts better with it.
 *
 * Measured over the four `BADGE_COLORS` (asserted in `app/test/a11y.test.ts`):
 * `#009e73` 5.29:1 dark, `#e69f00` 8.04:1 dark, `#d55e00` 4.68:1 dark,
 * `#0072b2` 5.19:1 **white** — that last one is the violation axe found on
 * `.app-topbar-badge`, the BadgePanel chip and `.chip-live`.
 */
export function inkOn(fill: string): string {
  return contrastRatio(fill, INK_DARK) >= contrastRatio(fill, INK_LIGHT)
    ? INK_DARK
    : INK_LIGHT;
}

// ---------------------------------------------------------------------------
// Coloured-text tokens (mirrored in theme.css as --ws-warn-text / --ws-live-text)
// ---------------------------------------------------------------------------

/**
 * Warning / failure TEXT: Okabe-Ito vermillion `#d55e00` lightened until it
 * clears AA on the panel surface. 5.01:1 on `--ws-panel` (#1c1f24), 5.49:1 on
 * `--ws-bg` (#14161a); the raw vermillion measured 4.27:1 on the panel.
 *
 * The raw `#d55e00` is unchanged wherever it is a FILL (INVALID badge chip,
 * `OCCUPANCY_FULL_COLOR`, the diverging shelter bars, the INVALID watermark).
 */
export const WARN_TEXT = "#da711f";

/**
 * "Live browser simulation" TEXT: Okabe-Ito blue `#0072b2` lightened the same
 * way. 4.98:1 on `--ws-panel`; the raw blue measured 3.19:1 there.
 *
 * The raw `#0072b2` is unchanged as a fill (`--ws-live` chip, occupancy bars,
 * the positive diverging bars).
 */
export const LIVE_TEXT = "#4095c5";
