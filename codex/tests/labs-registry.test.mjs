// codex/js/labs-registry.js — the Codex-owned PensoLabs registry (ES-module port
// of the legacy window.CVLabs). Exhaustive behavioral tests: LABS data, findItem,
// getAllItems, isLabEnabled and the enable/disable filtering contract.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// In-memory localStorage stub (isLabEnabled reads localStorage). Installed before
// importing the module so the import-time module body sees it.
const _store = new Map();
globalThis.localStorage = {
  getItem: (k) => (_store.has(k) ? _store.get(k) : null),
  setItem: (k, v) => { _store.set(k, String(v)); },
  removeItem: (k) => { _store.delete(k); },
  clear: () => { _store.clear(); },
};
function setEnabledMap(obj) {
  if (obj == null) _store.delete('cv_labs_enabled');
  else _store.set('cv_labs_enabled', typeof obj === 'string' ? obj : JSON.stringify(obj));
}
function setOrder(arr) {
  if (arr == null) _store.delete('cv_labs_order');
  else _store.set('cv_labs_order', JSON.stringify(arr));
}

const reg = await import('../js/labs-registry.js');

const EXPECTED_KEYS = ['k1', 'k2', 'k3', 'k4', 'k9', 'k10', 'k11', 'k12', 'k13', 'k15', 'k16', 'k17'];

test('LABS is the frozen shipped registry (12 labs, exact keys + non-empty title/summary)', () => {
  assert.ok(Array.isArray(reg.LABS), 'LABS is an array');
  assert.equal(reg.LABS.length, 12, 'twelve labs');
  assert.deepEqual(reg.LABS.map((l) => l.key), EXPECTED_KEYS, 'keys byte-identical and in order');
  for (const lab of reg.LABS) {
    assert.ok(lab.title && lab.title.length, `lab ${lab.key} has a title`);
    assert.ok(lab.summary && lab.summary.length, `lab ${lab.key} has a summary`);
  }
});

test('LABS preserves the accented Portuguese strings verbatim', () => {
  const byKey = Object.fromEntries(reg.LABS.map((l) => [l.key, l]));
  assert.equal(byKey.k1.title, 'Atenção!');
  assert.equal(byKey.k1.summary, 'Contexto reescreve significado');
  assert.equal(byKey.k10.title, 'Cápsula do GPT');
  assert.equal(byKey.k13.summary, 'Tradicional, raciocínio e agêntico são formatos diferentes');
  assert.equal(byKey.k15.title, 'Sinapse');
  assert.equal(byKey.k15.summary, 'Repetição fortalece o peso, até virar decoreba');
  assert.equal(byKey.k16.title, 'PDF: imagem ou texto?');
  assert.equal(byKey.k16.summary, 'Duas camadas de um PDF, e o que o OCR faz entre elas');
  assert.equal(byKey.k17.title, 'Preferência');
  assert.equal(byKey.k17.summary, 'Humano prefere uma resposta a outra; a preferida reforça o peso');
});

test('findItem builds the synthetic item shape for a real lab id', () => {
  const it = reg.findItem('lab:k3');
  assert.equal(it.id, 'lab:k3');
  assert.equal(it.type, 'lab');
  assert.equal(it.type_label, 'Lab');
  assert.equal(it.title, 'Janela de contexto');
  assert.equal(it.summary, 'Orçamento de tokens e compactação');
  assert.deepEqual(it.meta_json, { url: '/codex/labs/k3/' });
});

test('findItem rejects non-lab, unknown and empty ids', () => {
  assert.equal(reg.findItem('lab:nope'), null, 'unknown key');
  assert.equal(reg.findItem('42'), null, 'numeric vault id');
  assert.equal(reg.findItem('drive:abc'), null, 'drive id');
  assert.equal(reg.findItem(''), null, 'empty');
  assert.equal(reg.findItem(null), null, 'null');
  assert.equal(reg.findItem(undefined), null, 'undefined');
});

test('isLabEnabled defaults on (missing key / empty map / unlisted key)', () => {
  setEnabledMap(null);
  assert.equal(reg.isLabEnabled('k1'), true, 'no map = enabled');
  setEnabledMap({});
  assert.equal(reg.isLabEnabled('k1'), true, 'empty map = enabled');
  setEnabledMap({ k2: false });
  assert.equal(reg.isLabEnabled('k1'), true, 'unlisted key = enabled');
});

test('isLabEnabled treats only an explicit false as disabled', () => {
  setEnabledMap({ k1: false });
  assert.equal(reg.isLabEnabled('k1'), false, 'explicit false = disabled');
  setEnabledMap({ k1: true });
  assert.equal(reg.isLabEnabled('k1'), true, 'explicit true = enabled');
});

