/**
 * ScrollRegion.tsx — a keyboard-reachable scroll container (WP13 axe
 * remediation, 2026-08-05).
 *
 * ## The defect this closes
 *
 * The first real `axe-core` run over the built app reported
 * `scrollable-region-focusable` at `serious` impact on the Provenance screen:
 * two containers with `overflow: auto` whose contents held nothing focusable.
 * A mouse or trackpad user scrolls those with a wheel; a keyboard-only user
 * cannot reach them at all, so the content past the fold — on Provenance, the
 * governance registry and the whole asset manifest — was simply unreadable
 * without a pointer. That is WCAG 2.1.1 (Keyboard), and it is exactly the class
 * of failure the 26 Node a11y tests could not see, because it is a property of
 * layout and focus rather than of any pure function.
 *
 * Why the screens that scroll but were NOT flagged stay as they are: the rule
 * is satisfied by a scroll container that *contains* focusable content, and the
 * Run rails, the Archive page and the Compare page all hold buttons. Wrapping
 * them too would add tab stops that buy nothing.
 *
 * ## The pattern
 *
 * `role="region"` + `aria-label` + `tabIndex={0}` — the WAI-ARIA Authoring
 * Practices pattern for a scrollable table container. `tabIndex` alone would
 * satisfy the axe rule, but it would put an unnamed generic element in the tab
 * order, which a screen reader announces as nothing at all; the role and label
 * are what make the stop worth landing on. (An `aria-label` on a bare `<div>`
 * would be worse than useless — `aria-label` is prohibited on the generic role,
 * which is the same finding axe raised separately against the Scrubber's clock
 * `<span>`.)
 */

import type { CSSProperties, ReactElement, ReactNode } from "react";

export interface ScrollRegionProps {
  /** Accessible name — what a screen reader announces on landing here. */
  readonly label: string;
  /** For `aria-controls` targets (the chart data-table toggles). */
  readonly id?: string;
  /**
   * When true the region is `hidden`, which also removes the tab stop — a
   * collapsed data table must not be a stop on the way to anything else.
   */
  readonly hidden?: boolean;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly children: ReactNode;
}

export function ScrollRegion({
  label,
  id,
  hidden,
  className,
  style,
  children,
}: ScrollRegionProps): ReactElement {
  return (
    <div
      role="region"
      aria-label={label}
      // The two checkers genuinely disagree here, so the disagreement is
      // resolved once, in this one component, rather than silenced tree-wide.
      //
      // `jsx-a11y/no-noninteractive-tabindex` is a STATIC heuristic: it cannot
      // see `overflow: auto`, so from the JSX alone this looks like a pointless
      // tab stop on a plain div. axe's `scrollable-region-focusable` measures
      // the RENDERED page, saw that these containers really do scroll and hold
      // nothing focusable, and reported them at `serious`. For a WCAG 2.1.1
      // conformance clause the rendered-page measurement is the authority, and
      // `role="region"` + `tabIndex={0}` is the WAI-ARIA Authoring Practices
      // pattern for exactly this case. The rule stays ON everywhere else,
      // including for every other element in this file's callers.
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- axe scrollable-region-focusable (WCAG 2.1.1) requires this tab stop; see above
      tabIndex={0}
      id={id}
      hidden={hidden}
      className={className}
      style={style}
    >
      {children}
    </div>
  );
}
