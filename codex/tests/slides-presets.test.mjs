// slides-presets.test.mjs — the built-in THEME presets (theme/presets.js): the seed
// colour swatches (teal + blue) and the picker DATA that applies one. DOM-free,
// node:test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, getPreset, presetSwatch, presetMenu, snapshotTheme, applyThemeFields } from '../content/slides/js/theme/presets.js';

test('the seed swatches Élder asked for are present: teal + blue', () => {
  assert.ok(PRESETS.length >= 2);
  for (const id of ['teal', 'blue']) assert.ok(getPreset(id), `expected preset ${id}`);
});
test('every preset is a full colour bundle (accent/ink/motif + a label key)', () => {
  for (const p of PRESETS) {
    assert.equal(typeof p.id, 'string');
    assert.match(p.accent, /^#[0-9a-f]{6}$/i);
    assert.match(p.ink, /^#[0-9a-f]{6}$/i);
    assert.match(p.motif, /^#[0-9a-f]{6}$/i);
    assert.ok(p.labelKey && p.labelKey.startsWith('slides.'));
  }
});
test('the teal preset matches the current default deck colours (so picking it is a no-op visually)', () => {
  const teal = getPreset('teal');
  assert.equal(teal.accent, '#14b8a6');
  assert.equal(teal.ink, '#134e4a');
  assert.equal(teal.motif, '#14b8a6');
});
test('getPreset returns null for an unknown id', () => {
  assert.equal(getPreset('nope'), null);
});
test('presetSwatch is a gradient of the accent into its own dark shade', () => {
  assert.match(presetSwatch(getPreset('blue')), /^linear-gradient\(135deg, #2563eb, color-mix\(in srgb, #2563eb 70%, #000\)\)$/);
});
test('presetMenu returns one swatch button per preset, marking the current accent on', () => {
  const m = presetMenu('#2563eb');
  assert.equal(m.length, PRESETS.length);
  assert.ok(m.every((c) => c.type === 'button' && c.swatch && typeof c.run === 'function'));
  assert.deepEqual(m.map((c) => c.id), PRESETS.map((p) => 'preset-' + p.id));
  assert.equal(m.filter((c) => c.on).length, 1);
  assert.equal(m.find((c) => c.on).id, 'preset-blue');
});
test('a preset button applies the whole colour bundle in one step', () => {
  const calls = [];
  const app = { applyPreset: (p) => calls.push(p.id) };
  presetMenu('#14b8a6').find((c) => c.id === 'preset-blue').run(app);
  assert.deepEqual(calls, ['blue']);
});

/* ---------- saved themes: snapshot + apply ---------- */
test('snapshotTheme captures the look fields and deep-clones them', () => {
  const theme = { accent: '#111111', ink: '#222222', motif: '#333333', art: 'neural', font: 'raleway', fontScale: 1.1, anim: 'fade', texto: { papeis: { title: { size: 1.2 } } }, junk: 'ignore' };
  const snap = snapshotTheme(theme);
  assert.deepEqual(Object.keys(snap).sort(), ['accent', 'anim', 'art', 'font', 'fontScale', 'ink', 'motif', 'texto']);
  assert.equal(snap.junk, undefined);
  // deep clone: mutating the live theme does not change the snapshot
  theme.texto.papeis.title.size = 2;
  assert.equal(snap.texto.papeis.title.size, 1.2);
});
test('applyThemeFields copies a saved theme back onto a live theme (deep-cloned)', () => {
  const saved = { accent: '#abcdef', art: 'nenhum', texto: { papeis: { topic: { weight: 700 } } } };
  const live = { accent: '#000000', ink: '#111111', art: 'circuito', texto: { papeis: {} } };
  applyThemeFields(live, saved);
  assert.equal(live.accent, '#abcdef');
  assert.equal(live.art, 'nenhum');
  assert.equal(live.ink, '#111111'); // a field absent from the saved theme is left alone
  assert.equal(live.texto.papeis.topic.weight, 700);
  saved.texto.papeis.topic.weight = 900; // independence
  assert.equal(live.texto.papeis.topic.weight, 700);
});
