/**
 * graph-asset.ts — the sectioned binary container that carries the certified
 * street graph (and the derived public encampment layer) from the offline
 * pipeline to the browser engine.
 *
 * Why a hand-rolled container rather than JSON or one flat typed-array blob:
 *
 * - **Split asset (DR-S2, fallback INVOKED).** A monolithic graph asset measured
 *   8.794 MB brotli against a ≤ 3 MB budget. The topology — everything routing
 *   needs — measured 2.571 MB and fits, so it ships eagerly while display
 *   polylines and street names ship as separate containers fetched lazily. The
 *   container format is the same for all of them; only `kind` differs.
 * - **Bit-exact Java doubles (plan Q8).** Edge lengths are geodesic weights
 *   computed once by the certified Java `StreetNetwork`; they are transported as
 *   raw IEEE-754 bytes and are never recomputed, re-rounded or re-parsed from
 *   decimal on the TS side. `shuffle8` is a byte-plane transpose — a pure
 *   permutation of the same bytes, chosen because it compresses better — so the
 *   round trip is exactly reversible by construction, not approximately.
 * - **Per-section digests.** Each section's encoded bytes carry their own
 *   SHA-256, so a truncated or partially-cached fetch is detected at the section
 *   that is actually corrupt instead of failing one opaque whole-file check.
 *
 * The container carries **no build timestamp and no host paths**: it is a pure
 * function of the exporter dump, so rebuilding must produce byte-identical
 * files. Provenance (built_utc, commit, tool versions) lives in the separate
 * asset manifest (`assets.ts`), which is allowed to change every build.
 *
 * This module is the *format*, both directions: encoders, decoders, the writer
 * and the reader live together so an encoding can never drift from its inverse.
 */

/** ASCII magic at byte 0. The trailing NUL keeps it 8 bytes / one aligned word. */
export const GRAPH_ASSET_MAGIC = "WSGRAPH\0" as const;

/** Bump only on a breaking layout change; the reader rejects anything else. */
export const GRAPH_ASSET_FORMAT_VERSION = 1 as const;

/** Every section payload starts on an 8-byte boundary so f64 views are aligned. */
export const SECTION_ALIGNMENT = 8 as const;

const HEADER_PREAMBLE_BYTES = 16;

/**
 * How a section's logical elements are laid out in its payload bytes.
 *
 * - `raw` — native little-endian elements, no transform.
 * - `shuffle8` — byte-plane transpose of an 8-byte-element array: plane j holds
 *   byte j of every element. Same multiset of bytes, better compression.
 * - `varint-delta-zigzag` — LEB128 varints over zigzagged successive deltas.
 *   Only used for the ascending node-id table.
 */
export type SectionEncoding = "raw" | "shuffle8" | "varint-delta-zigzag";

/** Logical element type of a decoded section. */
export type SectionElementType = "i32" | "f64" | "u8" | "utf8";

/** Which asset a container carries. */
export type ContainerKind = "topology" | "geometry" | "names" | "encampments";

export interface SectionHeader {
  readonly id: string;
  readonly encoding: SectionEncoding;
  readonly element_type: SectionElementType;
  /** Number of logical elements (i32/f64 count, or byte count for u8/utf8). */
  readonly element_count: number;
  /** Absolute byte offset of the payload from the start of the container. */
  readonly offset: number;
  /** Encoded payload length in bytes (excludes inter-section padding). */
  readonly bytes: number;
  /** Lowercase hex SHA-256 of exactly those `bytes`. */
  readonly sha256: string;
}

export interface ContainerHeader {
  readonly format: "websim/graph-asset";
  readonly version: number;
  readonly kind: ContainerKind;
  /** Structural counts, cross-checked against the decoded sections. */
  readonly counts: Readonly<Record<string, number>>;
  readonly sections: readonly SectionHeader[];
}

/** Sync digest function (Node `createHash`); the writer needs one. */
export type HashFn = (bytes: Uint8Array) => string;

/** Digest function that may be async (browser `crypto.subtle.digest`). */
export type AsyncHashFn = (bytes: Uint8Array) => string | Promise<string>;

// ---------------------------------------------------------------------------
// codecs — every encoder is immediately followed by its exact inverse
// ---------------------------------------------------------------------------

