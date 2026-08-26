// The trail draws an item card twice: a COMPACT row inside a lesson and a FULL card in a tab of
// its own. Track-61 §26 step 1 unified what happens when you OPEN one (item-open.js); this pins
// step A of the other half, the MARKUP, which now lives in trilha/js/item-card.js.
//
// WHY THE GOLDEN STRINGS. The two builders had already drifted once: the same lab read
// differently in the Outros tab than inside its own lesson (§26.2), because a fix landed in one
// copy and not the other. Moving both templates into one module is only worth anything if it
// changes nothing, so the HTML below was CAPTURED FROM THE PREVIOUS BUILDERS (git HEAD before the
// move, run through this same stub) and diffed byte for byte. If a future edit changes a card on
// purpose, this file is where that intent gets restated.
//
// Merging the two shapes into ONE (a single class family with a compact modifier) is step B. It
// moves pixels, so it waits for Élder's eye; until then these two shapes are the contract.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { installFakeDom } from './_card-dom.mjs';

installFakeDom();
const card = await import('../trilha/js/item-card.js');
const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const ITEM = {
  id: 7, type: 'prompt', type_label: 'Prompt para IA', type_icon: 'glyph:chat',
  title: 'Roteiro base', summary: 'Um resumo', released_at: 0, tags: ['audiencia', 'civel'],
};
const FRESH = Math.floor(Date.now() / 1000);

test('the compact row is unchanged, to the byte', () => {
  assert.equal(card.compactCardClass({}), 'cdx-tr-sub');
  assert.equal(card.compactCardHtml(ITEM, {}), '<div class="cdx-tr-sub-zone"><svg data-glyph="glyph:chat" data-size="20"></svg></div><div class="cdx-tr-sub-meta"><span class="cdx-tr-sub-type">Prompt para IA</span><span class="cdx-tr-sub-title">Roteiro base</span><span class="cdx-tr-sub-summary">Um resumo</span></div><div class="cdx-tr-sub-actions"></div>');
});

test('a tarefa keeps its check mark and its own class', () => {
  assert.equal(card.compactCardClass({ isTarefa: true }), 'cdx-tr-sub cdx-tr-sub--tarefa');
  assert.equal(card.compactCardHtml({ ...ITEM, type: 'lab' }, { isTarefa: true }), '<div class="cdx-tr-sub-zone cdx-tr-sub-zone--tarefa">✓<span class="cdx-tr-lab-flask"><svg data-glyph="glyph:flask" data-size="12"></svg></span></div><div class="cdx-tr-sub-meta"><span class="cdx-tr-sub-type">Tarefa</span><span class="cdx-tr-sub-title">Roteiro base</span><span class="cdx-tr-sub-summary">Um resumo</span></div><div class="cdx-tr-sub-actions"></div>');
});

test('zone precedence is tarefa, then apostila, then lab', () => {
  assert.equal(card.compactCardHtml({ ...ITEM, type: 'lab' }, { isApostila: true }), '<div class="cdx-tr-sub-zone cdx-tr-sub-zone--apostila"><svg data-glyph="glyph:chat" data-size="20"></svg><span class="cdx-tr-lab-flask"><svg data-glyph="glyph:flask" data-size="12"></svg></span></div><div class="cdx-tr-sub-meta"><span class="cdx-tr-sub-type">Prompt para IA</span><span class="cdx-tr-sub-title">Roteiro base</span><span class="cdx-tr-sub-summary">Um resumo</span></div><div class="cdx-tr-sub-actions"></div>');
});

test('a lab wears the flask badge, and a fresh item wears NOVO on the type line', () => {
  assert.equal(card.compactCardHtml({ ...ITEM, type: 'lab', released_at: FRESH }, {}), '<div class="cdx-tr-sub-zone cdx-tr-sub-zone--lab"><svg data-glyph="glyph:chat" data-size="20"></svg><span class="cdx-tr-lab-flask"><svg data-glyph="glyph:flask" data-size="12"></svg></span></div><div class="cdx-tr-sub-meta"><span class="cdx-tr-sub-type">Prompt para IA<span class="cdx-tr-novo-pill">NOVO</span></span><span class="cdx-tr-sub-title">Roteiro base</span><span class="cdx-tr-sub-summary">Um resumo</span></div><div class="cdx-tr-sub-actions"></div>');
});

test('the full card is unchanged, to the byte', () => {
  assert.equal(card.fullCardHtml(ITEM, {}), '<div class="cdx-tr-card-header" role="button" tabindex="0" aria-expanded="false"><div class="cdx-tr-zone"><span class="cdx-tr-zone-icon"><svg data-glyph="glyph:chat" data-size="20"></svg></span><span class="cdx-tr-zone-label">Prompt para IA</span></div><div class="cdx-tr-meta"><div class="cdx-tr-title">Roteiro base</div><div class="cdx-tr-summary">Um resumo</div><div class="cdx-tr-topics"><span class="cdx-tr-topic-chip">audiencia</span><span class="cdx-tr-topic-chip">civel</span></div></div><div class="cdx-tr-actions"><span class="cdx-tr-chevron">›</span></div></div>');
});

