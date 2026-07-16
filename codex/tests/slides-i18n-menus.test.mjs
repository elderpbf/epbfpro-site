// slides-i18n-menus.test.mjs — os menus dinâmicos do Slides não podem ter PT cru.
//
// Existe por um bug REAL (Élder 2026-07-16, com a língua em inglês): "ainda tem um monte
// de palavras em português dentro dos droplists do menu dinâmico". Dois furos distintos:
//   1. animpanel.js: FX_OPTS/FX_LABEL, o cabeçalho "Transição" e as opções de transição
//      eram literais PT. O comentário do arquivo até assumia ("labels literal").
//   2. app.js: LAYOUT_LABEL_KEY mapeava 5 dos 14 layouts; os outros 9 caíam no `L.label`,
//      que é PT por contrato (é o fallback declarado do layout).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pt from '../i18n/pt.js';
import en from '../i18n/en.js';

const SLIDES = fileURLToPath(new URL('../content/slides/js/', import.meta.url));
const ACENTO = /[áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÇ]/;

// PURO: os ids do registro de layouts, lidos do próprio arquivo de cada um.
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

// PURO: as chaves declaradas no LAYOUT_LABEL_KEY do app.js. Lê as chaves de verdade em vez
// de testar um regex por id (que foi onde a 1ª versão deste teste se enganou sozinha).
function mappedIds() {
  const src = fs.readFileSync(path.join(SLIDES, 'app.js'), 'utf8');
  const m = /const LAYOUT_LABEL_KEY = \{([\s\S]*?)\};/.exec(src);
  assert.ok(m, 'LAYOUT_LABEL_KEY existe no app.js');
  return [...m[1].matchAll(/(\w+)\s*:/g)].map((x) => x[1]);
}

test('todo layout do registro tem chave de i18n nos DOIS dicionários', () => {
  const ids = layoutIds();
  assert.ok(ids.length >= 14, 'achou os layouts (' + ids.length + ')');

  const mapped = mappedIds();
  assert.deepEqual(ids.filter((id) => !mapped.includes(id)), [],
    'layout(s) caindo no fallback PT no menu +slide');

  const semDicionario = [];
  for (const id of ids) {
    if (!pt['slides.layout_' + id]) semDicionario.push('pt: ' + id);
    if (!en['slides.layout_' + id]) semDicionario.push('en: ' + id);
  }
  assert.deepEqual(semDicionario, [], 'chave(s) de layout faltando num dicionário');
});

// TODO painel de edição, não só o animpanel. Nenhum literal acentuado pode sobrar fora de
// comentário: é o sinal barato e confiável de PT cru em código. Varre o diretório inteiro
// porque a 1ª versão deste teste olhava só o animpanel e o Élder achou o furo seguinte
// ("Proporção", no themebox) na TELA, que é exatamente o trabalho que o teste devia fazer.
test('nenhum painel de edição tem string PT crua fora de comentário', () => {
  const dir = path.join(SLIDES, 'edit');
  const cruas = [];
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    const semComentario = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    for (const m of semComentario.matchAll(/"([^"\n]*)"|'([^'\n]*)'/g)) {
      const s = m[1] ?? m[2];
      if (ACENTO.test(s) && !s.startsWith('slides.')) cruas.push(f + ': ' + s);
    }
  }
  assert.deepEqual(cruas, [], 'literal(is) PT em painel de edição; devem virar t("slides.…")');
});

// As chaves dos efeitos são montadas por concatenação ("slides.fx_" + fx), então nenhum
// guard de chave-morta as enxerga: o contrato fica fixado aqui.
test('as chaves de efeito e transição existem nos dois dicionários', () => {
  const faltando = [];
  for (const k of ['slides.fx_surgir', 'slides.fx_fade', 'slides.fx_slide', 'slides.fx_zoom',
    'slides.ed_transition', 'slides.tr_none', 'slides.tr_fade', 'slides.tr_push',
    'slides.ed_with_prev', 'slides.ed_aspect']) {
    if (!pt[k]) faltando.push('pt: ' + k);
    if (!en[k]) faltando.push('en: ' + k);
  }
  assert.deepEqual(faltando, [], 'chave(s) faltando');
});

// t() lido no LOAD do módulo congela a língua da primeira importação. FX_OPTS/FX_LABEL
// precisam ser função, não constante, ou o toggle para de mover os labels.
test('FX_OPTS/FX_LABEL leem t() em tempo de render, não de import', () => {
  const src = fs.readFileSync(path.join(SLIDES, 'edit', 'animpanel.js'), 'utf8');
  assert.match(src, /const FX_OPTS = \(\) =>/, 'FX_OPTS é função');
  assert.match(src, /const FX_LABEL = \(fx\) =>/, 'FX_LABEL é função');
});
