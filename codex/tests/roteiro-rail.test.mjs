// tests/roteiro-rail.test.mjs
// track-46 fatia 2.5 — RED contract for the list-rail adoption.
//
// Élder: "Veja tudo o que tem no módulo de lista que a gente pode aplicar aqui" e
// "3 que incompetência ein!" — o painel esquerdo do roteiro foi feito À MÃO tendo o
// js/list-rail.js do lado, que o contrato chama de "o UM painel-lista padrão do
// Codex" (10 consumidores vivos). Esta fatia adota o módulo.
//
// O truque que torna isso testável SEM DOM: a view exporta `buildRailConfig()`, uma
// função PURA que devolve a config entregue ao mountRail. Assim o contrato ("tem
// splitter", "as seções são editáveis", "arrasta entre blocos") vira asserção de
// dados, não inspeção de pixels. Sem isso, a única prova possível seria regex de
// fonte — que já se mostrou fraca demais neste track.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildRailConfig } from '../roteiro/roteiro-view.js';
import { normalizeRoteiro, addPausa, blocoMin, fmtDur } from '../js/roteiro-model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readSrc = (rel) => fs.readFileSync(path.join(__dirname, rel), 'utf8').replace(/\r\n/g, '\n');

const t = (k) => k;                       // i18n passthrough: a chave É o texto no teste
const GRID = { __fakeGridEl: true };      // o gridEl é um nó real em produção; aqui só precisa atravessar

function seed() {
  return normalizeRoteiro({
    blocos: [
      { nome: 'Resgate', pontos: [{ rotulo: 'Resgate da Aula 1', tipo: 'resgate', dur: 5 }] },
      { nome: 'Contexto', pontos: [
        { rotulo: 'Embeddings', tipo: 'expositivo', dur: 15 },
        { rotulo: 'Prática 2', tipo: 'pratica', dur: 12 },
      ] },
    ],
  });
}

function calls() {
  const seen = [];
  const h = (name) => (...args) => seen.push([name, ...args]);
  return {
    seen,
    handlers: {
      onSelectPonto: h('selectPonto'),
      onAddPonto: h('addPonto'),
      onCreateBloco: h('createBloco'),
      onRenameBloco: h('renameBloco'),
      onDeleteBloco: h('deleteBloco'),
      onToggleBloco: h('toggleBloco'),
      onReorder: h('reorder'),
      onMoveItem: h('moveItem'),
      onAddPausa: h('addPausa'),
    },
  };
}

const build = (roteiro, state, handlers) => buildRailConfig(
  roteiro,
  Object.assign({ selectedPontoId: null, isOpen: () => true, t }, state),
  handlers || calls().handlers,
  GRID,
);

// ── Linhas = pontos, seções = blocos ────────────────────────────────────────
test('items() achata os pontos na ordem do documento, cada um sabendo o bloco dele', () => {
  const cfg = build(seed());
  const items = cfg.items();
  assert.equal(items.length, 3);
  assert.deepEqual(items.map((it) => cfg.getId(it)), ['p1', 'p2', 'p3']);
  assert.deepEqual(items.map((it) => cfg.sections.of(it)), ['b1', 'b2', 'b2']);
});

test('sections.list() devolve os blocos na ordem, com id e título', () => {
  const cfg = build(seed());
  const secs = cfg.sections.list();
  assert.deepEqual(secs.map((s) => s.id), ['b1', 'b2']);
  assert.deepEqual(secs.map((s) => s.title), ['Resgate', 'Contexto']);
});

test('renderRow mostra o rótulo e a duração do ponto', () => {
  const cfg = build(seed());
  const html = cfg.renderRow(cfg.items()[1]).main;
  assert.match(html, /Embeddings/);
  assert.match(html, new RegExp(fmtDur(15)));
});