/** Byte-plane transpose. `width` must divide `src.length`. */
export function shuffleBytes(src: Uint8Array, width: number): Uint8Array {
  if (width <= 0 || src.length % width !== 0) {
    throw new Error(`shuffleBytes: ${src.length} bytes is not a multiple of width ${width}`);
  }
  const n = src.length / width;
  const out = new Uint8Array(src.length);
  for (let j = 0; j < width; j++) {
    const base = j * n;
    for (let i = 0; i < n; i++) {
      out[base + i] = src[i * width + j]!;
    }
  }
  return out;
}

/** Inverse of {@link shuffleBytes}. */
export function unshuffleBytes(src: Uint8Array, width: number): Uint8Array {
  if (width <= 0 || src.length % width !== 0) {
    throw new Error(`unshuffleBytes: ${src.length} bytes is not a multiple of width ${width}`);
  }
  const n = src.length / width;
  const out = new Uint8Array(src.length);
  for (let j = 0; j < width; j++) {
    const base = j * n;
    for (let i = 0; i < n; i++) {
      out[i * width + j] = src[base + i]!;
    }
  }
  return out;
}

/**
 * LEB128 varints over zigzagged successive deltas.
 *
 * Deltas are computed in double arithmetic (exact for anything inside i32) and
 * zigzagged so a negative step costs the same as a positive one.
 */
export function encodeVarintDeltaZigzag(values: Int32Array): Uint8Array {
  const out: number[] = [];
  let prev = 0;
  for (let i = 0; i < values.length; i++) {
    const d = values[i]! - prev;
    prev = values[i]!;
    let z = d < 0 ? -d * 2 - 1 : d * 2;
    while (z >= 128) {
      out.push((z % 128) | 128);
      z = Math.floor(z / 128);
    }
    out.push(z);
  }
  return Uint8Array.from(out);
}

/** Inverse of {@link encodeVarintDeltaZigzag}. */
export function decodeVarintDeltaZigzag(src: Uint8Array, count: number): Int32Array {
  const out = new Int32Array(count);
  let p = 0;
  let prev = 0;
  for (let i = 0; i < count; i++) {
    let z = 0;
    let shift = 1;
    for (;;) {
      if (p >= src.length) {
        throw new Error(`decodeVarintDeltaZigzag: payload exhausted at element ${i}/${count}`);
      }
      const b = src[p]!;
      p++;
      z += (b & 127) * shift;
      if ((b & 128) === 0) {
        break;
      }
      shift *= 128;
    }
    const d = z % 2 === 0 ? z / 2 : -(z + 1) / 2;
    prev += d;
    out[i] = prev;
  }
  if (p !== src.length) {
    throw new Error(`decodeVarintDeltaZigzag: ${src.length - p} trailing byte(s) after ${count} elements`);
  }
  return out;
}

function i32ToBytes(values: Int32Array): Uint8Array {
  return new Uint8Array(values.buffer.slice(values.byteOffset, values.byteOffset + values.byteLength));
}

function f64ToBytes(values: Float64Array): Uint8Array {
  return new Uint8Array(values.buffer.slice(values.byteOffset, values.byteOffset + values.byteLength));
}

// ---------------------------------------------------------------------------
// writer
// ---------------------------------------------------------------------------

/** One section handed to {@link buildContainer}, before offsets are assigned. */
export interface SectionInput {
  readonly id: string;
  readonly encoding: SectionEncoding;
  readonly element_type: SectionElementType;
  readonly element_count: number;
  readonly payload: Uint8Array;
}

/** Encode an Int32Array section (`raw` or `varint-delta-zigzag`). */
export function i32Section(id: string, values: Int32Array, encoding: "raw" | "varint-delta-zigzag" = "raw"): SectionInput {
  return {
    id,
    encoding,
    element_type: "i32",
    element_count: values.length,
    payload: encoding === "raw" ? i32ToBytes(values) : encodeVarintDeltaZigzag(values),
  };
}

/** Encode a Float64Array section (`raw` or `shuffle8`); bits are never touched. */
export function f64Section(id: string, values: Float64Array, encoding: "raw" | "shuffle8" = "shuffle8"): SectionInput {
  const bytes = f64ToBytes(values);
  return {
    id,
    encoding,
    element_type: "f64",
    element_count: values.length,
    payload: encoding === "raw" ? bytes : shuffleBytes(bytes, 8),
  };
}

