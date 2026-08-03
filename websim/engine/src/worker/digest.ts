/**
 * A complete, **reflective** digest of a running `Simulation` — the comparator
 * the snapshot-replay byte-identity property is measured with.
 *
 * ## Why reflective, and not a list of fields
 *
 * The obvious implementation digests the same field list `snapshot.ts` carries.
 * That implementation is worthless, and worthless in the project's signature
 * way: if a field is missing from the list then the snapshot does not carry it
 * *and* the digest does not look at it, so the two runs agree and the property
 * passes while the feature is broken. The comparator would be measuring the
 * snapshot against itself.
 *
 * So this walks **own enumerable properties discovered at run time**
 * (`Object.keys`, sorted for canonical order). Add a mutable field to `Resident`
 * and it enters the digest immediately; if `snapshot.ts` does not carry it,
 * `engine/test/worker/snapshot.property.test.ts` goes red naming the field. The
 * only way to keep the suite green is to snapshot it. That is the property this
 * module exists to buy.
 *
 * ## Exactness
 *
 * Numbers are emitted as their IEEE-754 bit pattern, so `-0` ≠ `0`, every `NaN`
 * payload is stable, and no decimal formatting decision can mask a difference.
 * `bigint` (the decision seed) is emitted decimal. Large typed arrays — a
 * shelter's 88,100-entry `dist` — are folded to a 64-bit content hash instead of
 * being dumped; small ones (route legs) are dumped in full.
 *
 * ## What is deliberately reduced
 *
 * `Resident.targetShelter` is emitted as the shelter's **id**, not by recursion:
 * shelters are digested once at the top level, and recursing would digest 46
 * shortest-path trees per resident. `Simulation` is digested through its public
 * `residents` / `shelters` lists plus the private tick, order array and closure
 * state, which {@link SIMULATION_SCALARS} names.
 */

import { Shelter } from "../shelters/shelter.js";
import { JavaRandom } from "../rng/JavaRandom.js";
import type { SmokeField } from "../smoke/field.js";
import type { Simulation } from "../sim.js";
import type { StreamRegistryState } from "../rng/streams.js";

import { assertFieldContract } from "./fieldContract.js";

/** Elements above which a typed array is hashed rather than dumped. */
const DUMP_LIMIT = 4096;

const f64 = new Float64Array(1);
const u8OfF64 = new Uint8Array(f64.buffer);

/** IEEE-754 bits of a double, big-endian hex — exact, `-0`- and NaN-safe. */
export function f64Bits(x: number): string {
  f64[0] = x;
  let s = "";
  for (let i = 7; i >= 0; i--) {
    s += u8OfF64[i]!.toString(16).padStart(2, "0");
  }
  return s;
}

/**
 * A 64-bit FNV-1a-style content hash of raw bytes, as 16 hex chars.
 *
 * Two independent 32-bit lanes with different primes and seeds, concatenated.
 * Used only for arrays too large to dump (shortest-path trees); a difference in
 * any byte changes at least one lane.
 */
export function hashBytes(bytes: Uint8Array): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < bytes.length; i++) {
    const v = bytes[i]!;
    a = Math.imul(a ^ v, 0x01000193) >>> 0;
    b = Math.imul(b + v + i, 0x85ebca6b) >>> 0;
    b = ((b << 13) | (b >>> 19)) >>> 0;
  }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}

function isTypedArray(v: unknown): v is
  | Int8Array
  | Uint8Array
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array {
  return ArrayBuffer.isView(v) && !(v instanceof DataView);
}

function typedArrayToken(name: string, v: ArrayBufferView & { length: number }): string {
  const bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  if (v.length > DUMP_LIMIT) {
    return `${name}=[${v.constructor.name}:${v.length}:#${hashBytes(bytes)}]`;
  }
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    s += bytes[i]!.toString(16).padStart(2, "0");
  }
  return `${name}=[${v.constructor.name}:${v.length}:${s}]`;
}

/**
 * Canonical tokens for one value, recursively, appended to `out`.
 *
 * `seen` is the cycle guard. A cycle is emitted as `<cycle>` rather than
 * throwing, because the model does contain back-references and a comparator that
 * crashes on one is a comparator nobody runs.
 */
