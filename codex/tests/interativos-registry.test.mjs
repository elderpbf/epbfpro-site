// codex/js/interativos-registry.js — the Codex-owned "Interativo" registry (sibling
// of labs-registry). Behavioral tests: INTERATIVOS data, findItem/getAllItems shape,
// the served-path contract, icons, and the single-source (i18n) type label.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const reg = await import('../js/interativos-registry.js');
const { t } = await import('../js/i18n.js');

const PREFIX = 'interativo:';

test('INTERATIVOS is the shipped registry (non-empty, unique keys, required fields)', () => {
  assert.ok(Array.isArray(reg.INTERATIVOS), 'INTERATIVOS is an array');
  assert.ok(reg.INTERATIVOS.length >= 1, 'at least one interativo shipped');
  const keys = reg.INTERATIVOS.map((x) => x.key);
  assert.equal(new Set(keys).size, keys.length, 'keys are unique');
  for (const it of reg.INTERATIVOS) {
    assert.ok(it.key && it.key.length, 'has a key');
    assert.ok(it.title && it.title.length, `${it.key} has a title`);
    assert.ok(it.summary && it.summary.length, `${it.key} has a summary`);
  }
});

test('demo-peca is present and resolves to its served path', () => {
  const it = reg.findItem('interativo:demo-peca');
  assert.ok(it, 'demo-peca resolves');
  assert.equal(it.id, 'interativo:demo-peca');
  assert.equal(it.type, 'interativo');
  assert.deepEqual(it.meta_json, { url: '/codex/interativos/demo-peca/' });
});

test('BASE_PATH is the served interativos root', () => {
  assert.equal(reg.BASE_PATH, '/codex/interativos/');
});

test('findItem builds the synthetic item shape only for interativo:<key> ids', () => {
  assert.equal(reg.findItem('interativo:nope'), null, 'unknown key');
  assert.equal(reg.findItem('lab:k1'), null, 'lab id');
  assert.equal(reg.findItem('42'), null, 'vault id');
  assert.equal(reg.findItem(''), null, 'empty');
  assert.equal(reg.findItem(null), null, 'null');
  assert.equal(reg.findItem(undefined), null, 'undefined');
});

test('type_label comes from the single i18n source (rename in one place)', () => {
  const it = reg.findItem('interativo:demo-peca');
  assert.equal(it.type_label, t('interativos.type'), 'label mirrors interativos.type');
  assert.ok(it.type_label && it.type_label.length, 'label is non-empty');
});

test('getAllItems returns every interativo in synthetic item shape', () => {
  const items = reg.getAllItems();
  assert.equal(items.length, reg.INTERATIVOS.length, 'one item per registry entry');
  assert.ok(items.every((i) => String(i.id).startsWith(PREFIX)), 'all ids prefixed');
  assert.ok(items.every((i) => i.type === 'interativo'), 'all typed interativo');
  assert.ok(items.every((i) => i.meta_json && /^\/codex\/interativos\/.+\/$/.test(i.meta_json.url)), 'each has a served url');
});

test('every item carries type_icon = interativoIcon(key); unknown key falls back to the family glyph', () => {
  const items = reg.getAllItems();
  assert.ok(items.every((i) => i.type_icon === reg.interativoIcon(i.id.slice(PREFIX.length))), 'icon matches accessor');
  assert.equal(reg.interativoIcon('nope-key'), 'glyph:compass', 'unknown key falls back to the family glyph');
});
