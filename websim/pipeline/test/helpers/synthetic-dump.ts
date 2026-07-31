/**
 * A tiny, hand-built stand-in for the Java exporter's dump directory.
 *
 * The real dump is 44 MB and git-ignored, so CI has no copy of it. Without a
 * fixture the packer would only ever be exercised on a developer's machine —
 * which is exactly how a packing regression ships. This graph is deliberately
 * adversarial in miniature: synthetic negative node ids, a sparse id range, two
 * connected components, an isolated-degree node, interior polyline vertices, a
 * polyline endpoint that does NOT coincide with its node (the correction-site
 * case the geometry section special-cases), and repeated street names.
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const bitBuf = new ArrayBuffer(8);
const bitView = new DataView(bitBuf);

/**
 * `Double.toHexString` for normal doubles — the fixture's hex columns have to be
 * real Java-shaped hex, otherwise the packer's "hex is authoritative" path is
 * never exercised by the test.
 */
export function javaHex(x: number): string {
  bitView.setFloat64(0, x, false);
  const bits = bitView.getBigUint64(0, false);
  const sign = bits >> 63n === 1n ? "-" : "";
  const exponent = Number((bits >> 52n) & 0x7ffn);
  const frac = bits & 0xf_ffff_ffff_ffffn;
  if (exponent === 0 || exponent === 0x7ff) {
    throw new Error(`javaHex fixture helper handles normal doubles only, got ${x}`);
  }
  return `${sign}0x1.${frac.toString(16).padStart(13, "0")}p${exponent - 1023}`;
}

export interface SyntheticGraph {
  readonly nodeIds: readonly number[];
  readonly nodeLon: readonly number[];
  readonly nodeLat: readonly number[];
  /** `[fromNodeId, toNodeId, lengthM, label, polyline]` in feature order. */
  readonly edges: readonly {
    readonly from: number;
    readonly to: number;
    readonly lengthM: number;
    readonly label: string;
    readonly polyline: readonly (readonly [number, number])[];
  }[];
}

/**
 * Six nodes, five edges, two components (nodes 1–4 plus the −1000/−1001 pair).
 * Edge 3's `from` endpoint is offset from its node coordinate on purpose.
 */
export function syntheticGraph(): SyntheticGraph {
  const nodeIds = [-1001, -1000, 11, 12, 13, 9_000_017];
  const nodeLon = [
    -122.68123456789012, -122.68223456789012, -122.67123456789012, -122.67223456789012,
    -122.67323456789012, -122.66123456789012,
  ];
  const nodeLat = [
    45.51123456789012, 45.51223456789012, 45.52123456789012, 45.52223456789012, 45.52323456789012,
    45.53123456789012,
  ];
  const at = (id: number): readonly [number, number] => {
    const i = nodeIds.indexOf(id);
    return [nodeLon[i]!, nodeLat[i]!];
  };
  return {
    nodeIds,
    nodeLon,
    nodeLat,
    edges: [
      // straight, no interior vertices
      { from: 11, to: 12, lengthM: 27.54329557054302, label: "NE RUSSELL ST", polyline: [at(11), at(12)] },
      // two interior vertices
      {
        from: 12,
        to: 13,
        lengthM: 197.01617693812506,
        label: "NE 13TH AVE",
        polyline: [at(12), [-122.6722, 45.5223] as const, [-122.6723, 45.5224] as const, at(13)],
      },
      // repeated label, exercises the name dictionary
      { from: 13, to: 9_000_017, lengthM: 1024.0009765625, label: "NE RUSSELL ST", polyline: [at(13), at(9_000_017)] },
      // endpoint exception: the polyline starts 1e-9 deg away from node 11
      {
        from: 11,
        to: 13,
        lengthM: 3.140000000000001,
        label: "SW UNNAMED RD",
        polyline: [[at(11)[0] + 1e-9, at(11)[1]] as const, at(13)],
      },
      // separate component
      { from: -1001, to: -1000, lengthM: 88.125, label: "NW BPA RD", polyline: [at(-1001), at(-1000)] },
    ],
  };
}

