// The catalogue of a shipped-artifact type (Labs, Interativos) has exactly ONE home:
// its frontend registry. It used to have two — the Worker kept a hand-copied
// LAB_REGISTRY/INTERATIVO_REGISTRY — and the labs copy fell seven entries behind in
// silence (k5, k6, k18-k22 live on the site, absent from Liberações, every test green).
//
// So this file is the LEDGER for the seam that replaced it: every caller reaches
// js/registry-sync.js, nobody hand-builds the payload, and the seed never leaks the
// client-only overlays.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const CONSUMERS = [
  ['content/releases.js', 'the Releases composer'],
  ['content/labs.js',     'Content > Labs'],
];

for (const [rel, label] of CONSUMERS) {
  test(`${label} (${rel}) syncs through the seam, not the raw facade`, () => {
    const src = read('../' + rel);
    assert.match(src, /from\s+['"][^'"]*registry-sync\.js['"]/, 'imports js/registry-sync.js');
    // The facade calls still EXIST (registry-sync makes them); what must not come back is a
    // consumer calling them directly, which is where a second payload shape would be born.
    assert.ok(!/\w+\.ensureLabItems\(/.test(src), 'does not call ensureLabItems directly on the facade');
    assert.ok(!/\w+\.ensureInterativoItems\(/.test(src), 'does not call ensureInterativoItems directly');
  });
}

test('only the seam builds the catalogue payload', () => {
  // Anyone else building { labs: [...] } by hand is a second catalogue in the making.
  const sync = read('../js/registry-sync.js');
  assert.match(sync, /ensureLabItems\(\{\s*labs:/, 'the seam builds the labs payload');
  assert.match(sync, /ensureInterativoItems\(\{\s*interativos:/, 'and the interativos one');
  for (const [rel] of CONSUMERS) {
    assert.ok(!/\{\s*labs:\s*/.test(read('../' + rel)), 'no consumer builds { labs: ... }');
  }
});

test('the facade forwards the payload instead of sending a fixed {}', () => {
  const src = read('../js/codex-api.js');
  // `() => call('ct_ensure_lab_items', {})` was what forced the Worker to hold the list.
  assert.ok(!/ensureLabItems:\s*\(\)\s*=>/.test(src), 'ensureLabItems accepts a parameter');
  assert.ok(!/ensureInterativoItems:\s*\(\)\s*=>/.test(src), 'ensureInterativoItems accepts a parameter');
});

test('the seed carries key/title/summary and nothing from the local overlays', async () => {
  // No comments: the file itself NAMES the forbidden accessors while explaining why it
  // doesn't use them, so checking the raw text would flag the explanation itself.
  const sync = read('../js/registry-sync.js').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  // orderedLabs()/getAllItems() apply ordering, archiving, and the admin's local rename.
  // Seeding with them would publish ONE browser's rename as everyone's title.
  assert.ok(!/orderedLabs|getAllItems|archivedLabs/.test(sync), 'seeds from the raw registry');
  assert.match(sync, /LABS/, 'reads the labs registry constant');
  assert.match(sync, /INTERATIVOS/, 'and the interativos one');

  const { LABS } = await import('../js/labs-registry.js');
  const { INTERATIVOS } = await import('../js/interativos-registry.js');
  for (const entry of [...LABS, ...INTERATIVOS]) {
    assert.match(entry.key, /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/, `key ${entry.key} passes the Worker's validation`);
    assert.ok(entry.title && entry.title.length <= 200, `title of ${entry.key} within the limit`);
  }
});

test('the 7 missing labs are in the registry that goes into the payload', async () => {
  const { LABS } = await import('../js/labs-registry.js');
  const keys = LABS.map((l) => l.key);
  for (const k of ['k5', 'k6', 'k18', 'k19', 'k20', 'k21', 'k22']) {
    assert.ok(keys.includes(k), `${k} is in the sent catalogue`);
  }
});
