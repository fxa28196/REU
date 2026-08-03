/**
 * report barrel — `VALIDATION_REPORT.json`, the artifact the badge reads.
 *
 * `schema.ts` owns the document shape and its validator; `emit.ts` builds a
 * document from a replay run and writes it. Nothing here runs the engine or
 * decides a verdict: the split exists so that the file the UI consumes can be
 * validated in a test that never touches the archive.
 */

export * from "./schema.js";
export * from "./emit.js";