/** Encode a UTF-8 text section (JSON blobs, name tables). */
export function utf8Section(id: string, text: string): SectionInput {
  const payload = new TextEncoder().encode(text);
  return { id, encoding: "raw", element_type: "utf8", element_count: payload.length, payload };
}

/** Encode an opaque byte section (fixed-width records). */
export function u8Section(id: string, payload: Uint8Array): SectionInput {
  return { id, encoding: "raw", element_type: "u8", element_count: payload.length, payload };
}

function alignUp(v: number, a: number): number {
  return v % a === 0 ? v : v + (a - (v % a));
}

/**
 * Serialise a container.
 *
 * Section offsets live inside the JSON header, and the header's own length
 * depends on how many digits those offsets take — so the layout is solved by
 * fixed-point iteration (two passes in practice) rather than guessed.
 */
export function buildContainer(
  kind: ContainerKind,
  counts: Readonly<Record<string, number>>,
  sections: readonly SectionInput[],
  hash: HashFn,
): Uint8Array {
  const ids = new Set<string>();
  for (const s of sections) {
    if (ids.has(s.id)) {
      throw new Error(`buildContainer: duplicate section id '${s.id}'`);
    }
    ids.add(s.id);
  }
  const digests = sections.map((s) => hash(s.payload));

  const layout = (headerBytes: number): SectionHeader[] => {
    let cursor = alignUp(HEADER_PREAMBLE_BYTES + headerBytes, SECTION_ALIGNMENT);
    return sections.map((s, i) => {
      const entry: SectionHeader = {
        id: s.id,
        encoding: s.encoding,
        element_type: s.element_type,
        element_count: s.element_count,
        offset: cursor,
        bytes: s.payload.length,
        sha256: digests[i]!,
      };
      cursor = alignUp(cursor + s.payload.length, SECTION_ALIGNMENT);
      return entry;
    });
  };

  const encoder = new TextEncoder();
  let headerBytes = 0;
  let headerJson = new Uint8Array(0);
  for (let attempt = 0; attempt < 8; attempt++) {
    const header: ContainerHeader = {
      format: "websim/graph-asset",
      version: GRAPH_ASSET_FORMAT_VERSION,
      kind,
      counts,
      sections: layout(headerBytes),
    };
    headerJson = encoder.encode(JSON.stringify(header));
    if (headerJson.length === headerBytes) {
      break;
    }
    headerBytes = headerJson.length;
  }
  if (headerJson.length !== headerBytes) {
    throw new Error("buildContainer: header layout did not converge");
  }

  const finalSections = layout(headerBytes);
  const last = finalSections[finalSections.length - 1];
  const total = last === undefined
    ? alignUp(HEADER_PREAMBLE_BYTES + headerBytes, SECTION_ALIGNMENT)
    : alignUp(last.offset + last.bytes, SECTION_ALIGNMENT);

  const out = new Uint8Array(total);
  for (let i = 0; i < GRAPH_ASSET_MAGIC.length; i++) {
    out[i] = GRAPH_ASSET_MAGIC.charCodeAt(i);
  }
  const view = new DataView(out.buffer);
  view.setUint32(8, GRAPH_ASSET_FORMAT_VERSION, true);
  view.setUint32(12, headerBytes, true);
  out.set(headerJson, HEADER_PREAMBLE_BYTES);
  for (let i = 0; i < sections.length; i++) {
    out.set(sections[i]!.payload, finalSections[i]!.offset);
  }
  return out;
}

// ---------------------------------------------------------------------------
// reader
// ---------------------------------------------------------------------------

function fail(msg: string): never {
  throw new Error(`graph-asset: ${msg}`);
}

