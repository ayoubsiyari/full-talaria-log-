import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseRealmTag,
  classifyRealmRows,
  assessRealmSurvival,
  summarizeRealmSurvival,
  realmSurvivalEnabled,
  formatRealmSurvival,
  REALM_SURVIVAL_DISABLE_ENV,
} from '../lib/realm-survival.mjs';

test('unit: a realm tag parses into cycle, panel, host and dataset', () => {
  const tag = parseRealmTag('REALMTAG|cycle=3|panel=B|host=false|file=673|tf=1m|t=123');
  assert.deepEqual(tag, {
    cycle: 3, panel: 'B', host: false, fileId: '673', timeframe: '1m',
  });
});

test('unit: a non-tag string is not mistaken for a realm tag', () => {
  assert.equal(parseRealmTag('panel=B'), null);
  assert.equal(parseRealmTag(''), null);
  assert.equal(parseRealmTag(null), null);
});

test('unit: an inspector-only realm is not counted as a product leak', () => {
  const { counts, peerProductRetained, peerInspectorRetained } = classifyRealmRows([
    { label: 'host', host: true, live: true, reachable: true, reachableWithoutInspector: true },
    { label: 'c1/B', reachable: true, reachableWithoutInspector: false },
    { label: 'c2/C', reachable: false, reachableWithoutInspector: false },
  ]);
  assert.equal(counts.live, 1);
  assert.equal(counts['inspector-retained'], 1);
  assert.equal(counts.collected, 1);
  assert.equal(peerProductRetained.length, 0);
  assert.equal(peerInspectorRetained.length, 1);
});

test('unit: a product-reachable torn-down peer realm fails the gate', () => {
  const census = {
    realmsFound: 3,
    ...classifyRealmRows([
      { label: 'host', host: true, live: true, reachable: true, reachableWithoutInspector: true },
      { label: 'c1/B', panel: 'B', cycle: 1, reachable: true, reachableWithoutInspector: true, path: 'Chart--x' },
      { label: 'c2/C', panel: 'C', cycle: 2, reachable: true, reachableWithoutInspector: false },
    ]),
  };
  const assessment = assessRealmSurvival(census);
  assert.equal(assessment.ok, false);
  assert.equal(assessment.verdict, 'PEER-REALM-SURVIVES-TEARDOWN');
  assert.equal(assessment.peerProductRetained, 1);
  assert.equal(assessment.inspectorRetainedNotGraded, 1);
  assert.equal(assessment.survivors[0].panel, 'B');
});

test('unit: inspector-held realms alone still pass — the gate must not fail on its own attachment', () => {
  const census = {
    realmsFound: 3,
    ...classifyRealmRows([
      { label: 'host', host: true, live: true, reachable: true, reachableWithoutInspector: true },
      { label: 'c1/B', reachable: true, reachableWithoutInspector: false },
      { label: 'c2/B', reachable: true, reachableWithoutInspector: false },
    ]),
  };
  const assessment = assessRealmSurvival(census);
  assert.equal(assessment.ok, true);
  assert.equal(assessment.verdict, 'NO-PEER-REALM-SURVIVES');
  assert.equal(assessment.inspectorRetainedNotGraded, 2);
  assert.match(assessment.reason, /inspector/);
});

test('unit: an empty snapshot is NO-DATA rather than a clean pass', () => {
  assert.equal(assessRealmSurvival(null).verdict, 'NO-DATA');
  assert.equal(assessRealmSurvival({ realmsFound: 0 }).ok, false);
});

test('unit: the kill switch is off by default and honoured when set', () => {
  assert.equal(realmSurvivalEnabled({}), true);
  assert.equal(realmSurvivalEnabled({ [REALM_SURVIVAL_DISABLE_ENV]: '1' }), false);
  assert.equal(realmSurvivalEnabled({ [REALM_SURVIVAL_DISABLE_ENV]: '0' }), true);
});

/**
 * Minimal snapshot: root -> host NativeContext -> host Window, host Window
 * -> Chart -> Map(from peer realm) -> peer NativeContext -> peer Window, plus a
 * second peer reachable only through a 'DevTools console' global handle.
 */
