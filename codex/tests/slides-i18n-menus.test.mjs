// slides-i18n-menus.test.mjs — the Slides dynamic menus must not have raw PT.
//
// Exists because of a REAL bug (Élder 2026-07-16, with the language set to English): "ainda
// tem um monte de palavras em português dentro dos droplists do menu dinâmico" (there are
// still a bunch of Portuguese words in the dynamic menu droplists). Two distinct holes:
//   1. animpanel.js: FX_OPTS/FX_LABEL, the "Transição" header, and the transition options
//      were PT literals. The file's own comment even admitted it ("labels literal").
//   2. app.js: LAYOUT_LABEL_KEY mapped 5 of the 14 layouts; the other 9 fell back to
//      `L.label`, which is PT by contract (it is the layout's declared fallback).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pt from '../i18n/pt.js';
import en from '../i18n/en.js';

const SLIDES = fileURLToPath(new URL('../content/slides/js/', import.meta.url));
const ACENTO = /[áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÇ]/;

// PURE: the layout ids from the registry, read from each layout's own file.
function layoutIds() {
  const dir = path.join(SLIDES, 'layouts');
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.js') && f !== 'registry.js')
    .map((f) => {
      const m = /^\s*id:\s*"([^"]+)"/m.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
      return m && m[1];
    })
    .filter(Boolean);
}

// PURE: the keys declared in app.js's LAYOUT_LABEL_KEY. Reads the real keys instead of
// testing a regex per id (which is where this test's 1st version fooled itself).
function mappedIds() {
  const src = fs.readFileSync(path.join(SLIDES, 'app.js'), 'utf8');
  const m = /const LAYOUT_LABEL_KEY = \{([\s\S]*?)\};/.exec(src);
  assert.ok(m, 'LAYOUT_LABEL_KEY exists in app.js');
  return [...m[1].matchAll(/(\w+)\s*:/g)].map((x) => x[1]);
}

test('every layout in the registry has an i18n key in BOTH dictionaries', () => {
  const ids = layoutIds();
  assert.ok(ids.length >= 14, 'found the layouts (' + ids.length + ')');

  const mapped = mappedIds();
  assert.deepEqual(ids.filter((id) => !mapped.includes(id)), [],
    'layout(s) falling back to raw PT in the +slide menu');

  const missingFromDict = [];
  for (const id of ids) {
    if (!pt['slides.layout_' + id]) missingFromDict.push('pt: ' + id);
    if (!en['slides.layout_' + id]) missingFromDict.push('en: ' + id);
  }
  assert.deepEqual(missingFromDict, [], 'layout key(s) missing from a dictionary');
});

// EVERY edit panel, not just animpanel. No accented literal may be left outside a comment:
// it's the cheap, reliable signal of raw PT in code. Sweeps the whole directory because this
// test's 1st version only looked at animpanel, and Élder found the next hole ("Proporção", in
// themebox) on the SCREEN, which is exactly the job this test is supposed to do.
test('no edit panel has a raw PT string outside a comment', () => {
  const dir = path.join(SLIDES, 'edit');
  const raw = [];
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    const withoutComments = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    for (const m of withoutComments.matchAll(/"([^"\n]*)"|'([^'\n]*)'/g)) {
      const s = m[1] ?? m[2];
      if (ACENTO.test(s) && !s.startsWith('slides.')) raw.push(f + ': ' + s);
    }
  }
  assert.deepEqual(raw, [], 'PT literal(s) in an edit panel; must become t("slides.…")');
});

// The effect keys are built by concatenation ("slides.fx_" + fx), so no dead-key guard sees
// them: the contract is pinned here.
test('the effect and transition keys exist in both dictionaries', () => {
  const missing = [];
  for (const k of ['slides.fx_surgir', 'slides.fx_fade', 'slides.fx_slide', 'slides.fx_zoom',
    'slides.ed_transition', 'slides.tr_none', 'slides.tr_fade', 'slides.tr_push',
    'slides.ed_with_prev', 'slides.ed_aspect']) {
    if (!pt[k]) missing.push('pt: ' + k);
    if (!en[k]) missing.push('en: ' + k);
  }
  assert.deepEqual(missing, [], 'missing key(s)');
});

// t() read at module LOAD freezes the language of the first import. FX_OPTS/FX_LABEL must
// be functions, not constants, or the toggle stops moving the labels.
test('FX_OPTS/FX_LABEL read t() at render time, not at import time', () => {
  const src = fs.readFileSync(path.join(SLIDES, 'edit', 'animpanel.js'), 'utf8');
  assert.match(src, /const FX_OPTS = \(\) =>/, 'FX_OPTS is a function');
  assert.match(src, /const FX_LABEL = \(fx\) =>/, 'FX_LABEL is a function');
});
