// tests/trilha-aulas.test.mjs
// Codex Trail · Aulas timeline. Unit-tests the DOM-free logic: the NOVO-window
// freshness derivation and the item-action dispatch. Card/timeline DOM is
// verified visually on staging.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getItemAction, getMeta } from '../trilha/js/actions.js';
import { isFresh, countFreshIn } from '../trilha/js/freshness.js';
import { state } from '../trilha/js/state.js';

// ── freshness (5-day window; epoch seconds) ─────────────────────────────────
const NOW = 1_700_000_000_000;
const DAY = 86400;
test('isFresh: within 5 days', () => assert.equal(isFresh({ released_at: NOW / 1000 - 2 * DAY }, NOW), true));
test('isFresh: older than 5 days', () => assert.equal(isFresh({ released_at: NOW / 1000 - 6 * DAY }, NOW), false));
test('isFresh: ISO string accepted', () => assert.equal(isFresh({ released_at: new Date(NOW - DAY * 1000).toISOString() }, NOW), true));
test('isFresh: no released_at -> false', () => assert.equal(isFresh({}, NOW), false));
test('countFreshIn: counts only fresh', () => {
  const items = [{ released_at: NOW / 1000 - DAY }, { released_at: NOW / 1000 - 10 * DAY }, {}];
  assert.equal(countFreshIn(items, NOW), 1);
});
test('countFreshIn: non-array -> 0', () => assert.equal(countFreshIn(null, NOW), 0));

// ── getMeta ─────────────────────────────────────────────────────────────────
test('getMeta: parses meta_json string', () => assert.deepEqual(getMeta({ meta_json: '{"pdf_url":"x"}' }), { pdf_url: 'x' }));
test('getMeta: object passthrough', () => assert.deepEqual(getMeta({ meta_json: { a: 1 } }), { a: 1 }));
test('getMeta: bad json -> {}', () => assert.deepEqual(getMeta({ meta_json: '{bad' }), {}));
test('getMeta: none -> {}', () => assert.deepEqual(getMeta({}), {}));

// ── getItemAction dispatch ──────────────────────────────────────────────────
test('getItemAction: pdf -> open Baixar PDF', () => {
  assert.deepEqual(getItemAction({ type: 'x', meta_json: { pdf_url: '/r2/a.pdf' } }),
    { kind: 'open', label: 'Baixar PDF', url: '/r2/a.pdf', icon: 'download' });
});
test('getItemAction: image attachment -> Ver imagem (external)', () => {
  const a = getItemAction({ type: 'x', meta_json: { attachment_url: 'pic.png' } });
  assert.equal(a.kind, 'open'); assert.equal(a.label, 'Ver imagem'); assert.equal(a.icon, 'external');
});
test('getItemAction: non-image attachment -> Baixar (download)', () => {
  const a = getItemAction({ type: 'x', meta_json: { attachment_url: 'file.zip' } });
  assert.equal(a.label, 'Baixar'); assert.equal(a.icon, 'download');
});
test('getItemAction: doc_url -> Documentação', () => {
  assert.equal(getItemAction({ type: 'x', meta_json: { doc_url: 'd' } }).label, 'Documentação');
});
test('getItemAction: body_md -> copy', () => {
  assert.deepEqual(getItemAction({ type: 'x', body_md: 'hi' }), { kind: 'copy', label: 'Copiar', text: 'hi', icon: 'copy' });
});
test('getItemAction: nothing actionable -> null', () => assert.equal(getItemAction({ type: 'x' }), null));
// A released interativo has no body_md/pdf/attachment; without a dedicated branch it
// would return null and expand with no way to open it (its in-body "Abrir" is suppressed
// under opts.preview on the Trail). It must open the shared viewer by url.
test('getItemAction: interativo -> interativo-open (opens the viewer by url)', () => {
  const a = getItemAction({ type: 'interativo', title: 'Demo', meta_json: { url: '/codex/interativos/demo-peca/' } });
  assert.equal(a.kind, 'interativo-open');
  assert.equal(a.label, 'Abrir');
  assert.equal(a.url, '/codex/interativos/demo-peca/');
});
// A aba Aulas nao entrega nada: ela LEVA pra aba Tarefas, dona do fluxo (Élder 2026-07-15).
test('getItemAction: tarefa precedence over meta -> go-tarefas', () => {
  const a = getItemAction({ type: 'tarefa', id: 7, meta_json: { pdf_url: 'x' } });
  assert.equal(a.kind, 'go-tarefas');
  assert.equal(a.label, 'Ir para tarefas');
});
// Era 'submitted (localStorage)'. A chave 'ct_tarefa_submitted_<item>_<turma>' NAO tinha o aluno
// dentro: era por NAVEGADOR, entao o segundo aluno no mesmo aparelho herdava o "Resposta enviada"
// do primeiro e nao conseguia enviar. Bug VIVO em producao. A aba Aulas nao pergunta mais nada ao
// localStorage; quem sabe se entregou e o servidor.
test('getItemAction: tarefa NAO consulta o localStorage (o estado nao e por navegador)', () => {
  state.turmaSlug = 'turma1';
  let touched = false;
  globalThis.localStorage = {
    getItem(k) { if (String(k).indexOf('tarefa_submitted') !== -1) touched = true; return null; },
    setItem() {},
  };
  assert.equal(getItemAction({ type: 'tarefa', id: 7 }).kind, 'go-tarefas');
  assert.equal(touched, false, 'o estado de entrega nunca sai do localStorage');
  delete globalThis.localStorage;
  state.turmaSlug = null;
});
