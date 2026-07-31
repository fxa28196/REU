/**
 * files.ts — file identity for archive provenance.
 *
 * Every number a golden summary or archive bundle publishes must be traceable to
 * the archive bytes it came from (task F5 acceptance: "provenance — source dir +
 * file SHA — per number"). These helpers produce that record.
 */

import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

export interface FileIdentity {
  /** Name relative to the run directory, e.g. `agents.csv`. */
  readonly file: string;
  readonly bytes: number;
  readonly sha256: string;
}

export function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** SHA-256 and byte length of a file, hashed over its raw bytes. */
export function identify(dir: string, file: string): FileIdentity {
  const full = path.join(dir, file);
  const bytes = readFileSync(full);
  return { file, bytes: statSync(full).size, sha256: sha256Hex(bytes) };
}

/**
 * Read a file as UTF-8 text and its identity in one pass, so a bundle can never
 * quote a SHA for bytes other than the ones it digested.
 */
export function readWithIdentity(dir: string, file: string): { text: string; id: FileIdentity } {
  const full = path.join(dir, file);
  const buf = readFileSync(full);
  return {
    text: buf.toString("utf8"),
    id: { file, bytes: buf.byteLength, sha256: sha256Hex(buf) },
  };
}