// Élder 2026-07-20: rótulo e tempo grudados demais no painel esquerdo, e o rótulo
// truncava com reticências no lugar de quebrar linha ("nenhum conteúdo deve ser
// cortado", mesmo com o painel no tamanho mínimo do resizer).
test('renderRow: rótulo e duração vivem no PRÓPRIO flex, não direto em .cdx-rail-main', () => {
  const cfg = build(seed());
  const html = cfg.renderRow(cfg.items()[1]).main;
  assert.match(html, /<span class="cdx-roteiro-row">/, 'a linha tem seu próprio wrapper flex');
  const rotuloIdx = html.indexOf('cdx-roteiro-row-rotulo');
  const durIdx = html.indexOf('cdx-roteiro-row-dur');
  assert.ok(rotuloIdx > -1 && durIdx > rotuloIdx, 'rótulo antes da duração, ambos dentro do wrapper');
});

test('CSS: o rótulo QUEBRA linha (nunca trunca) e a duração é coluna fixa centralizada', () => {
  const css = readSrc('../roteiro/roteiro.css');
  const rotuloRule = css.match(/\.cdx-roteiro-row-rotulo\s*\{([^}]*)\}/);
  assert.ok(rotuloRule, 'a regra existe');
  assert.ok(!/white-space:\s*nowrap/.test(rotuloRule[1]), 'sem nowrap: nada de corte de texto');
  assert.ok(!/text-overflow:\s*ellipsis/.test(rotuloRule[1]), 'sem reticências');
  assert.match(rotuloRule[1], /overflow-wrap:\s*break-word|word-break:\s*break-word/, 'quebra a palavra que não couber');
  const durRule = css.match(/\.cdx-roteiro-row-dur\s*\{([^}]*)\}/);
  assert.ok(durRule, 'a regra existe');
  assert.match(durRule[1], /flex-shrink:\s*0/, 'a duração nunca encolhe/desaparece');
  assert.match(durRule[1], /align-self:\s*center/, 'centralizada verticalmente mesmo com o rótulo em várias linhas');
  assert.match(durRule[1], /text-align:\s*right/, 'fixa à direita');
});

test('CSS: o wrapper da linha é flex, mas .cdx-rail-main (compartilhado) não foi tocado', () => {
  const css = readSrc('../roteiro/roteiro.css');
  assert.match(css, /\.cdx-roteiro-row\s*\{[^}]*display:\s*flex/, 'o wrapper próprio é flex');
  const railCss = readSrc('../css/list-rail.css');
  assert.match(railCss, /\.cdx-rail-main\s*\{\s*flex:1;\s*min-width:0;\s*\}/, 'list-rail.css intocado por este ajuste');
});

test('renderHead do bloco traz o tempo SOMADO daquele bloco (melhoria aprovada no item 7)', () => {
  const r = seed();
  const cfg = build(r);
  const head = cfg.sections.renderHead(cfg.sections.list()[1], 2);
  const html = (head.main || '') + (head.act || '');
  assert.match(html, /Contexto/);
  assert.match(html, new RegExp(fmtDur(blocoMin(r.blocos[1]))), 'o cabeçalho soma 27 min do bloco');
});

// ── Capacidades que o Élder pediu explicitamente ────────────────────────────
test('SPLITTER: width é resize, com o gridEl EXPLÍCITO (não confia no parentNode)', () => {
  const cfg = build(seed());
  assert.equal(cfg.width.mode, 'resize');
  assert.equal(cfg.width.gridEl, GRID, 'o grid vai explícito na config');
  assert.ok(cfg.width.storeKey, 'a largura é lembrada entre sessões');
  assert.ok(cfg.width.min < cfg.width.max);
});

test('SEÇÕES COLAPSÁVEIS: collapsed pergunta ao estado da view, e onToggle devolve pra ela', () => {
  const c = calls();
  const cfg = build(seed(), { isOpen: (id) => id === 'b1' }, c.handlers);
  const [b1, b2] = cfg.sections.list();
  assert.equal(cfg.sections.collapsed(b1), false, 'bloco aberto');
  assert.equal(cfg.sections.collapsed(b2), true, 'bloco fechado');
  cfg.sections.onToggle('b2');
  assert.deepEqual(c.seen, [['toggleBloco', 'b2']]);
});

