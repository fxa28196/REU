/**
 * `pipeline/src/csv-loader.ts` — re-export of the canonical `CsvLoader` port.
 *
 * The implementation moved to `engine/src/loader/csv.ts` in WP5 (plan §3.2
 * places `loader/csv.ts` in the engine, and the engine needs the same parser at
 * runtime for the verbatim-shipped shelter/closure/encampment CSVs). This file
 * stays so that every existing pipeline import — `build-shelters`,
 * `build-smoke`, `registry`, `smoke-field` — and the pipeline's own
 * `csv-loader.test.ts` keep working unchanged, and now exercise the engine copy.
 *
 * There is exactly one implementation on purpose: a second copy of a
 * byte-faithful parser is the drift risk this project exists to avoid.
 */

export {
  CsvStrictError,
  decodeCsvBytes,
  javaDoubleThrows,
  javaParseDouble,
  javaTrim,
  readCsvText,
  readLines,
  readStrictCsvText,
  splitCsv,
  type CsvRow,
} from "@websim/engine/loader";
