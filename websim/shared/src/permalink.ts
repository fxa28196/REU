/**
 * permalink.ts — base64url config-diff codec (plan §6.6).
 *
 * Fragment shape: `#p=<presetId>&d=<base64url(diff)>&seed=<n>&t=<tick>`.
 *
 * A permalink encodes a DIFF against a named preset, not a whole config. Two
 * reasons: the link stays short, and it stays honest — reading one tells you
 * exactly what was changed from a known baseline, which is the same property R7
 * asks of the preset system itself.
 *
 * Every payload is schema-version-stamped. A link written against an older
 * contract still decodes (so the UI can show a migration notice and what the
 * link asked for) but is flagged `stale`, and callers must not silently run it.
 *
 * Encoding is UTF-8 → base64url with no padding, implemented here rather than
 * via `btoa`/`Buffer` so the same code path runs in the browser, in Node and in
 * a worker with no globals check.
 */

import type { RunConfig, RunConfigParseResult, RunConfigPatch } from "./config.js";
import { applyRunConfigPatch, diffToPatch, safeParseRunConfigPatch } from "./config.js";
import { PARAM_NAMES } from "./schema.js";

/**
 * Bump when a shipped permalink payload stops being decodable as written —
 * a parameter removed or renamed, or the payload envelope changed. Adding a
 * parameter does not require a bump: an old link simply omits it and inherits
 * the preset's value.
 */
export const PERMALINK_VERSION = 1 as const;

// ---------------------------------------------------------------------------
// base64url
// ---------------------------------------------------------------------------

const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

const B64URL_INDEX: ReadonlyMap<string, number> = new Map(
  [...B64URL].map((char, index) => [char, index]),
);

/** Encode bytes as unpadded base64url. */
export function bytesToBase64Url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const b1 = bytes[i + 1] ?? 0;
    const b2 = bytes[i + 2] ?? 0;
    const remaining = bytes.length - i;
    out += B64URL[b0 >> 2];
    out += B64URL[((b0 & 0x03) << 4) | (b1 >> 4)];
    if (remaining > 1) {
      out += B64URL[((b1 & 0x0f) << 2) | (b2 >> 6)];
    }
    if (remaining > 2) {
      out += B64URL[b2 & 0x3f];
    }
  }
  return out;
}