test('CRIAR/RENOMEAR/APAGAR bloco: sections.editable ligado e os três callbacks ligados', () => {
  const c = calls();
  const cfg = build(seed(), null, c.handlers);
  assert.equal(cfg.sections.editable, true);
  cfg.sections.onCreate();
  cfg.sections.onRename('b1');
  cfg.sections.onDelete('b2');
  assert.deepEqual(c.seen, [['createBloco'], ['renameBloco', 'b1'], ['deleteBloco', 'b2']]);
});

test('ADICIONAR PONTO: o botão + do topo existe e chama a view', () => {
  const c = calls();
  const cfg = build(seed(), null, c.handlers);
  assert.ok(cfg.add && typeof cfg.add.onAdd === 'function');
  cfg.add.onAdd();
  assert.deepEqual(c.seen, [['addPonto']]);
});

test('ARRASTAR: reordenar dentro do bloco e MOVER entre blocos, ambos ligados', () => {
  const c = calls();
  const cfg = build(seed(), null, c.handlers);
  cfg.reorder.onReorder(['p3', 'p2']);
  cfg.sections.onMoveItem('p3', 'b1', ['p1', 'p3']);
  assert.deepEqual(c.seen, [
    ['reorder', ['p3', 'p2']],
    ['moveItem', 'p3', 'b1', ['p1', 'p3']],
  ]);
});

test('SELECIONAR ponto: selectedId reflete o estado e onSelect devolve o id', () => {
  const c = calls();
  const cfg = build(seed(), { selectedPontoId: 'p2' }, c.handlers);
  assert.equal(cfg.selectedId(), 'p2');
  cfg.onSelect('p3');
  assert.deepEqual(c.seen, [['selectPonto', 'p3']]);
});

test('PAUSA: o rodapé do rail carrega a afordância de inserir pausa', () => {
  const cfg = build(seed());
  assert.ok(typeof cfg.footer === 'function', 'o rail tem rodapé');
  assert.match(cfg.footer(), /data-roteiro-add-pausa/, 'o botão de pausa mora lá');
});

test('um bloco de PAUSA aparece na lista com rótulo próprio, nunca com título vazio', () => {
  const cfg = build(addPausa(seed(), { dur: 10 }));
  const secs = cfg.sections.list();
  assert.equal(secs.length, 3);
  assert.ok(String(secs[2].title || '').trim().length > 0, 'a pausa se identifica na lista');
});

test('roteiro vazio: a config não quebra, só não tem linha nem seção', () => {
  const cfg = build(normalizeRoteiro(null));
  assert.deepEqual(cfg.items(), []);
  assert.deepEqual(cfg.sections.list(), []);
  assert.ok(cfg.emptyText || cfg.emptyHtml, 'ainda diz ao Élder que está vazio');
});