/** Parse and structurally validate a container header. Throws on any problem. */
export function readContainerHeader(buf: Uint8Array): ContainerHeader {
  if (buf.length < HEADER_PREAMBLE_BYTES) {
    fail(`truncated container (${buf.length} bytes)`);
  }
  for (let i = 0; i < GRAPH_ASSET_MAGIC.length; i++) {
    if (buf[i] !== GRAPH_ASSET_MAGIC.charCodeAt(i)) {
      fail("bad magic — not a websim graph asset");
    }
  }
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const version = view.getUint32(8, true);
  if (version !== GRAPH_ASSET_FORMAT_VERSION) {
    fail(`format version ${version} is not supported (expected ${GRAPH_ASSET_FORMAT_VERSION})`);
  }
  const headerBytes = view.getUint32(12, true);
  if (HEADER_PREAMBLE_BYTES + headerBytes > buf.length) {
    fail("header length runs past the end of the container");
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(
    buf.subarray(HEADER_PREAMBLE_BYTES, HEADER_PREAMBLE_BYTES + headerBytes),
  );
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null) {
    fail("header is not a JSON object");
  }
  const h = parsed as ContainerHeader;
  if (h.format !== "websim/graph-asset") {
    fail(`unexpected header format '${String(h.format)}'`);
  }
  if (h.version !== version) {
    fail(`header version ${String(h.version)} disagrees with the preamble (${version})`);
  }
  if (!Array.isArray(h.sections)) {
    fail("header has no sections array");
  }
  for (const s of h.sections) {
    if (s.offset + s.bytes > buf.length) {
      fail(`section '${s.id}' runs past the end of the container`);
    }
  }
  return h;
}

function sectionHeader(header: ContainerHeader, id: string): SectionHeader {
  const s = header.sections.find((x) => x.id === id);
  if (s === undefined) {
    fail(`no section '${id}' in this ${header.kind} container`);
  }
  return s;
}

/** True when the container declares a section. */
export function hasSection(header: ContainerHeader, id: string): boolean {
  return header.sections.some((s) => s.id === id);
}

/** Raw (still encoded) payload bytes of one section. */
export function sectionPayload(buf: Uint8Array, header: ContainerHeader, id: string): Uint8Array {
  const s = sectionHeader(header, id);
  return buf.subarray(s.offset, s.offset + s.bytes);
}

/**
 * Recompute every section digest and return the ids that do not match.
 * A non-empty result is run-blocking (plan Q5).
 */
export async function verifySectionDigests(
  buf: Uint8Array,
  header: ContainerHeader,
  hash: AsyncHashFn,
): Promise<readonly string[]> {
  const bad: string[] = [];
  for (const s of header.sections) {
    const actual = await hash(buf.subarray(s.offset, s.offset + s.bytes));
    if (actual !== s.sha256) {
      bad.push(s.id);
    }
  }
  return bad;
}

/** Decode an `i32` section. */
export function readI32Section(buf: Uint8Array, header: ContainerHeader, id: string): Int32Array {
  const s = sectionHeader(header, id);
  if (s.element_type !== "i32") {
    fail(`section '${id}' is ${s.element_type}, not i32`);
  }
  const payload = buf.subarray(s.offset, s.offset + s.bytes);
  if (s.encoding === "varint-delta-zigzag") {
    return decodeVarintDeltaZigzag(payload, s.element_count);
  }
  if (s.encoding !== "raw") {
    fail(`section '${id}' has encoding '${s.encoding}', which i32 does not support`);
  }
  if (s.bytes !== s.element_count * 4) {
    fail(`section '${id}': ${s.bytes} bytes for ${s.element_count} i32 elements`);
  }
  // Copied rather than viewed: the container's own alignment guarantees hold,
  // but a caller-supplied subarray need not be 4-byte aligned in its buffer.
  const copy = new Uint8Array(payload.length);
  copy.set(payload);
  return new Int32Array(copy.buffer);
}

/** Decode an `f64` section. Bits are restored exactly; no arithmetic happens. */
export function readF64Section(buf: Uint8Array, header: ContainerHeader, id: string): Float64Array {
  const s = sectionHeader(header, id);
  if (s.element_type !== "f64") {
    fail(`section '${id}' is ${s.element_type}, not f64`);
  }
  if (s.bytes !== s.element_count * 8) {
    fail(`section '${id}': ${s.bytes} bytes for ${s.element_count} f64 elements`);
  }
  const payload = buf.subarray(s.offset, s.offset + s.bytes);
  let plain: Uint8Array;
  if (s.encoding === "shuffle8") {
    plain = unshuffleBytes(payload, 8);
  } else if (s.encoding === "raw") {
    plain = new Uint8Array(payload.length);
    plain.set(payload);
  } else {
    fail(`section '${id}' has encoding '${s.encoding}', which f64 does not support`);
  }
  return new Float64Array(plain.buffer);
}