/** Write a synthetic graph out in the exporter's TSV dump format. */
export function writeSyntheticDump(dir: string, g: SyntheticGraph = syntheticGraph()): string {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const order = g.nodeIds.map((id, i) => ({ id, i })).sort((a, b) => a.id - b.id);
  const nodeRows = order.map(
    ({ id, i }) =>
      `${id}\t${g.nodeLon[i]!}\t${g.nodeLat[i]!}\t${javaHex(g.nodeLon[i]!)}\t${javaHex(g.nodeLat[i]!)}`,
  );
  writeFileSync(join(dir, "nodes.tsv"), `# id\tlon\tlat\tlon_hex\tlat_hex\n${nodeRows.join("\n")}\n`);

  const edgeRows = g.edges.map(
    (e, idx) =>
      `${idx}\t${e.from}\t${e.to}\t${javaHex(e.lengthM)}\t${e.lengthM}\t${e.polyline.length}\t${e.label}`,
  );
  writeFileSync(
    join(dir, "edges.tsv"),
    `# feature_idx\tfrom_node\tto_node\tlength_m_hex\tlength_m\tn_coords\tlabel\n${edgeRows.join("\n")}\n`,
  );

  // adjacency in feature order, one row per node, sorted by node id
  const adjacency = new Map<number, string[]>();
  for (const id of g.nodeIds) {
    adjacency.set(id, []);
  }
  g.edges.forEach((e, idx) => {
    adjacency.get(e.from)!.push(`${idx}:+:${e.to}`);
    adjacency.get(e.to)!.push(`${idx}:-:${e.from}`);
  });
  const adjRows = order.map(({ id }) => {
    const entries = adjacency.get(id)!;
    return `${id}\t${entries.length}\t${entries.join("\t")}`;
  });
  writeFileSync(join(dir, "adjacency.tsv"), `# node\tdegree\tentries\n${adjRows.join("\n")}\n`);

  const polyRows = g.edges.map(
    (e, idx) => `${idx}\t${e.polyline.length}\t${e.polyline.map(([x, y]) => `${x},${y}`).join("\t")}`,
  );
  writeFileSync(join(dir, "polylines.tsv"), `# feature_idx\tn_coords\tcoords\n${polyRows.join("\n")}\n`);

  const corrections = [
    {
      kind: "SPLIT",
      attr_node_id: 107665,
      graph_node_id: -1000,
      dist_from_primary_m: 8520.857705327313,
      lon: g.nodeLon[1]!,
      lat: g.nodeLat[1]!,
      first_feature: "NW BPA RD",
      claims: 1,
    },
    {
      kind: "REATTACHED",
      attr_node_id: 107679,
      graph_node_id: 11,
      dist_from_primary_m: 7146.9123,
      lon: g.nodeLon[2]!,
      lat: g.nodeLat[2]!,
      first_feature: "NE RUSSELL ST",
      claims: 1,
    },
  ];
  writeFileSync(
    join(dir, "corrections.tsv"),
    `# kind\tattr_node_id\tgraph_node_id\tdist_from_primary_m\tlon\tlat\tclaims\tfirst_feature\n${corrections
      .map(
        (c) =>
          `${c.kind}\t${c.attr_node_id}\t${c.graph_node_id}\t${c.dist_from_primary_m}\t${c.lon}\t${c.lat}\t${c.claims}\t${c.first_feature}`,
      )
      .join("\n")}\n`,
  );

  const vertices = g.edges.reduce((s, e) => s + e.polyline.length, 0);
  const census = {
    exporter: "synthetic fixture",
    features: g.edges.length,
    attr_node_ids: g.nodeIds.length - 2,
    final_graph_nodes: g.nodeIds.length,
    affected_attr_node_ids: corrections.length,
    sites_reattached: corrections.filter((c) => c.kind === "REATTACHED").length,
    sites_split_synthetic: corrections.filter((c) => c.kind === "SPLIT").length,
    impossible_edges_after_fix: 0,
    components: 2,
    largest_component_nodes: 4,
    undirected_street_edges: g.edges.length,
    directed_edge_records: 2 * g.edges.length,
    node_ids_negative: g.nodeIds.filter((n) => n < 0).length,
    max_degree: 3,
    polyline_vertices_total: vertices,
    corrections: corrections.map((c) => ({
      ...c,
      dist_from_primary_m: Math.round(c.dist_from_primary_m * 10) / 10,
      lon: Number(c.lon.toFixed(6)),
      lat: Number(c.lat.toFixed(6)),
    })),
  };
  writeFileSync(join(dir, "census.json"), `${JSON.stringify(census, null, 2)}\n`);
  return dir;
}