// ── Contrato de fonte: o que só se prova lendo o arquivo ────────────────────
test('a view MONTA o list-rail e não pinta mais o painel esquerdo à mão', () => {
  const src = readSrc('../roteiro/roteiro-view.js');
  assert.match(src, /from\s+['"]\.\.\/js\/list-rail\.js['"]/, 'importa o módulo padrão');
  assert.match(src, /mountRail\s*\(/, 'monta o rail');
  assert.ok(!/cdx-roteiro-bloco-head/.test(src), 'o cabeçalho de bloco à mão morreu');
  assert.ok(!/data-roteiro-ponto\b/.test(src), 'a linha de ponto à mão morreu (agora é .cdx-rail-row)');
});

test('a FALA DE CHAMADA é textarea: input type=text nunca faz wrap (queixa do Élder)', () => {
  const src = readSrc('../roteiro/roteiro-view.js');
  assert.match(src, /<textarea[^>]*data-roteiro-chamada/, 'chamada é textarea');
  assert.ok(!/<input[^>]*data-roteiro-chamada/.test(src), 'não sobrou input de uma linha');
});

test('o painel direito edita TODOS os campos do ponto, não só chamada/notas', () => {
  const src = readSrc('../roteiro/roteiro-view.js');
  assert.match(src, /data-roteiro-rotulo/, 'rótulo editável');
  assert.match(src, /<select[^>]*data-roteiro-tipo/, 'tipo é dropdown');
  assert.match(src, /data-roteiro-dur/, 'duração editável');
  assert.match(src, /data-roteiro-del-ponto/, 'dá pra apagar o ponto');
});

test('o grid dos 2 painéis está no CSS do jeito que o installResizer exige', () => {
  const css = readSrc('../roteiro/roteiro.css');
  assert.match(css, /\.cdx-roteiro-body\s*\{[^}]*display:\s*grid/, 'o corpo é grid');
  assert.match(css, /grid-template-columns:\s*var\(--cdx-rz-w/, 'a 1ª coluna é a largura do resizer');
  assert.match(css, /@media[^{]*max-width:\s*980px[^{]*\{[^}]*\.cdx-roteiro-body[^}]*1fr/,
    'colapsa pra uma coluna no celular, igual ao .cdx-aulas-hub');
});

test('WARN da fatia 1 fechado: o badge de tipo não usa --acc-* como cor de TEXTO', () => {
  const css = readSrc('../roteiro/roteiro.css');
  const m = css.match(/\.cdx-roteiro-detail-badge\s*\{([^}]*)\}/);
  assert.ok(m, 'a regra do badge existe');
  assert.ok(!/color:\s*var\(--rot-color/.test(m[1]),
    'tokens.css: os --acc-* são "never rendered as text"; o texto vai de --text-primary');
  assert.match(m[1], /color:\s*var\(--text-primary\)/);
});

// Regressão do "clique perdido", achado na auditoria desta fatia: commitar campo
// digitado no BLUR fazia o clique numa linha do rail disparar change -> re-render
// do rail, trocando o DOM da linha ENTRE mousedown e mouseup. O clique ficava sem
// alvo vivo e a seleção era engolida — "edite o rótulo, clique no próximo ponto"
// exigia dois cliques. Aplicar no 'input' faz o blur não ter mais nada a mudar.
test('campos digitados commitam no input (não no blur), senão o clique seguinte se perde', () => {
  const src = readSrc('../roteiro/roteiro-view.js');
  const onInput = src.slice(src.indexOf('function _onInput'), src.indexOf('function _onKeydown'));
  for (const f of ['data-roteiro-rotulo', 'data-roteiro-dur', 'data-roteiro-chamada']) {
    assert.ok(onInput.includes(f), f + ' tem que ser aplicado no _onInput');
  }
  const onChange = src.slice(src.indexOf('function _onChange'), src.indexOf('function _onInput'));
  assert.ok(!/_commit\(updatePonto\([^)]*rotulo/.test(onChange), 'o rótulo não volta a commitar no blur');
});

test('o painel direito NUNCA é repintado por digitação (destruiria o campo em foco)', () => {
  const src = readSrc('../roteiro/roteiro-view.js');
  const applyField = src.slice(src.indexOf('function _applyField'), src.indexOf('function _onChange'));
  assert.ok(!/_renderRight\(/.test(applyField), '_applyField não pode repintar o painel direito');
});

test('a gravação é debounced mas o unmount dá FLUSH (trocar de aba não pode perder edição)', () => {
  const src = readSrc('../roteiro/roteiro-view.js');
  assert.match(src, /function\s+_persistSoon/, 'existe debounce');
  const unmountFn = src.slice(src.indexOf('export function unmount'), src.indexOf('// ── Store seam'));
  assert.match(unmountFn, /_flushPersist\(\)/, 'unmount descarrega a gravação pendente');
});

test('as chaves i18n novas existem em pt.js E en.js (ARCHITECTURE §5)', () => {
  const pt = readSrc('../i18n/pt.js');
  const en = readSrc('../i18n/en.js');
  for (const k of ['roteiro.bloco_new', 'roteiro.bloco_rename', 'roteiro.bloco_delete',
    'roteiro.ponto_new', 'roteiro.add_pausa', 'roteiro.field_rotulo',
    'roteiro.field_tipo', 'roteiro.field_dur']) {
    assert.match(pt, new RegExp("['\"]" + k.replace('.', '\\.') + "['\"]\\s*:"), 'falta em pt.js: ' + k);
    assert.match(en, new RegExp("['\"]" + k.replace('.', '\\.') + "['\"]\\s*:"), 'falta em en.js: ' + k);
  }
});
