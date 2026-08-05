/**
 * Badge state machine (plan §5.4) — pure derivation, no React, no I/O.
 *
 * A badge is earned per configuration; it is never assumed and never
 * inherited. Authority order: ARCHIVE-VALIDATED > ENGINE-CERTIFIED >
 * EXPLORATORY > INVALID, where INVALID is a hard veto that beats every other
 * signal, and unknown evidence (`null`) never upgrades a badge.
 */
import type { BadgeState } from "../index";

/** Evidence the Run screen has gathered about the current configuration. */
export interface BadgeInput {
  /**
   * True iff the running configuration is byte-identical to a shipped preset.
   * Any user edit clears this; badges are never inherited across edits.
   */
  readonly presetUnmodified: boolean;
  /**
   * Live output matched the archived certified run for this preset.
   * `null` = no archive comparison has been made (unknown never upgrades).
   */
  readonly matchesArchive: boolean | null;
  /**
   * The in-browser gate subset ran green for THIS configuration.
   * `null` = the gate subset has not run (unknown never upgrades).
   */
  readonly gateSubsetGreen: boolean | null;
  /**
   * Count of smoke-table lookups that fell outside the loaded data window.
   * Each one fabricated a zero concentration, so any positive count poisons
   * every downstream number.
   */
  readonly outOfRangeLookups: number;
  /**
   * The engine executed parameter values that differ from what the user
   * configured; results then say nothing about the configured claim.
   */
  readonly executedDiffersFromConfigured: boolean;
}

/**
 * Derive the badge for one configuration from the evidence at hand.
 *
 * Rule order (first match wins):
 *  1. out-of-range lookups or an executed≠configured divergence → INVALID
 *     (hard veto — beats archive match and green gates).
 *  2. preset modified → EXPLORATORY (certification never survives an edit).
 *  3. archive match confirmed AND gate subset green → ARCHIVE-VALIDATED.
 *  4. gate subset green (archive unknown or mismatched) → ENGINE-CERTIFIED.
 *  5. anything else → EXPLORATORY (unknown never upgrades).
 */
export function deriveBadge(input: BadgeInput): BadgeState {
  if (input.outOfRangeLookups > 0 || input.executedDiffersFromConfigured) {
    return "INVALID";
  }
  if (!input.presetUnmodified) {
    return "EXPLORATORY";
  }
  if (input.matchesArchive === true && input.gateSubsetGreen === true) {
    return "ARCHIVE-VALIDATED";
  }
  if (input.gateSubsetGreen === true) {
    return "ENGINE-CERTIFIED";
  }
  return "EXPLORATORY";
}

/**
 * One honest sentence saying why the badge is what it is. Wording is pinned by
 * tests; it must state the evidence, not inflate it.
 */
export function badgeExplanation(state: BadgeState, input: BadgeInput): string {
  switch (state) {
    case "INVALID": {
      const causes: string[] = [];
      if (input.outOfRangeLookups > 0) {
        causes.push(
          `${input.outOfRangeLookups} smoke lookup(s) fell outside the loaded data window and fabricated zero concentrations`,
        );
      }
      if (input.executedDiffersFromConfigured) {
        causes.push("the engine executed different parameter values than were configured");
      }
      if (causes.length === 0) {
        // Defensive: an INVALID state with no recorded hard cause is itself
        // untrustworthy evidence, and the sentence must not pretend otherwise.
        return "Invalid because the badge evidence is internally inconsistent, so these results cannot support any claim about this configuration.";
      }
      return `Invalid because ${causes.join(" and ")}, so these results cannot support any claim about this configuration.`;
    }
    case "EXPLORATORY": {
      if (!input.presetUnmodified) {
        return "This configuration modifies a preset, so no archived or certified result applies to it and its numbers are exploratory only.";
      }
      if (input.gateSubsetGreen === false) {
        return "The in-browser gate subset failed for this configuration, so it has not earned certification and its numbers are exploratory only.";
      }
      return "The in-browser gate subset has not run for this configuration, so nothing is certified yet and its numbers are exploratory only.";
    }
    case "ARCHIVE-VALIDATED":
      return "This unmodified preset reproduced the certified archive and the in-browser gate subset ran green for it.";
    case "ENGINE-CERTIFIED": {
      if (input.matchesArchive === false) {
        return "The in-browser gate subset ran green for this unmodified preset, but its output did not match the certified archive.";
      }
      return "The in-browser gate subset ran green for this unmodified preset, but no archive comparison confirms it.";
    }
  }
}