test('isLabEnabled tolerates malformed JSON (fails open)', () => {
  setEnabledMap('{not valid json');
  assert.equal(reg.isLabEnabled('k1'), true, 'parse error = enabled');
  setEnabledMap(null);
});

test('getAllItems returns every enabled lab as a picker item', () => {
  setEnabledMap(null);
  const items = reg.getAllItems();
  assert.equal(items.length, 12, 'all labs when none disabled');
  assert.deepEqual(items.map((i) => i.id), EXPECTED_KEYS.map((k) => 'lab:' + k));
  assert.ok(items.every((i) => i.type === 'lab' && i.type_label === 'Lab'));
});

test('getAllItems filters out disabled labs', () => {
  setEnabledMap({ k1: false, k13: false });
  const items = reg.getAllItems();
  assert.equal(items.length, 10, 'two disabled removed');
  const ids = items.map((i) => i.id);
  assert.ok(!ids.includes('lab:k1'), 'k1 hidden');
  assert.ok(!ids.includes('lab:k13'), 'k13 hidden');
  assert.ok(ids.includes('lab:k2'), 'k2 still present');
  setEnabledMap(null);
});

test('findItem ignores the enabled map (resolution is independent of visibility)', () => {
  // A disabled lab still resolves by id (an existing lesson can reference it);
  // only the picker/index lists honour isLabEnabled via getAllItems.
  setEnabledMap({ k1: false });
  assert.ok(reg.findItem('lab:k1'), 'disabled lab still resolves by id');
  setEnabledMap(null);
});

test('labIcon returns the per-lab emoji, falling back to the flask glyph', () => {
  assert.equal(reg.labIcon('k15'), '🧠');
  assert.equal(reg.labIcon('k16'), '📄');
  assert.equal(reg.labIcon('nope'), 'glyph:flask', 'unknown key falls back to the flask glyph');
});

test('findItem / getAllItems carry type_icon = labIcon(key)', () => {
  setEnabledMap(null);
  assert.equal(reg.findItem('lab:k15').type_icon, '🧠');
  const items = reg.getAllItems();
  assert.ok(items.every((i) => i.type_icon === reg.labIcon(i.id.slice(4))), 'every synthetic item carries its own icon');
});

test('orderedLabs defaults to registry order (no stored order)', () => {
  setOrder(null);
  assert.deepEqual(reg.orderedLabs().map((l) => l.key), EXPECTED_KEYS);
});

test('orderedLabs honours a stored order, appending labs missing from it', () => {
  setOrder(['k16', 'k1']);
  const keys = reg.orderedLabs().map((l) => l.key);
  assert.deepEqual(keys.slice(0, 2), ['k16', 'k1'], 'stored order wins for the labs it names');
  assert.deepEqual(keys.slice(2), EXPECTED_KEYS.filter((k) => k !== 'k16' && k !== 'k1'), 'the rest keep registry order');
  setOrder(null);
});

test('orderedLabs drops stale keys no longer in the registry', () => {
  setOrder(['ghost', 'k2', 'k1']);
  assert.deepEqual(reg.orderedLabs().map((l) => l.key).slice(0, 2), ['k2', 'k1']);
  setOrder(null);
});

test('labOrderIndex mirrors orderedLabs, -1 for an unknown key', () => {
  setOrder(['k16', 'k1']);
  assert.equal(reg.labOrderIndex('k16'), 0);
  assert.equal(reg.labOrderIndex('k1'), 1);
  assert.equal(reg.labOrderIndex('ghost'), -1);
  setOrder(null);
});

test('setLabOrder persists to the same cv_labs_order key orderedLabs reads', () => {
  reg.setLabOrder(['k4', 'k3']);
  assert.deepEqual(JSON.parse(_store.get('cv_labs_order')), ['k4', 'k3']);
  assert.deepEqual(reg.orderedLabs().map((l) => l.key).slice(0, 2), ['k4', 'k3']);
  setOrder(null);
});

test('getAllItems follows the stored order (filtered to enabled labs)', () => {
  setEnabledMap({ k1: false });
  setOrder(['k16', 'k1', 'k2']);
  const ids = reg.getAllItems().map((i) => i.id);
  assert.deepEqual(ids.slice(0, 2), ['lab:k16', 'lab:k2'], 'k1 stays disabled-hidden even though it is in the stored order');
  setOrder(null);
  setEnabledMap(null);
});