function emit(out: string[], path: string, value: unknown, seen: Set<object>): void {
  if (value === null) {
    out.push(`${path}=null`);
    return;
  }
  switch (typeof value) {
    case "undefined":
      out.push(`${path}=undefined`);
      return;
    case "number":
      out.push(`${path}=${f64Bits(value)}`);
      return;
    case "bigint":
      out.push(`${path}=${value.toString()}n`);
      return;
    case "boolean":
      out.push(`${path}=${value ? "T" : "F"}`);
      return;
    case "string":
      out.push(`${path}=${JSON.stringify(value)}`);
      return;
    case "function":
      out.push(`${path}=<fn>`);
      return;
    default:
      break;
  }

  const obj = value as object;
  if (seen.has(obj)) {
    out.push(`${path}=<cycle>`);
    return;
  }

  // --- reductions, before the generic walk --------------------------------
  if (obj instanceof Shelter) {
    // Digested once at the top level; here it is only an identity.
    out.push(`${path}=<shelter:${obj.id}>`);
    return;
  }
  if (obj instanceof JavaRandom) {
    const st = obj.getState();
    out.push(
      `${path}=<JavaRandom:${st.hi}:${st.lo}:${st.haveNextNextGaussian ? "T" : "F"}:` +
        `${f64Bits(st.nextNextGaussian)}>`,
    );
    return;
  }
  if (isTypedArray(obj)) {
    out.push(typedArrayToken(path, obj));
    return;
  }
  if (obj instanceof Set) {
    // Insertion order preserved: it IS part of the object's state even though
    // nothing in the model iterates these sets today.
    seen.add(obj);
    let i = 0;
    for (const v of obj) {
      emit(out, `${path}{${i}}`, v, seen);
      i++;
    }
    out.push(`${path}.size=${i}`);
    seen.delete(obj);
    return;
  }
  if (obj instanceof Map) {
    seen.add(obj);
    let i = 0;
    for (const [k, v] of obj) {
      emit(out, `${path}<${i}>k`, k, seen);
      emit(out, `${path}<${i}>v`, v, seen);
      i++;
    }
    out.push(`${path}.size=${i}`);
    seen.delete(obj);
    return;
  }
  if (Array.isArray(obj)) {
    seen.add(obj);
    for (let i = 0; i < obj.length; i++) {
      emit(out, `${path}[${i}]`, obj[i], seen);
    }
    out.push(`${path}.length=${obj.length}`);
    seen.delete(obj);
    return;
  }

  seen.add(obj);
  const keys = Object.keys(obj).sort();
  for (const k of keys) {
    emit(out, `${path}.${k}`, (obj as Record<string, unknown>)[k], seen);
  }
  seen.delete(obj);
}

/** Private `Simulation` scalars that are run state rather than derived cache. */
export const SIMULATION_SCALARS = ["tickValue", "admissionEpoch"] as const;

export interface DigestOptions {
  /** Include each shelter's shortest-path tree (hashed). Default `true`. */
  readonly includeRouteTrees?: boolean;
}

/**
 * Every token of a simulation's observable state, in a fixed order.
 *
 * Returned as an array rather than a string so a mismatch can be localised to a
 * single token — a bare digest names no culprit, and "the run diverged" is not a
 * diagnosis.
 */
export function simulationTokens(
  sim: Simulation,
  smoke: SmokeField,
  streams: { getState(): StreamRegistryState },
  options: DigestOptions = {},
): string[] {
  const internals = sim as unknown as Record<string, unknown>;
  assertFieldContract("Simulation", sim as unknown as object);
  const out: string[] = [];
  const seen = new Set<object>();

  for (const k of SIMULATION_SCALARS) {
    emit(out, `sim.${k}`, internals[k], seen);
  }
  emit(out, "sim.order", internals["order"], seen);

  for (let i = 0; i < sim.residents.length; i++) {
    const r = sim.residents[i]! as unknown as Record<string, unknown>;
    for (const k of Object.keys(r).sort()) {
      emit(out, `r[${i}].${k}`, r[k], seen);
    }
  }

  for (let i = 0; i < sim.shelters.length; i++) {
    const s = sim.shelters[i]! as unknown as Record<string, unknown>;
    for (const k of Object.keys(s).sort()) {
      if (k === "routeTree" && options.includeRouteTrees === false) {
        continue;
      }
      emit(out, `s[${i}].${k}`, s[k], seen);
    }
  }

  if (sim.closures !== null) {
    const c = sim.closures as unknown as Record<string, unknown>;
    assertFieldContract("ClosureRuntime", sim.closures as unknown as object);
    emit(out, "closures.version", c["version"], seen);
    emit(out, "closures.cursor", c["cursor"], seen);
    emit(out, "closures.reports", c["reports"], seen);
    const blocked = sim.closures.blocked as unknown as Record<string, unknown>;
    assertFieldContract("BlockedEdges", sim.closures.blocked as unknown as object);
    emit(out, "closures.blocked.flags", blocked["flags"], seen);
    emit(out, "closures.blocked.pairs", blocked["pairs"], seen);
    emit(out, "closures.blocked.pairEndpoints", blocked["pairEndpoints"], seen);
  } else {
    out.push("closures=null");
  }

  const st = streams.getState();
  out.push(`streams.runSeed=${st.runSeed}`);
  out.push(`streams.mt.mti=${st.defaultStream.mti}`);
  emit(out, "streams.mt.mt", st.defaultStream.mt, seen);
  emit(out, "streams.populationSampler", st.populationSampler, seen);
  emit(out, "streams.eLayerSampler", st.eLayerSampler, seen);

  out.push(`smoke.outOfRangeLookups=${smoke.outOfRangeLookups}`);
  return out;
}

/** The first token on which two digests disagree, with both values. */
export function firstTokenDelta(a: readonly string[], b: readonly string[]): string | null {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) {
      return `token ${i}: ${a[i]} != ${b[i]}`;
    }
  }
  if (a.length !== b.length) {
    return `token count ${a.length} != ${b.length} (first extra: ${(a[n] ?? b[n]) ?? "<none>"})`;
  }
  return null;
}

/** SHA-256 of `text`, lowercase hex. Works in Node and in every browser. */
export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** SHA-256 over {@link simulationTokens}, newline-joined. */
export async function digestSimulation(
  sim: Simulation,
  smoke: SmokeField,
  streams: { getState(): StreamRegistryState },
  options: DigestOptions = {},
): Promise<string> {
  return sha256Hex(simulationTokens(sim, smoke, streams, options).join("\n"));
}