test('the full card carries the eyebrow and the apostila zone', () => {
  assert.equal(card.fullCardHtml({ ...ITEM, tags: [] }, { eyebrow: 'Aula 03 - Teste', isApostila: true }), '<div class="cdx-tr-card-header" role="button" tabindex="0" aria-expanded="false"><div class="cdx-tr-zone cdx-tr-zone--apostila"><span class="cdx-tr-zone-icon"><svg data-glyph="glyph:chat" data-size="20"></svg></span><span class="cdx-tr-zone-label">Prompt para IA</span></div><div class="cdx-tr-meta"><span class="cdx-tr-meta-eyebrow">Aula 03 - Teste</span><div class="cdx-tr-title">Roteiro base</div><div class="cdx-tr-summary">Um resumo</div></div><div class="cdx-tr-actions"><span class="cdx-tr-chevron">›</span></div></div>');
});

test('in the full card the NOVO pill rides the TITLE, not the type line', () => {
  // One of the two differences step B has to settle, and the reason it is not a mechanical merge.
  assert.equal(card.fullCardHtml({ ...ITEM, released_at: FRESH, summary: null, tags: [] }, {}), '<div class="cdx-tr-card-header" role="button" tabindex="0" aria-expanded="false"><div class="cdx-tr-zone"><span class="cdx-tr-zone-icon"><svg data-glyph="glyph:chat" data-size="20"></svg></span><span class="cdx-tr-zone-label">Prompt para IA</span></div><div class="cdx-tr-meta"><div class="cdx-tr-title">Roteiro base<span class="cdx-tr-novo-pill">NOVO</span></div></div><div class="cdx-tr-actions"><span class="cdx-tr-chevron">›</span></div></div>');
});

// -- and the two screens really do delegate ---------------------------------

test('neither builder keeps a template of its own any more', () => {
  const subSrc = read('../trilha/js/sub.js');
  const flatSrc = read('../trilha/js/flat.js');
  assert.match(subSrc, /import \{ compactCardClass, compactCardHtml \} from '\.\/item-card\.js'/);
  assert.match(flatSrc, /import \{ fullCardHtml \} from '\.\/item-card\.js'/);
  for (const [name, src] of [['sub.js', subSrc], ['flat.js', flatSrc]]) {
    assert.ok(!src.includes('cdx-tr-sub-meta'), name + ' no longer writes the meta block');
    assert.ok(!src.includes('cdx-tr-novo-pill'), name + ' no longer writes the NOVO pill');
    assert.ok(!src.includes('cdx-tr-lab-flask'), name + ' no longer writes the lab badge');
  }
});

test('the shared pieces are shared, so a change to one reaches both screens', () => {
  const src = read('../trilha/js/item-card.js');
  for (const fn of ['itemIconHtml', 'labFlaskHtml', 'novoPillHtml', 'typeLabelOf']) {
    assert.match(src, new RegExp('export function ' + fn));
  }
});

// -- the app row is the same row ---------------------------------------------

test('the app row is the compact row with three overrides, byte for byte', () => {
  // app-card.js carried a THIRD copy of this template until 2026-08-26. Same drift risk, same
  // fix: the app logo, the fixed label and the Store button are options now, not a new card.
  // The string below was captured from the previous buildAppSub at git HEAD.
  const html = card.compactCardHtml({ title: 'Nexo' }, {
    zoneModifier: 'cdx-tr-sub-zone--app',
    iconHtml: '<img class="cdx-tr-app-sub-logo" src="LOGO">',
    typeLabel: 'Aplicativo',
    actionsHtml: '<button class="cdx-tr-item-action">Store</button>',
  });
  assert.equal(html, '<div class="cdx-tr-sub-zone cdx-tr-sub-zone--app"><img class="cdx-tr-app-sub-logo" src="LOGO"></div><div class="cdx-tr-sub-meta"><span class="cdx-tr-sub-type">Aplicativo</span><span class="cdx-tr-sub-title">Nexo</span></div><div class="cdx-tr-sub-actions"><button class="cdx-tr-item-action">Store</button></div>');
  assert.equal(card.compactCardClass({ modifier: 'cdx-tr-sub--app' }), 'cdx-tr-sub cdx-tr-sub--app');
});

test('the app row delegates too', () => {
  const src = read('../trilha/js/app-card.js');
  assert.match(src, /import \{ compactCardClass, compactCardHtml \} from '\.\/item-card\.js'/);
  assert.ok(!src.includes("'<div class=\"cdx-tr-sub-zone cdx-tr-sub-zone--app\">'"), 'no template of its own');
});
