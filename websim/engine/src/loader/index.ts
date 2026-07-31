/**
 * `engine/src/loader` — the verbatim `CsvLoader` port (PORT_MAP §4.2).
 *
 * Every CSV the model reads at runtime (shelters, closures, encampments, and
 * the AQS series when the raw reducer is enabled) goes through this and nothing
 * else. Its non-RFC-4180 quirks — trim-everything, short-row padding, extra-field
 * dropping, blank-capacity-means-unlimited downstream, unterminated-quote
 * salvage — are the behaviour the archived Java results were produced through.
 */

export * from "./csv.js";
