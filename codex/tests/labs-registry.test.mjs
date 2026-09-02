// codex/js/labs-registry.js, the Codex-owned PensoLabs registry (ES-module port
// of the legacy window.CVLabs). Exhaustive behavioral tests: LABS data, findItem,
// getAllItems, isLabEnabled and the enable/disable filtering contract.
//
// track-65 moved the four decisions out of localStorage and into the database, so the harness moved
// with them: the state is HYDRATED (js/labs-state.js, the same door the loader uses) instead of
// stubbed through a browser API the registry no longer touches. The writers now return promises, so
// they are awaited and the Worker call is stubbed.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const state = await import('../js/labs-state.js');
const reg = await import('../js/labs-registry.js');

// The current hydrated map, kept here so each helper patches one layer without dropping the others.
let _cur = {};
const ROW = { enabled: true, archived: false, display_name: null, sort_order: null };
function hydrate(patch) {
  _cur = {};
  for (const k of Object.keys(patch || {})) _cur[k] = Object.assign({}, ROW, patch[k]);
  state.hydrate(_cur);
}
function patch(key, fields) {
  _cur[key] = Object.assign({}, _cur[key] || ROW, fields);
  state.hydrate(_cur);
}
function reset() { hydrate({}); }

// The registry's writers go through the facade; capture the payload and answer ok, so a test can
// assert both the resulting state and the action that carried it.
const _calls = [];
globalThis.callWorker = (p) => {
  _calls.push(p);
  return Promise.resolve(p.action === 'ct_labs_state_set_order' ? { ok: true, keys: p.keys } : { ok: true, lab: {} });
};

// The four helpers the original tests were written against, re-expressed on the hydrated state.
// setEnabledMap keeps the "default-on map" shape (a key present only when OFF) because that is what
// the panel used to store and what the seed encodes.
function setEnabledMap(obj) {
  if (obj == null) { for (const k of Object.keys(_cur)) patch(k, { enabled: true }); return; }
  for (const k of Object.keys(_cur)) patch(k, { enabled: true });
  for (const k of Object.keys(obj)) patch(k, { enabled: obj[k] !== false });
}
function setOrder(arr) {
  for (const k of Object.keys(_cur)) patch(k, { sort_order: null });
  if (arr) arr.forEach((k, i) => patch(k, { sort_order: i }));
}
function setArchived(arr) {
  for (const k of Object.keys(_cur)) patch(k, { archived: false });
  if (arr) arr.forEach((k) => patch(k, { archived: true }));
}
function setRenamed(obj) {
  for (const k of Object.keys(_cur)) patch(k, { display_name: null });
  if (obj) for (const k of Object.keys(obj)) patch(k, { display_name: obj[k] });
}

const EXPECTED_KEYS = ['k1', 'k2', 'k4', 'k5', 'k6', 'k9', 'k10', 'k11', 'k12', 'k13', 'k15', 'k16', 'k17', 'k18', 'k19', 'k20', 'k21', 'k22'];

test('LABS is the shipped registry (18 labs, exact keys + non-empty title/summary)', () => {
  assert.ok(Array.isArray(reg.LABS), 'LABS is an array');
  assert.equal(reg.LABS.length, 18, 'eighteen labs, k3 retired 2026-09-02 in favour of k18');
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
  assert.equal(byKey.k5.title, 'Tokens');
  assert.equal(byKey.k5.summary, 'Palavra não é a mesma coisa que token');
  assert.equal(byKey.k6.title, 'Embeddings');
  assert.equal(byKey.k6.summary, 'Sentido tem geometria');
  assert.equal(byKey.k20.title, 'Aposta na Citação');
  assert.equal(byKey.k20.summary, 'Soa correto não é prova de que é real');
  assert.equal(byKey.k21.title, 'Modelo e Esforço');
  assert.equal(byKey.k21.summary, 'Não soube ou não se esforçou?');
  assert.equal(byKey.k10.title, 'Cápsula do GPT');
  assert.equal(byKey.k13.summary, 'Tradicional, raciocínio e agêntico são formatos diferentes');
  assert.equal(byKey.k15.title, 'Sobreajuste');
  assert.equal(byKey.k15.summary, 'Repetição fortalece o peso, até virar decoreba');
  assert.equal(byKey.k16.title, 'PDF e OCR');
  assert.equal(byKey.k16.summary, 'Duas camadas de um PDF, e o que o OCR faz entre elas');
  assert.equal(byKey.k17.title, 'Treinamento');
  assert.equal(byKey.k17.summary, 'Humano prefere uma resposta a outra; a preferida reforça o peso');
  assert.equal(byKey.k19.title, 'Framework CORE');
  assert.equal(byKey.k19.summary, 'Contexto, Objetivo, Regras e Estrutura mudam a resposta');
  assert.equal(byKey.k22.title, 'Próximo Token');
  assert.equal(byKey.k22.summary, 'Não é pensamento, é probabilidade');
});

