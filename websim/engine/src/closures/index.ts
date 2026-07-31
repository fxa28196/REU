/**
 * `engine/src/closures` — WP6 ships **schedule parsing and its fail-fasts only**.
 *
 * `ClosureWave.apply()` (block edges, bump the version, recompute every shelter
 * tree in shelter-CSV load order) and `reactToClosureWave` (push-vs-reroute,
 * grandfathering) are run-time behaviour and belong to WP8. What is here is the
 * part that runs at build: turning a CSV into an ordered wave map, throwing
 * where Java throws, and counting the phantom pairs.
 */

export {
  parseClosureSchedule,
  ClosureScheduleError,
  type ClosureSchedule,
  type ClosureWave,
  type ScheduledClosure,
  type ParseClosureScheduleOptions,
} from "./schedule.js";
