import { describe, expect, it } from "vitest";

import { configsEqual, diffToPatch } from "../src/config.js";
import {
  base64UrlToBytes,
  bytesToBase64Url,
  decodePermalink,
  encodeConfigPermalink,
  encodePermalink,
  PERMALINK_VERSION,
  resolvePermalink,
} from "../src/permalink.js";
import type { PermalinkPayload } from "../src/permalink.js";
import { PRESETS } from "../src/presets/index.js";

const A = PRESETS.A_present_day;

describe("base64url codec", () => {
  it("round-trips arbitrary bytes at every length modulo 3", () => {
    for (let length = 0; length < 64; length++) {
      const bytes = new Uint8Array(length);
      for (let i = 0; i < length; i++) {
        bytes[i] = (i * 37 + length * 11) & 0xff;
      }
      const encoded = bytesToBase64Url(bytes);
      expect(encoded).not.toMatch(/[+/=]/u);
      expect([...base64UrlToBytes(encoded)]).toEqual([...bytes]);
    }
  });

  it("round-trips non-ASCII text", () => {
    const text = "µg/m³ — Coughlan 2022 · θ";
    const bytes = new TextEncoder().encode(text);
    expect(new TextDecoder().decode(base64UrlToBytes(bytesToBase64Url(bytes)))).toBe(text);
  });

  it("rejects an illegal character", () => {
    expect(() => base64UrlToBytes("ab*c")).toThrow(/Illegal base64url character/u);
  });

  it("accepts padded input", () => {
    const bytes = new Uint8Array([1, 2]);
    expect([...base64UrlToBytes(`${bytesToBase64Url(bytes)}==`)]).toEqual([1, 2]);
  });
});

describe("permalink round-trip", () => {
  const payloads: readonly PermalinkPayload[] = [
    { presetId: "A_present_day", patch: {}, seed: null, tick: null },
    { presetId: "A_present_day", patch: { numAgents: 500 }, seed: 43, tick: 1200 },
    {
      presetId: "SE2_worst_plausible_E18_d1",
      // The negative half of the sweep, which is the value the batch loader
      // zeroed: a permalink that silently dropped the sign would reintroduce the
      // defect through a different door.
      patch: { pushThetaThreshold: -0.5, alphaHazard: -9, closureDraw: 3 },
      seed: -1,
      tick: 0,
    },
  ];

  it("survives encode → decode unchanged", () => {
    for (const payload of payloads) {
      const decoded = decodePermalink(encodePermalink(payload));
      expect(decoded.ok, `payload ${payload.presetId} failed to decode`).toBe(true);
      if (decoded.ok) {
        expect(decoded.payload).toEqual(payload);
        expect(decoded.version).toBe(PERMALINK_VERSION);
        expect(decoded.stale).toBe(false);
      }
    }
  });

  it("survives decode → encode unchanged", () => {
    for (const payload of payloads) {
      const encoded = encodePermalink(payload);
      const decoded = decodePermalink(encoded);
      expect(decoded.ok).toBe(true);
      if (decoded.ok) {
        expect(encodePermalink(decoded.payload)).toBe(encoded);
      }
    }
  });

  it("tolerates a leading # or ?", () => {
    const encoded = encodePermalink(payloads[1]!);
    expect(decodePermalink(`#${encoded}`).ok).toBe(true);
    expect(decodePermalink(`?${encoded}`).ok).toBe(true);
  });

  it("encodes a config as a diff against its preset", () => {
    const modified = { ...A, numAgents: 500, smokeScale: 1.143 };
    const encoded = encodeConfigPermalink("A_present_day", A, modified, { tick: 60 });
    const decoded = decodePermalink(encoded);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.payload.patch).toEqual(diffToPatch(A, modified));
      expect(decoded.payload.tick).toBe(60);
      const resolved = resolvePermalink(decoded.payload, A);
      expect(resolved.ok).toBe(true);
      if (resolved.ok) {
        expect(configsEqual(resolved.config, modified)).toBe(true);
      }
    }
  });

  it("encodes canonically: patch key order does not change the link", () => {
    // Two objects describing the same overrides must produce the same string,
    // or link equality and caching are meaningless.
    const forward = encodePermalink({
      presetId: "A_present_day",
      patch: { alphaHazard: -9, pushThetaThreshold: -0.5 },
      seed: null,
      tick: null,
    });
    const reversed = encodePermalink({
      presetId: "A_present_day",
      patch: { pushThetaThreshold: -0.5, alphaHazard: -9 },
      seed: null,
      tick: null,
    });
    expect(reversed).toBe(forward);
  });

  it("keeps an unmodified preset link short", () => {
    const encoded = encodePermalink({
      presetId: "A_present_day",
      patch: {},
      seed: null,
      tick: null,
    });
    expect(encoded.length).toBeLessThan(64);
  });
});

describe("permalink resolution", () => {
  it("applies the seed key over any randomSeed in the diff", () => {
    const decoded = decodePermalink(
      encodePermalink({
        presetId: "A_present_day",
        patch: { randomSeed: 99 },
        seed: 44,
        tick: null,
      }),
    );
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      const resolved = resolvePermalink(decoded.payload, A);
      expect(resolved.ok).toBe(true);
      if (resolved.ok) {
        expect(resolved.config.randomSeed).toBe(44);
      }
    }
  });

  it("reports a config the schema rejects rather than running it", () => {
    const resolved = resolvePermalink(
      { presetId: "A_present_day", patch: { simulationHours: 575, smokeSeriesCode: 2 }, seed: null, tick: null },
      A,
    );
    expect(resolved.ok).toBe(false);
  });
});

describe("permalink failure modes", () => {
  it("rejects a link with no preset id", () => {
    const result = decodePermalink("d=e30");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/preset id/u);
    }
  });

  it("rejects a diff payload carrying an unknown parameter", () => {
    const encoded = bytesToBase64Url(
      new TextEncoder().encode(JSON.stringify({ v: PERMALINK_VERSION, d: { notAParam: 1 } })),
    );
    const result = decodePermalink(`p=A_present_day&d=${encoded}`);
    expect(result.ok).toBe(false);
  });

  it("rejects a diff payload carrying an out-of-range value", () => {
    const encoded = bytesToBase64Url(
      new TextEncoder().encode(JSON.stringify({ v: PERMALINK_VERSION, d: { smokeSeriesCode: 7 } })),
    );
    expect(decodePermalink(`p=A_present_day&d=${encoded}`).ok).toBe(false);
  });

  it("rejects a non-integer tick or seed", () => {
    expect(decodePermalink("p=A_present_day&t=1.5").ok).toBe(false);
    expect(decodePermalink("p=A_present_day&seed=abc").ok).toBe(false);
  });

  it("rejects an unversioned payload", () => {
    const encoded = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ d: {} })));
    const result = decodePermalink(`p=A_present_day&d=${encoded}`);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/version stamp/u);
    }
  });

  it("decodes an older payload but flags it stale for the migration notice", () => {
    const encoded = bytesToBase64Url(
      new TextEncoder().encode(JSON.stringify({ v: PERMALINK_VERSION - 1, d: { numAgents: 500 } })),
    );
    const result = decodePermalink(`p=A_present_day&d=${encoded}`);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.stale).toBe(true);
      expect(result.version).toBe(PERMALINK_VERSION - 1);
      expect(result.payload.patch).toEqual({ numAgents: 500 });
    }
  });

  it("rejects malformed base64 rather than throwing", () => {
    const result = decodePermalink("p=A_present_day&d=not*base64");
    expect(result.ok).toBe(false);
  });
});