function buildSnapshot() {
  const strings = [
    '', 'root', '(GC roots)', 'system / NativeContext / http://host', 'Window [JSGlobalObject] / http://host',
    'Chart', 'Map', 'system / NativeContext', 'Window [JSGlobalObject]', 'mainChart',
    '_mcHostCacheFileRefOwners', 'global_object', 'constructor', '41 / DevTools console', 'Error',
    'REALMTAG|cycle=1|panel=B|host=false|file=673|tf=1m|t=1', '__TALARIA_REALM_TAG__',
    'REALMTAG|cycle=2|panel=C|host=false|file=670|tf=1m|t=2',
    'REALMTAG|cycle=9|panel=A|host=true|file=677|tf=1m|t=3', 'get stack', 'system / NativeContext ',
  ];
  const S = (s) => strings.indexOf(s);
  // node: [type, name, id, self_size, edge_count, detachedness]
  const nodeDefs = [
    ['synthetic', 'root'],            // 0
    ['synthetic', '(GC roots)'],       // 1
    ['hidden', 'system / NativeContext / http://host'], // 2
    ['object', 'Window [JSGlobalObject] / http://host'], // 3
    ['object', 'Chart'],              // 4
    ['object', 'Map'],                // 5  (built in peer B's realm)
    ['hidden', 'system / NativeContext'], // 6  peer B context
    ['object', 'Window [JSGlobalObject]'], // 7  peer B window
    ['object', 'Error'],              // 8  inspector-held error from peer C
    ['hidden', 'system / NativeContext '], // 9 peer C context
    ['object', 'Window [JSGlobalObject]'], // 10 peer C window
    ['string', 'REALMTAG|cycle=1|panel=B|host=false|file=673|tf=1m|t=1'], // 11
    ['string', 'REALMTAG|cycle=2|panel=C|host=false|file=670|tf=1m|t=2'], // 12
    ['string', 'REALMTAG|cycle=9|panel=A|host=true|file=677|tf=1m|t=3'], // 13
  ];
  const edgeDefs = [
    [0, [['element', '(GC roots)', 1], ['shortcut', 'global_object', 2]]],
    [1, [['internal', '41 / DevTools console', 8]]],
    [2, [['internal', 'global_object', 3]]],
    [3, [['property', 'mainChart', 4], ['property', '__TALARIA_REALM_TAG__', 13]]],
    [4, [['property', '_mcHostCacheFileRefOwners', 5]]],
    [5, [['property', 'constructor', 6]]],
    [6, [['internal', 'global_object', 7]]],
    [7, [['property', '__TALARIA_REALM_TAG__', 11]]],
    [8, [['property', 'get stack', 9]]],
    [9, [['internal', 'global_object', 10]]],
    [10, [['property', '__TALARIA_REALM_TAG__', 12]]],
    [11, []], [12, []], [13, []],
  ];
  const nodeTypes = ['hidden', 'array', 'string', 'object', 'code', 'closure', 'regexp', 'number', 'native', 'synthetic', 'concatenated string', 'sliced string', 'symbol', 'bigint'];
  const edgeTypes = ['context', 'element', 'property', 'internal', 'hidden', 'shortcut', 'weak'];
  const nodes = [];
  const edges = [];
  const byNode = new Map(edgeDefs);
  nodeDefs.forEach(([type, name], i) => {
    const outs = byNode.get(i) || [];
    nodes.push(nodeTypes.indexOf(type), S(name), i + 1, 16, outs.length, 0);
  });
  nodeDefs.forEach((_, i) => {
    for (const [et, name, to] of byNode.get(i) || []) {
      edges.push(edgeTypes.indexOf(et), S(name), to * 6);
    }
  });
  return {
    snapshot: {
      meta: {
        node_fields: ['type', 'name', 'id', 'self_size', 'edge_count', 'detachedness'],
        node_types: [nodeTypes, 'string', 'number', 'number', 'number', 'number'],
        edge_fields: ['type', 'name_or_index', 'to_node'],
        edge_types: [edgeTypes, 'string_or_number', 'node'],
      },
      node_count: nodeDefs.length,
      edge_count: edges.length / 3,
    },
    nodes,
    edges,
    strings,
  };
}

test('integration: the product path is named and the inspector path is separated', () => {
  const census = summarizeRealmSurvival(buildSnapshot());
  assert.equal(census.identity, 'realm-tags');
  assert.equal(census.realmsFound, 3);

  const byLabel = new Map(census.rows.map((r) => [r.label, r]));
  const peerB = byLabel.get('cycle1/panelB');
  const peerC = byLabel.get('cycle2/panelC');
  assert.equal(peerB.reachableWithoutInspector, true, 'B is held by the product');
  assert.equal(peerC.reachableWithoutInspector, false, 'C is held only by the inspector');
  assert.match(peerB.path, /_mcHostCacheFileRefOwners/);

  const assessment = assessRealmSurvival(census);
  assert.equal(assessment.ok, false);
  assert.equal(assessment.peerProductRetained, 1);
  assert.equal(assessment.inspectorRetainedNotGraded, 1);
  assert.match(formatRealmSurvival(census, assessment), /SURVIVOR cycle1\/panelB/);
});

test('integration: an untagged snapshot still counts realms by bare window', () => {
  const snap = buildSnapshot();
  // Drop the tags: identity falls back to counting bare windows.
  snap.strings = snap.strings.map((s) => (s.startsWith('REALMTAG|') ? 'plain string' : s));
  const census = summarizeRealmSurvival(snap);
  assert.equal(census.identity, 'bare-window-count');
  assert.ok(census.realmsFound >= 2);
});