/** Decode a `utf8` section back to a string. */
export function readUtf8Section(buf: Uint8Array, header: ContainerHeader, id: string): string {
  const s = sectionHeader(header, id);
  if (s.element_type !== "utf8") {
    fail(`section '${id}' is ${s.element_type}, not utf8`);
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(buf.subarray(s.offset, s.offset + s.bytes));
}

/** Decode a `u8` section (fixed-width record blobs). */
export function readU8Section(buf: Uint8Array, header: ContainerHeader, id: string): Uint8Array {
  const s = sectionHeader(header, id);
  if (s.element_type !== "u8") {
    fail(`section '${id}' is ${s.element_type}, not u8`);
  }
  const payload = buf.subarray(s.offset, s.offset + s.bytes);
  const copy = new Uint8Array(payload.length);
  copy.set(payload);
  return copy;
}

// ---------------------------------------------------------------------------
// typed unpackers
// ---------------------------------------------------------------------------

/**
 * The graph census, verbatim from the Java exporter's `census.json`.
 * Only the fields the unpacker cross-checks are typed; the rest ride along.
 */
export interface GraphCensus {
  readonly features: number;
  readonly attr_node_ids: number;
  readonly final_graph_nodes: number;
  readonly affected_attr_node_ids: number;
  readonly sites_reattached: number;
  readonly sites_split_synthetic: number;
  readonly impossible_edges_after_fix: number;
  readonly components: number;
  readonly largest_component_nodes: number;
  readonly undirected_street_edges: number;
  readonly directed_edge_records: number;
  readonly node_ids_negative: number;
  readonly max_degree: number;
  readonly polyline_vertices_total: number;
  readonly [key: string]: unknown;
}

export interface GraphCorrection {
  readonly kind: "SPLIT" | "REATTACHED";
  readonly attr_node_id: number;
  readonly graph_node_id: number;
  readonly dist_from_primary_m: number;
  readonly lon: number;
  readonly lat: number;
  readonly claims: number;
  readonly first_feature: string;
}

/**
 * The eagerly-loaded routing graph.
 *
 * `edgeFrom`/`edgeTo` and `csrEntry` address nodes and edges by **index**, not
 * by node id: ids are sparse (−1021 … 17,023,620, plan risk S2-R3). `nodeId`
 * maps index → id for output columns.
 *
 * `csrEntry` holds a **signed 1-based edge id**: `+e+1` means the edge is
 * traversed from → to at this node, `−(e+1)` means to → from. Entry order
 * inside a node's slice is the certified `StreetNetwork` adjacency order
 * (shapefile feature order), which is what makes Dijkstra's relaxation order
 * reproducible against Java.
 */
export interface GraphTopology {
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly nodeId: Int32Array;
  readonly nodeLon: Float64Array;
  readonly nodeLat: Float64Array;
  readonly edgeFrom: Int32Array;
  readonly edgeTo: Int32Array;
  /** Java-computed geodesic weights, bit-for-bit as `StreetNetwork` produced them. */
  readonly edgeLengthM: Float64Array;
  readonly csrOffset: Int32Array;
  readonly csrEntry: Int32Array;
  readonly census: GraphCensus;
  readonly corrections: readonly GraphCorrection[];
}

function expect(cond: boolean, msg: string): void {
  if (!cond) {
    fail(msg);
  }
}

/** Decode a topology container and cross-check it against its own census. */
export function unpackTopology(buf: Uint8Array): GraphTopology {
  const header = readContainerHeader(buf);
  expect(header.kind === "topology", `expected a topology container, got '${header.kind}'`);

  const nodeId = readI32Section(buf, header, "node_id");
  const nodeLon = readF64Section(buf, header, "node_lon");
  const nodeLat = readF64Section(buf, header, "node_lat");
  const edgeFrom = readI32Section(buf, header, "edge_from");
  const edgeTo = readI32Section(buf, header, "edge_to");
  const edgeLengthM = readF64Section(buf, header, "edge_length_m");
  const csrOffset = readI32Section(buf, header, "csr_offset");
  const csrEntry = readI32Section(buf, header, "csr_entry");
  const census = JSON.parse(readUtf8Section(buf, header, "census_json")) as GraphCensus;
  const corrections = JSON.parse(
    readUtf8Section(buf, header, "corrections_json"),
  ) as readonly GraphCorrection[];

  const nodeCount = nodeId.length;
  const edgeCount = edgeFrom.length;

  expect(header.counts["nodes"] === nodeCount, "header node count disagrees with the node table");
  expect(header.counts["edges"] === edgeCount, "header edge count disagrees with the edge table");
  expect(nodeLon.length === nodeCount && nodeLat.length === nodeCount, "node coordinate arrays are the wrong length");
  expect(edgeTo.length === edgeCount && edgeLengthM.length === edgeCount, "edge arrays are the wrong length");
  expect(csrOffset.length === nodeCount + 1, "csr_offset must hold nodeCount + 1 entries");

  // Census identity: the numbers the provenance screen shows are the numbers the
  // arrays actually contain, checked here rather than trusted.
  expect(census.final_graph_nodes === nodeCount, `census final_graph_nodes ${census.final_graph_nodes} != ${nodeCount}`);
  expect(
    census.undirected_street_edges === edgeCount,
    `census undirected_street_edges ${census.undirected_street_edges} != ${edgeCount}`,
  );
  expect(
    census.directed_edge_records === csrEntry.length,
    `census directed_edge_records ${census.directed_edge_records} != ${csrEntry.length}`,
  );
  expect(
    census.affected_attr_node_ids === corrections.length,
    `census affected_attr_node_ids ${census.affected_attr_node_ids} != ${corrections.length} correction record(s)`,
  );

  expect(csrOffset[0] === 0, "csr_offset[0] must be 0");
  expect(csrOffset[nodeCount] === csrEntry.length, "csr_offset must end at the entry count");
  let maxDegree = 0;
  for (let i = 0; i < nodeCount; i++) {
    const a = csrOffset[i]!;
    const b = csrOffset[i + 1]!;
    expect(b >= a, `csr_offset is not monotonic at node ${i}`);
    if (b - a > maxDegree) {
      maxDegree = b - a;
    }
  }
  expect(maxDegree === census.max_degree, `max degree ${maxDegree} != census ${census.max_degree}`);

  let negatives = 0;
  for (let i = 0; i < nodeCount; i++) {
    if (nodeId[i]! < 0) {
      negatives++;
    }
    if (i > 0) {
      expect(nodeId[i]! > nodeId[i - 1]!, `node ids are not strictly ascending at index ${i}`);
    }
  }
  expect(
    negatives === census.node_ids_negative,
    `${negatives} synthetic negative node id(s) != census ${census.node_ids_negative}`,
  );

  return {
    nodeCount,
    edgeCount,
    nodeId,
    nodeLon,
    nodeLat,
    edgeFrom,
    edgeTo,
    edgeLengthM,
    csrOffset,
    csrEntry,
    census,
    corrections,
  };
}

/**
 * Display polylines, reconstructed from interior vertices plus the node table.
 *
 * 218,860 of 218,868 polyline endpoints are bit-identical to their resolved node
 * coordinate (DR-S2 §5), so endpoints are not stored: they are read back from
 * the topology container, and the 8 that genuinely differ — the reattached and
 * split correction sites — ride in an explicit exception list. That is a 33 %
 * saving at zero fidelity cost, and the reconstruction below is what makes it
 * lossless rather than merely small.
 */
export interface GraphGeometry {
  readonly edgeCount: number;
  readonly vertexCount: number;
  /** `polyOffset[e] .. polyOffset[e+1]` indexes this edge's vertices. */
  readonly polyOffset: Int32Array;
  readonly polyLon: Float64Array;
  readonly polyLat: Float64Array;
}

export function unpackGeometry(buf: Uint8Array, topology: GraphTopology): GraphGeometry {
  const header = readContainerHeader(buf);
  expect(header.kind === "geometry", `expected a geometry container, got '${header.kind}'`);

  const interiorOffset = readI32Section(buf, header, "poly_interior_offset");
  const interiorLon = readF64Section(buf, header, "poly_interior_lon");
  const interiorLat = readF64Section(buf, header, "poly_interior_lat");
  const excEdge = readI32Section(buf, header, "poly_exception_edge");
  const excEnd = readI32Section(buf, header, "poly_exception_end");
  const excLon = readF64Section(buf, header, "poly_exception_lon");
  const excLat = readF64Section(buf, header, "poly_exception_lat");

  const edgeCount = topology.edgeCount;
  expect(interiorOffset.length === edgeCount + 1, "poly_interior_offset must hold edgeCount + 1 entries");
  expect(header.counts["edges"] === edgeCount, "geometry edge count disagrees with the topology");

  const interiorTotal = interiorOffset[edgeCount]!;
  expect(
    interiorLon.length === interiorTotal && interiorLat.length === interiorTotal,
    "interior vertex arrays disagree with poly_interior_offset",
  );

  const vertexCount = interiorTotal + 2 * edgeCount;
  const polyOffset = new Int32Array(edgeCount + 1);
  const polyLon = new Float64Array(vertexCount);
  const polyLat = new Float64Array(vertexCount);

  let w = 0;
  for (let e = 0; e < edgeCount; e++) {
    polyOffset[e] = w;
    const from = topology.edgeFrom[e]!;
    const to = topology.edgeTo[e]!;
    polyLon[w] = topology.nodeLon[from]!;
    polyLat[w] = topology.nodeLat[from]!;
    w++;
    for (let v = interiorOffset[e]!; v < interiorOffset[e + 1]!; v++) {
      polyLon[w] = interiorLon[v]!;
      polyLat[w] = interiorLat[v]!;
      w++;
    }
    polyLon[w] = topology.nodeLon[to]!;
    polyLat[w] = topology.nodeLat[to]!;
    w++;
  }
  polyOffset[edgeCount] = w;
  expect(w === vertexCount, `reconstructed ${w} vertices, expected ${vertexCount}`);

  for (let i = 0; i < excEdge.length; i++) {
    const e = excEdge[i]!;
    const slot = excEnd[i]! === 0 ? polyOffset[e]! : polyOffset[e + 1]! - 1;
    polyLon[slot] = excLon[i]!;
    polyLat[slot] = excLat[i]!;
  }

  expect(
    vertexCount === topology.census.polyline_vertices_total,
    `reconstructed ${vertexCount} polyline vertices != census ${topology.census.polyline_vertices_total}`,
  );

  return { edgeCount, vertexCount, polyOffset, polyLon, polyLat };
}

/** Display-only street names: a dictionary plus one index per edge. */
export interface GraphNames {
  readonly edgeCount: number;
  readonly nameIndex: Int32Array;
  readonly names: readonly string[];
}

export function unpackNames(buf: Uint8Array): GraphNames {
  const header = readContainerHeader(buf);
  expect(header.kind === "names", `expected a names container, got '${header.kind}'`);
  const nameIndex = readI32Section(buf, header, "edge_name_index");
  const table = readUtf8Section(buf, header, "name_table");
  const names = table.length === 0 ? [] : table.split("\n");
  for (let i = 0; i < nameIndex.length; i++) {
    const k = nameIndex[i]!;
    expect(k >= 0 && k < names.length, `edge ${i} references name ${k} of ${names.length}`);
  }
  return { edgeCount: nameIndex.length, nameIndex, names };
}

/** Street name for one edge index. */
export function edgeName(names: GraphNames, edge: number): string {
  const k = names.nameIndex[edge];
  if (k === undefined) {
    fail(`edge ${edge} is out of range (${names.edgeCount} edges)`);
  }
  return names.names[k]!;
}

/**
 * The PUBLIC encampment layer (plan Q4).
 *
 * Carries **only** street-node quantities: the graph node each report snapped to
 * (the sim-relevant quantity), that node's coordinate — which is already public
 * in the topology container — and a salted, truncated hash of each report id.
 * Raw coordinates, report dates and vehicle flags do not exist in this asset,
 * and `deploy-check.ts` proves it byte-by-byte before publication.
 *
 * `rowSlot` keeps the original report *order* so the engine's uniform draw over
 * report rows lands on the same node it lands on locally; the coordinate table
 * is deduplicated per node, so a node that many reports share is carried once.
 */
export interface EncampmentsPublic {
  readonly rowCount: number;
  readonly nodeCount: number;
  /** Index into the topology node table, one per distinct snapped node. */
  readonly nodeIndex: Int32Array;
  /** Graph node id, one per distinct snapped node. */
  readonly nodeId: Int32Array;
  readonly nodeLon: Float64Array;
  readonly nodeLat: Float64Array;
  /** Per report row, in file order: index into the distinct-node tables. */
  readonly rowSlot: Int32Array;
  /** Per report row: salted SHA-256 of `inc_id`, truncated to 12 hex chars. */
  readonly rowHashHex: readonly string[];
}

/** Bytes of truncated digest stored per row (12 hex chars). */
export const ENCAMPMENT_HASH_BYTES = 6 as const;

export function unpackEncampmentsPublic(buf: Uint8Array): EncampmentsPublic {
  const header = readContainerHeader(buf);
  expect(header.kind === "encampments", `expected an encampments container, got '${header.kind}'`);

  const nodeIndex = readI32Section(buf, header, "camp_node_index");
  const nodeId = readI32Section(buf, header, "camp_node_id");
  const nodeLon = readF64Section(buf, header, "camp_node_lon");
  const nodeLat = readF64Section(buf, header, "camp_node_lat");
  const rowSlot = readI32Section(buf, header, "camp_row_slot");
  const hashBytes = readU8Section(buf, header, "camp_row_hash");

  const nodeCount = nodeIndex.length;
  const rowCount = rowSlot.length;
  expect(header.counts["rows"] === rowCount, "header row count disagrees with camp_row_slot");
  expect(header.counts["nodes"] === nodeCount, "header node count disagrees with camp_node_index");
  expect(
    nodeId.length === nodeCount && nodeLon.length === nodeCount && nodeLat.length === nodeCount,
    "distinct-node tables have inconsistent lengths",
  );
  expect(
    hashBytes.length === rowCount * ENCAMPMENT_HASH_BYTES,
    `camp_row_hash holds ${hashBytes.length} bytes, expected ${rowCount * ENCAMPMENT_HASH_BYTES}`,
  );

  const rowHashHex: string[] = new Array<string>(rowCount);
  for (let r = 0; r < rowCount; r++) {
    let s = "";
    for (let b = 0; b < ENCAMPMENT_HASH_BYTES; b++) {
      s += hashBytes[r * ENCAMPMENT_HASH_BYTES + b]!.toString(16).padStart(2, "0");
    }
    rowHashHex[r] = s;
    const slot = rowSlot[r]!;
    expect(slot >= 0 && slot < nodeCount, `row ${r} references slot ${slot} of ${nodeCount}`);
  }
  for (let i = 1; i < nodeCount; i++) {
    expect(nodeIndex[i]! > nodeIndex[i - 1]!, `distinct node indices are not strictly ascending at ${i}`);
  }

  return { rowCount, nodeCount, nodeIndex, nodeId, nodeLon, nodeLat, rowSlot, rowHashHex };
}

/**
 * Connected-component census recomputed from the packed CSR.
 *
 * Exists so the census the asset *claims* can be checked against the adjacency
 * the asset actually *carries*: a packing bug that dropped or mis-ordered CSR
 * entries would move these numbers even though the JSON census stayed put.
 */
export function componentCensus(topology: GraphTopology): { components: number; largest: number } {
  const { nodeCount, csrOffset, csrEntry, edgeFrom, edgeTo } = topology;
  const seen = new Uint8Array(nodeCount);
  const stack = new Int32Array(nodeCount);
  let components = 0;
  let largest = 0;
  for (let start = 0; start < nodeCount; start++) {
    if (seen[start] === 1) {
      continue;
    }
    components++;
    let sp = 0;
    stack[sp++] = start;
    seen[start] = 1;
    let size = 0;
    while (sp > 0) {
      const n = stack[--sp]!;
      size++;
      for (let k = csrOffset[n]!; k < csrOffset[n + 1]!; k++) {
        const signed = csrEntry[k]!;
        const e = Math.abs(signed) - 1;
        const other = signed > 0 ? edgeTo[e]! : edgeFrom[e]!;
        if (seen[other] === 0) {
          seen[other] = 1;
          stack[sp++] = other;
        }
      }
    }
    if (size > largest) {
      largest = size;
    }
  }
  return { components, largest };
}