/** Decode unpadded (or padded) base64url. Throws on any illegal character. */
export function base64UrlToBytes(text: string): Uint8Array {
  const clean = text.replace(/=+$/u, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let byte = 0;
  let acc = 0;
  let accBits = 0;
  for (const char of clean) {
    const value = B64URL_INDEX.get(char);
    if (value === undefined) {
      throw new Error(`Illegal base64url character: ${JSON.stringify(char)}`);
    }
    acc = (acc << 6) | value;
    accBits += 6;
    if (accBits >= 8) {
      accBits -= 8;
      out[byte++] = (acc >> accBits) & 0xff;
    }
  }
  return out.subarray(0, byte);
}

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

function encodeJson(value: unknown): string {
  return bytesToBase64Url(encoder.encode(JSON.stringify(value)));
}

function decodeJson(text: string): unknown {
  return JSON.parse(decoder.decode(base64UrlToBytes(text)));
}

// ---------------------------------------------------------------------------
// Payload
// ---------------------------------------------------------------------------

export interface PermalinkPayload {
  /** Preset the diff is taken against. */
  readonly presetId: string;
  /** Parameters that differ from the preset. Empty for an unmodified preset. */
  readonly patch: RunConfigPatch;
  /**
   * Seed override, surfaced as its own fragment key because "same config, new
   * seed" is the single most common share. `null` = use the preset/patch value.
   */
  readonly seed: number | null;
  /** Timeline position to open at; `null` = start of run. */
  readonly tick: number | null;
}

/** Wire envelope. Short keys: the whole point is a link that fits in a message. */
interface WireEnvelope {
  readonly v: number;
  readonly d: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Encode
// ---------------------------------------------------------------------------

/**
 * Canonicalise a patch: keys in manifest order, so the same set of overrides
 * always encodes to the same string.
 *
 * Without this, two links describing the identical run differ purely because
 * their patch objects were built in different orders — which breaks link
 * equality, caching and any "is this the link I already have?" comparison. Same
 * reason `orderRunConfig` exists for the manifest.
 */
function canonicalisePatch(patch: RunConfigPatch): Record<string, number> {
  const ordered: Record<string, number> = {};
  for (const name of PARAM_NAMES) {
    const value = patch[name];
    if (value !== undefined) {
      ordered[name] = value;
    }
  }
  return ordered;
}

/** Encode a payload as the fragment body (no leading `#`). */
export function encodePermalink(payload: PermalinkPayload): string {
  const envelope: WireEnvelope = {
    v: PERMALINK_VERSION,
    d: canonicalisePatch(payload.patch),
  };
  const parts = [
    `p=${encodeURIComponent(payload.presetId)}`,
    `d=${encodeJson(envelope)}`,
  ];
  if (payload.seed !== null) {
    parts.push(`seed=${String(payload.seed)}`);
  }
  if (payload.tick !== null) {
    parts.push(`t=${String(payload.tick)}`);
  }
  return parts.join("&");
}

/** Encode "this config, expressed as a diff against this preset". */
export function encodeConfigPermalink(
  presetId: string,
  preset: RunConfig,
  config: RunConfig,
  options: { readonly tick?: number | null } = {},
): string {
  return encodePermalink({
    presetId,
    patch: diffToPatch(preset, config),
    seed: null,
    tick: options.tick ?? null,
  });
}

// ---------------------------------------------------------------------------
// Decode
// ---------------------------------------------------------------------------

export type PermalinkDecodeResult =
  | {
      readonly ok: true;
      readonly payload: PermalinkPayload;
      readonly version: number;
      /** Written against a different contract version — show a migration notice. */
      readonly stale: boolean;
    }
  | { readonly ok: false; readonly message: string };

/** Decode a fragment body. Accepts a leading `#` or `?`. Never throws. */
export function decodePermalink(fragment: string): PermalinkDecodeResult {
  try {
    const body = fragment.replace(/^[#?]/u, "");
    const params = new URLSearchParams(body);

    const presetId = params.get("p");
    if (presetId === null || presetId.length === 0) {
      return { ok: false, message: "permalink is missing its preset id (p=)" };
    }

    let patch: RunConfigPatch = {};
    let version: number = PERMALINK_VERSION;
    const encodedDiff = params.get("d");
    if (encodedDiff !== null && encodedDiff.length > 0) {
      const envelope = decodeJson(encodedDiff);
      if (typeof envelope !== "object" || envelope === null) {
        return { ok: false, message: "permalink diff payload is not an object" };
      }
      const raw = envelope as Partial<WireEnvelope>;
      if (typeof raw.v !== "number" || !Number.isInteger(raw.v)) {
        return { ok: false, message: "permalink diff payload has no integer version stamp" };
      }
      version = raw.v;
      const parsedPatch = safeParseRunConfigPatch(raw.d ?? {});
      if (!parsedPatch.ok) {
        const detail = parsedPatch.issues
          .map((i) => `${i.param ?? "(patch)"}: ${i.message}`)
          .join("; ");
        return { ok: false, message: `permalink diff is not a valid patch: ${detail}` };
      }
      patch = parsedPatch.patch;
    }

    const seed = parseIntegerParam(params.get("seed"));
    if (seed === "invalid") {
      return { ok: false, message: "permalink seed is not an integer" };
    }
    const tick = parseIntegerParam(params.get("t"));
    if (tick === "invalid") {
      return { ok: false, message: "permalink tick is not an integer" };
    }

    return {
      ok: true,
      payload: { presetId, patch, seed, tick },
      version,
      stale: version !== PERMALINK_VERSION,
    };
  } catch (error) {
    return {
      ok: false,
      message: `permalink could not be decoded: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function parseIntegerParam(raw: string | null): number | null | "invalid" {
  if (raw === null || raw.length === 0) {
    return null;
  }
  const value = Number(raw);
  return Number.isInteger(value) ? value : "invalid";
}

// ---------------------------------------------------------------------------
// Resolve
// ---------------------------------------------------------------------------

/**
 * Apply a decoded payload to its base preset and validate the result.
 *
 * The `seed=` fragment key wins over any `randomSeed` in the diff: it is the
 * outer, more explicit statement of intent, and a link carrying both otherwise
 * has no defined meaning.
 */
export function resolvePermalink(
  payload: PermalinkPayload,
  preset: RunConfig,
): RunConfigParseResult {
  const patch: RunConfigPatch =
    payload.seed === null ? payload.patch : { ...payload.patch, randomSeed: payload.seed };
  return applyRunConfigPatch(preset, patch);
}