test('findItem builds the synthetic item shape for a real lab id', () => {
  const it = reg.findItem('lab:k18');
  assert.equal(it.id, 'lab:k18');
  assert.equal(it.type, 'lab');
  assert.equal(it.type_label, 'Lab');
  assert.equal(it.title, 'Janela de contexto');  // k18 kept the name k3 used to carry
  assert.equal(it.summary, 'Tudo que ocupa a janela, do sistema à resposta');
  assert.deepEqual(it.meta_json, { url: '/codex/labs/k18/' });
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

// The public Trail imports this file (trilha/js/lab-overlay.js) and never loads the state, and a
// Worker that is down must leave the admin with a full panel, not a blank one. So "no state" is
// every lab on, unarchived, registry name, registry order. What actually protects a switched-off
// lab is the server refusing it, not this.
test('with no state loaded at all, every reader answers the registry default', () => {
  state.resetLabState();
  assert.equal(state.isLabStateLoaded(), false);
  assert.equal(reg.isLabEnabled('k1'), true, 'unknown state = enabled');
  assert.equal(reg.isLabArchived('k1'), false, 'unknown state = not archived');
  assert.equal(reg.isLabRenamed('k1'), false, 'unknown state = no override');
  assert.equal(reg.orderedLabs().length, 18, 'the whole registry is visible');
  assert.deepEqual(reg.orderedLabs().map((l) => l.key), EXPECTED_KEYS, 'in registry order');
  reset();
});

test('getAllItems returns every enabled lab as a picker item', () => {
  setEnabledMap(null);
  const items = reg.getAllItems();
  assert.equal(items.length, 18, 'all labs when none disabled');
  assert.deepEqual(items.map((i) => i.id), EXPECTED_KEYS.map((k) => 'lab:' + k));
  assert.ok(items.every((i) => i.type === 'lab' && i.type_label === 'Lab'));
});

test('getAllItems filters out disabled labs', () => {
  setEnabledMap({ k1: false, k13: false });
  const items = reg.getAllItems();
  assert.equal(items.length, 16, 'two disabled removed');
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

test('labIcon returns the per-lab glyph (echoing the emoji), falling back to the flask glyph', () => {
  assert.equal(reg.labIcon('k15'), 'glyph:brain');
  assert.equal(reg.labIcon('k16'), 'glyph:file-text');
  assert.equal(reg.labIcon('k22'), 'glyph:bar-chart');
  assert.equal(reg.labIcon('nope'), 'glyph:flask', 'unknown key falls back to the flask glyph');
});

test('findItem / getAllItems carry type_icon = labIcon(key)', () => {
  setEnabledMap(null);
  assert.equal(reg.findItem('lab:k15').type_icon, 'glyph:brain');
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

// One call carries the whole list, on purpose: a drag is one fact, and an order written lab by lab
// can stop halfway and leave something that reads back as valid and that no retry repairs.
test('setLabOrder sends the whole order in ONE call and orderedLabs follows it', async () => {
  _calls.length = 0;
  await reg.setLabOrder(['k4', 'k16']);
  assert.equal(_calls.length, 1, 'one write, not one per lab');
  assert.equal(_calls[0].action, 'ct_labs_state_set_order');
  assert.deepEqual(_calls[0].keys, ['k4', 'k16']);
  assert.deepEqual(reg.orderedLabs().map((l) => l.key).slice(0, 2), ['k4', 'k16']);
  setOrder(null);
});

// The switch must never sit in a position the database refused: the cache goes back and the caller
// is told, instead of the panel quietly showing a value that was never saved.
test('a refused write rolls the state back and rejects', async () => {
  hydrate({ k1: { enabled: true } });
  globalThis.callWorker = () => Promise.resolve({ error: 'no_auth' });
  await assert.rejects(() => reg.setLabEnabled('k1', false));
  assert.equal(reg.isLabEnabled('k1'), true, 'back to what the server holds');
  globalThis.callWorker = (p) => { _calls.push(p); return Promise.resolve({ ok: true, lab: {} }); };
  reset();
});

test('getAllItems follows the stored order (filtered to enabled labs)', () => {
  setEnabledMap({ k1: false });
  setOrder(['k16', 'k1', 'k2']);
  const ids = reg.getAllItems().map((i) => i.id);
  assert.deepEqual(ids.slice(0, 2), ['lab:k16', 'lab:k2'], 'k1 stays disabled-hidden even though it is in the stored order');
  setOrder(null);
  setEnabledMap(null);
});

test('isLabArchived defaults false; setLabArchived toggles it through the Worker', async () => {
  reset();
  assert.equal(reg.isLabArchived('k16'), false, 'no decision = not archived');
  _calls.length = 0;
  await reg.setLabArchived('k16', true);
  assert.equal(reg.isLabArchived('k16'), true, 'archived after set true');
  assert.equal(_calls[0].action, 'ct_labs_state_set');
  assert.deepEqual({ lab_key: _calls[0].lab_key, archived: _calls[0].archived }, { lab_key: 'k16', archived: true });
  await reg.setLabArchived('k16', false);
  assert.equal(reg.isLabArchived('k16'), false, 'restored after set false');
  reset();
});

// The write is a FIELD now, not an append to a list, so archiving twice cannot leave two entries.
test('setLabArchived is idempotent', async () => {
  reset();
  await reg.setLabArchived('k16', true);
  await reg.setLabArchived('k16', true);
  assert.equal(reg.isLabArchived('k16'), true);
  assert.equal(reg.archivedLabs().filter((l) => l.key === 'k16').length, 1, 'archiving twice lists it once');
  reset();
});

// The rail flips one field from a list that knows nothing about the rename or the order. Losing them
// on every toggle is the reason the write is per-field rather than a whole-row replace.
test('a write touches only its own field', async () => {
  reset();
  await reg.setLabTitle('k16', 'Janela curta');
  await reg.setLabOrder(['k16', 'k1']);
  await reg.setLabEnabled('k16', false);
  assert.equal(reg.isLabRenamed('k16'), true, 'the rename survived the reorder and the switch');
  assert.equal(reg.labOrderIndex('k16'), 0, 'the position survived the switch');
  assert.equal(reg.isLabEnabled('k16'), false, 'and the switch itself landed');
  assert.equal(reg.archivedLabs().length, 0, 'none of it archived anything');
  reset();
});

test('orderedLabs drops archived labs; archivedLabs returns exactly them', () => {
  setOrder(null);
  setArchived(['k16', 'k9']);
  const active = reg.orderedLabs().map((l) => l.key);
  assert.ok(!active.includes('k16') && !active.includes('k9'), 'archived hidden from the active list');
  assert.equal(active.length, EXPECTED_KEYS.length - 2, 'two fewer active labs');
  assert.deepEqual(reg.archivedLabs().map((l) => l.key).sort(), ['k16', 'k9'], 'archivedLabs returns the archived ones');
  setArchived(null);
});

test('getAllItems (Presets/Lessons picker) excludes archived labs', () => {
  setEnabledMap(null);
  setArchived(['k1']);
  const ids = reg.getAllItems().map((i) => i.id);
  assert.ok(!ids.includes('lab:k1'), 'archived lab absent from the picker');
  assert.equal(ids.length, EXPECTED_KEYS.length - 1);
  setArchived(null);
});

test('findItem still resolves an archived lab by id (a lesson may reference it)', () => {
  setArchived(['k16']);
  assert.ok(reg.findItem('lab:k16'), 'archived lab still resolves by id');
  setArchived(null);
});

test('archivedLabs honours the stored order basis', () => {
  setOrder(['k9', 'k16']);
  setArchived(['k16', 'k9']);
  assert.deepEqual(reg.archivedLabs().map((l) => l.key), ['k9', 'k16'], 'archived list follows the same order');
  setOrder(null);
  setArchived(null);
});

test('labDefaultTitle returns the registry title regardless of any override', () => {
  setRenamed(null);
  assert.equal(reg.labDefaultTitle('k1'), 'Atenção!');
  setRenamed({ k1: 'Atenção customizado' });
  assert.equal(reg.labDefaultTitle('k1'), 'Atenção!', 'unaffected by an active override');
  setRenamed(null);
});

test('isLabRenamed defaults false; setLabTitle sets an override and orderedLabs/findItem/getAllItems all reflect it', async () => {
  setRenamed(null);
  assert.equal(reg.isLabRenamed('k1'), false, 'no override = not renamed');
  await reg.setLabTitle('k1', 'Foco Contextual');
  assert.equal(reg.isLabRenamed('k1'), true);
  assert.equal(reg.orderedLabs().find((l) => l.key === 'k1').title, 'Foco Contextual', 'orderedLabs carries the override');
  assert.equal(reg.findItem('lab:k1').title, 'Foco Contextual', 'findItem carries the override');
  assert.equal(reg.getAllItems().find((i) => i.id === 'lab:k1').title, 'Foco Contextual', 'getAllItems carries the override');
  setRenamed(null);
});

test('setLabTitle trims whitespace before sending it', async () => {
  setRenamed(null);
  _calls.length = 0;
  await reg.setLabTitle('k1', '  Foco Contextual  ');
  assert.equal(_calls[0].display_name, 'Foco Contextual');
  setRenamed(null);
});

test('setLabTitle with blank or the default title clears the override instead of storing it', async () => {
  setRenamed({ k1: 'Foco Contextual' });
  _calls.length = 0;
  await reg.setLabTitle('k1', '');
  assert.equal(reg.isLabRenamed('k1'), false, 'blank clears the override');
  assert.equal(_calls[0].display_name, null, 'and the Worker is told to clear it, not to store ""');
  await reg.setLabTitle('k1', 'Atenção!');
  assert.equal(reg.isLabRenamed('k1'), false, 'same-as-default clears the override too');
  setRenamed(null);
});

test('archived and disabled labs can still be renamed (rename is independent of visibility state)', async () => {
  setArchived(['k16']);
  setEnabledMap({ k9: false });
  await reg.setLabTitle('k16', 'Janela Nova');
  await reg.setLabTitle('k9', 'Petição Nova');
  assert.equal(reg.archivedLabs().find((l) => l.key === 'k16').title, 'Janela Nova');
  assert.equal(reg.findItem('lab:k9').title, 'Petição Nova');
  setRenamed(null);
  setArchived(null);
  setEnabledMap(null);
});

test('a rename override for a key no longer in the registry is simply unused (no crash)', () => {
  setRenamed({ ghost: 'Fantasma' });
  assert.doesNotThrow(() => reg.orderedLabs());
  assert.equal(reg.orderedLabs().some((l) => l.title === 'Fantasma'), false);
  setRenamed(null);
});

// A retired key must NOT resolve, and this is the whole retirement mechanism: trilha/js/lab-overlay
// drops a released lab whose key no longer answers, so removing the entry here is what pulls the lab
// out of every cohort that already had it. k3 "Janela de contexto" was retired 2026-09-02 because
// k18 supersedes it (Élder: "k3 pode apagar, já tem um superior"), following the k14 precedent.
test('a retired lab key resolves to nothing, which is what removes it everywhere', () => {
  assert.equal(reg.findItem('lab:k3'), null, 'k3 retired 2026-09-02, superseded by k18');
  assert.equal(reg.findItem('lab:k14'), null, 'k14 retired earlier, same path');
  assert.equal(reg.LABS.some((l) => l.key === 'k3'), false, 'and it is gone from the registry');
  assert.equal(reg.labIcon('k3'), 'glyph:flask', 'its glyph entry went with it');
});
