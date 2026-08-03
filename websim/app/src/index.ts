/**
 * UI plane — placeholder surface for WP0 part 1 (scaffold).
 *
 * WP11–WP13 turn this into the Vite app (React + MapLibre/deck.gl + uPlot). The
 * scaffold only fixes the vocabulary the rest of the plan refers to: screens,
 * badge states and the two provenance classes that must never be conflated.
 */

/** Screens of the app (plan §6.1). */
export const SCREENS = ["run", "compare", "archive", "provenance"] as const;
export type Screen = (typeof SCREENS)[number];

/**
 * Badge state machine (plan §5.4), ordered strongest to weakest. A badge is
 * earned per configuration; it is never assumed and never inherited.
 */
export const BADGE_STATES = [
  "ARCHIVE-VALIDATED",
  "ENGINE-CERTIFIED",
  "EXPLORATORY",
  "INVALID",
] as const;
export type BadgeState = (typeof BADGE_STATES)[number];

/**
 * Provenance class shown next to every number (plan §6.2/§6.4). A live browser
 * number can never be presented in the archived class, or the reverse.
 */
export const PROVENANCE_CLASSES = {
  archived: "Certified Java run",
  live: "Live browser simulation",
} as const;
export type ProvenanceClass = keyof typeof PROVENANCE_CLASSES;

/** Label that must accompany every constructed (non-measured) smoke series. */
export const CONSTRUCTED_SERIES_LABEL = "CONSTRUCTED COUNTERFACTUAL — NOT MEASURED DATA" as const;

/**
 * Data attribution — **the UI is required to render this**.
 *
 * WP11–WP13 must place {@link DATA_ATTRIBUTION_LINE} in the footer of every
 * deployed page, visible without interaction (not behind a menu, a tooltip, an
 * "about" dialog, or a scroll-to-reveal). The two providers below asked to be
 * credited formally, and a credit a visitor never sees is not a credit. The
 * fuller {@link DATA_ATTRIBUTION} record belongs on the provenance screen.
 *
 * Both entries are derived products redistributed with the provider's approval.
 * The strength of that record matters and is fixed here so UI copy cannot
 * inflate it: what exists is the **researcher's report** of each approval,
 * relayed **2026-08-02**. No written determination from either provider is on
 * file in this repository, and no reference number, contact name, approval
 * date, licence name, licence version or licence URL is known — so none may be
 * displayed, linked, or invented. Any phrasing that implies a provider issued a
 * filed determination is therefore banned in UI copy; `app/test` pins a list of
 * such phrasings and fails if one reaches these strings.
 *
 * Repository record: `../../LICENSE` §3 and §4,
 * `../../Geography/data/README.md`, `../../docs/science/DATA_SOURCES.md`
 * (D0, D2b), and `../README.md` §10. This constant must not drift from them.
 *
 * Note the approvals do **not** relax the ethics constraint (README §1 item 8):
 * no public asset carries raw encampment coordinates or raw incident ids.
 */
export const DATA_ATTRIBUTION = [
  {
    layer: "Street centerlines (routing graph)",
    credit: "Regional Land Information System (RLIS), Oregon Metro",
    note:
      "RLIS is an Oregon Metro programme, not a City of Portland one. " +
      "Derived products redistributed with Oregon Metro's approval as " +
      "reported by the researcher (relayed 2026-08-02); no written " +
      "determination is on file in this repository.",
  },
  {
    layer: "Encampment reports (resident spatial distribution)",
    credit:
      "City of Portland — Impact Reduction Program campsite reports, " +
      "obtained via the City of Portland open-data ArcGIS service",
    note:
      "Derived products redistributed with the City of Portland's approval " +
      "as reported by the researcher (relayed 2026-08-02); no written " +
      "determination is on file in this repository.",
  },
] as const;

/**
 * The exact one-line credit for the deployed page footer. Render verbatim; do
 * not shorten it to the provider names alone, because "with the providers'
 * approval" without "as reported by the researcher" is a stronger claim than
 * the record supports.
 */
export const DATA_ATTRIBUTION_LINE: string =
  "Street data: Regional Land Information System (RLIS), Oregon Metro. " +
  "Encampment reports: City of Portland (Impact Reduction Program campsite " +
  "reports, via the City open-data ArcGIS service). Derived products are " +
  "redistributed with the providers' approval, as reported by the researcher " +
  "(relayed 2026-08-02); no written determination is on file.";
