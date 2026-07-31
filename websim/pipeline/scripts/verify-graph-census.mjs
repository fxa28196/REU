// SPIKE S2 -- prove the exported census is the SAME graph the archived
// production runs built: field-by-field diff of
//   websim/pipeline/out/graph-dump/census.json
// against street_network_validation in an archived simulation.json.
//
//   node websim/pipeline/scripts/verify-graph-census.mjs [archivedSimulationJson]

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repoRoot = resolve(join(import.meta.dirname, '..', '..', '..'));
const archivePath = resolve(process.argv[2] ??
  join(repoRoot, 'docs', 'runs', 'historical-reference', 'histref-n2037-seed42', 'simulation.json'));
const censusPath = join(import.meta.dirname, '..', 'out', 'graph-dump', 'census.json');

const archive = JSON.parse(readFileSync(archivePath, 'utf8')).street_network_validation;
const mine = JSON.parse(readFileSync(censusPath, 'utf8'));

const r1 = (v) => Math.round(v * 10) / 10;
let fails = 0;
const check = (label, a, b) => {
  const ok = a === b;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: archived=${a} exported=${b}`);
};

console.log(`archive: ${archivePath}\nexport : ${censusPath}\n`);
check('node_site_tolerance_m', archive.node_site_tolerance_m, mine.node_site_tolerance_m);
check('reattach_tolerance_m', archive.reattach_tolerance_m, mine.reattach_tolerance_m);
check('features', archive.features, mine.features);
check('attr_node_ids', archive.attr_node_ids, mine.attr_node_ids);
check('final_graph_nodes', archive.final_graph_nodes, mine.final_graph_nodes);
check('affected_attr_node_ids', archive.affected_attr_node_ids, mine.affected_attr_node_ids);
check('sites_reattached', archive.sites_reattached, mine.sites_reattached);
check('sites_split_synthetic', archive.sites_split_synthetic, mine.sites_split_synthetic);
check('impossible_edges_after_fix', archive.impossible_edges_after_fix, mine.impossible_edges_after_fix);
check('max_endpoint_gap_m (1dp)', archive.max_endpoint_gap_m, r1(mine.max_endpoint_gap_m));
check('components', archive.components, mine.components);
check('largest_component_nodes', archive.largest_component_nodes, mine.largest_component_nodes);
check('freeway features_excluded', archive.freeway_filter.features_excluded, mine.freeway_filter.features_excluded);
check('freeway km_excluded (1dp)', archive.freeway_filter.km_excluded, r1(mine.freeway_filter.km_excluded));
for (const t of Object.keys(archive.freeway_filter.by_type)) {
  check(`freeway by_type[${t}]`, archive.freeway_filter.by_type[t], mine.freeway_filter[`by_type`][t]);
}

// full correction census, in order
check('corrections length', archive.corrections.length, mine.corrections.length);
let corrFails = 0;
for (let i = 0; i < Math.min(archive.corrections.length, mine.corrections.length); i++) {
  const a = archive.corrections[i], b = mine.corrections[i];
  const same = a.kind === b.kind && a.attr_node_id === b.attr_node_id
    && a.graph_node_id === b.graph_node_id && a.claims === b.claims
    && a.first_feature === b.first_feature
    && a.dist_from_primary_m === b.dist_from_primary_m
    && a.lon === b.lon && a.lat === b.lat;
  if (!same) { corrFails++; console.log('FAIL  correction[' + i + ']\n  archived=' + JSON.stringify(a) + '\n  exported=' + JSON.stringify(b)); }
}
if (corrFails === 0) console.log(`PASS  all ${archive.corrections.length} corrections identical (kind, ids, displacement, lon/lat, claims, first_feature, ORDER)`);
fails += corrFails;

console.log(`\n${fails === 0 ? 'S2 CENSUS VERIFICATION: PASS' : `S2 CENSUS VERIFICATION: ${fails} FAILURE(S)`}`);
process.exit(fails === 0 ? 0 : 1);
