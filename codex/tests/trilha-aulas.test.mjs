// tests/trilha-aulas.test.mjs
// Codex Trail · Aulas timeline. Unit-tests the DOM-free logic: the NOVO-window
// freshness derivation and the item-action dispatch. Card/timeline DOM is
// verified visually on staging.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getItemAction, getItemActions, getMeta } from '../trilha/js/actions.js';
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
// The Aulas tab delivers nothing itself: it LEADS to the Tarefas tab, which owns the flow (Élder 2026-07-15).
test('getItemAction: tarefa precedence over meta -> go-tarefas', () => {
  const a = getItemAction({ type: 'tarefa', id: 7, meta_json: { pdf_url: 'x' } });
  assert.equal(a.kind, 'go-tarefas');
  assert.equal(a.label, 'Ir para tarefas');
});
// Used to be 'submitted (localStorage)'. The key 'ct_tarefa_submitted_<item>_<turma>' did NOT
// carry the student in it: it was scoped by BROWSER, so a second student on the same device
// inherited the first one's "Resposta enviada" and could not submit. A LIVE bug in production.
// The Aulas tab no longer asks localStorage anything; the server is the one who knows if it was submitted.
test('getItemAction: tarefa does NOT consult localStorage (state is not per-browser)', () => {
  state.turmaSlug = 'turma1';
  let touched = false;
  globalThis.localStorage = {
    getItem(k) { if (String(k).indexOf('tarefa_submitted') !== -1) touched = true; return null; },
    setItem() {},
  };
  assert.equal(getItemAction({ type: 'tarefa', id: 7 }).kind, 'go-tarefas');
  assert.equal(touched, false, 'submission state never comes from localStorage');
  delete globalThis.localStorage;
  state.turmaSlug = null;
});

// ── getItemActions: the end of mutual exclusion (track-61) ──────────────────────
// The old chain had ONE `return`, so an item with an attachment LOST "Copiar" and
// prompt + files together was unrepresentable. This is the defect track-61 fixes.
test('getItemActions: attachment + body deliver Baixar AND Copiar (used to be Baixar only)', () => {
  const as = getItemActions({ type: 'prompt', title: 'P', body_md: 'instrucao', meta_json: { attachment_url: 'base.pdf' } });
  assert.deepEqual(as.map((a) => a.label), ['Baixar', 'Copiar', 'Baixar .md']);
});
test('getItemActions: pdf + attachment + doc + body deliver all five, in that order', () => {
  // The last one is the GENERATED pdf of the body, which is a different thing from the
  // `pdf_url` attachment at the front of the list. Both can legitimately exist on one item.
  const as = getItemActions({
    type: 'x', body_md: 'txt',
    meta_json: { pdf_url: 'a.pdf', attachment_url: 'b.zip', doc_url: 'https://d' },
  });
  assert.deepEqual(as.map((a) => a.label), ['Baixar PDF', 'Baixar', 'Documentação', 'Copiar', 'Baixar PDF']);
});
// The first action is still what the closed row used to show alone, so a single-action
// item does not change at all.
test('getItemActions: the first action is the same one getItemAction already returned', () => {
  const item = { type: 'x', body_md: 'txt', meta_json: { pdf_url: 'a.pdf' } };
  assert.deepEqual(getItemActions(item)[0], getItemAction(item));
});
// Lab, interativo, and tarefa stay exclusive: the action IS the item, there is nothing to add.
test('getItemActions: lab is exclusive even with a body and attachment', () => {
  const as = getItemActions({ type: 'lab', body_md: 'txt', meta_json: { lab_key: 'k1', attachment_url: 'x.pdf' } });
  assert.equal(as.length, 1);
  assert.equal(as[0].kind, 'lab-open');
});
test('getItemActions: tarefa is exclusive even with a body', () => {
  const as = getItemActions({ type: 'tarefa', id: 7, body_md: 'txt' });
  assert.equal(as.length, 1);
  assert.equal(as[0].kind, 'go-tarefas');
});
test('getItemActions: nothing actionable -> empty list', () => {
  assert.deepEqual(getItemActions({ type: 'x' }), []);
});

// ── projeto: the packaging item (track-61) ─────────────────────────────────────
// "quando eu insiro o projeto na trilha nao aparecem os 3 itens separadamente, aparece o
// projeto, e quando eu abro ele aparecem listados os 3 itens" (when I insert the project
// into the trilha the 3 items don't show separately, the project shows, and when I open it
// the 3 items appear listed) (Élder 2026-08-04).
test('getItemActions: projeto offers Baixar tudo (.zip)', () => {
  const as = getItemActions({
    type: 'projeto', title: '# Projeto Audiencia',
    children: [{ id: 900028 }, { id: 900029 }, { id: 900030 }],
  });
  const zip = as.find((a) => a.kind === 'download-project');
  assert.ok(zip, 'the project has to offer the bundle');
  assert.deepEqual(zip.project.items, [
    { id: 900028, dir: '' }, { id: 900029, dir: '' }, { id: 900030, dir: '' },
  ]);
  assert.equal(zip.project.name, 'Projeto Audiencia', 'the markdown # feeds the file name');
});

// Nesting becomes a FOLDER: the structure the student sees in the trilha is the one they
// open in the unzip tool (Elder 2026-08-05).
test('packageOf: a child that is itself a package becomes a folder in the zip', () => {
  const as = getItemActions({
    type: 'projeto', title: 'Raiz',
    children: [
      { id: 1, title: 'Solto' },
      { id: 2, title: '# Configuração de LLMs', children: [{ id: 3, title: 'A' }, { id: 4, title: 'B' }] },
    ],
  });
  const zip = as.find((a) => a.kind === 'download-project');
  assert.deepEqual(zip.project.items, [
    { id: 1, dir: '' },
    { id: 2, dir: '' },
    { id: 3, dir: 'Configuracao-de-LLMs/' },
    { id: 4, dir: 'Configuracao-de-LLMs/' },
  ]);
});

// Elder 2026-08-05, about a folder with a lab inside: allow it and WARN, never forbid.
// Forbidding would make the rule depend on ORDER (put a lab first and the folder locks against documents).
test('packageOf: lab and interativo leave the zip but are COUNTED, not silently dropped', () => {
  const as = getItemActions({
    type: 'projeto', title: 'Mista',
    children: [
      { id: 1, title: 'Doc', type: 'prompt' },
      { id: 2, title: 'Lab', type: 'lab' },
      { id: 3, title: 'Inter', type: 'interativo' },
    ],
  });
  const zip = as.find((a) => a.kind === 'download-project');
  assert.deepEqual(zip.project.items, [{ id: 1, dir: '' }]);
  assert.equal(zip.project.skipped, 2, 'what does not fit in the zip has to be stated, not hidden');
});

// A tarefa that carries documents needs BOTH actions: "Entregar" is what it is,
// "Baixar tudo" is what it carries. Only the exclusive one would hide the attachments.
test('getItemActions: a tarefa with children keeps its own action AND gets the bundle', () => {
  const as = getItemActions({ type: 'tarefa', title: 'Tarefa 1', children: [{ id: 9, title: 'Anexo' }] });
  assert.ok(as.length >= 2, 'the tarefa cannot lose its own action');
  assert.ok(as.find((a) => a.kind === 'download-project'), 'nor the documents it carries');
});
// Elder tested it and caught the inconsistency: "Copiar" copied the project's intro sentence
// while "Baixar" brought a zip of 3 files, so there was no way to predict what each button
// would do. A packaging item only offers actions ON THE BUNDLE; its own text is meant to be
// read on screen.
test('getItemActions: projeto does NOT offer Copiar of its own intro text', () => {
  const as = getItemActions({
    type: 'projeto', title: 'P', body_md: 'Baixe tudo e suba na sua IA.',
    children: [{ id: 1 }, { id: 2 }],
  });
  assert.deepEqual(as.map((a) => a.kind), ['download-project']);
});
test('getItemActions: an empty projeto offers no bundle', () => {
  assert.deepEqual(getItemActions({ type: 'projeto', title: 'X', children: [] }), []);
});
// A regular item does not become a packaging item just for having a body.
test('getItemActions: an item with no children offers no bundle', () => {
  const as = getItemActions({ type: 'prompt', title: 'P', body_md: 'x' });
  assert.equal(as.some((a) => a.kind === 'download-project'), false);
});

// ── .md download (track-61) ────────────────────────────────────────────────
// Elder's rule: whoever sees the raw markdown symbols downloads .md; whoever sees it
// rendered downloads PDF. Today the only literal text is `prompt` ("the prompt is always raw").
test('getItemActions: prompt delivers Copiar AND Baixar .md', () => {
  const as = getItemActions({ type: 'prompt', title: '# Prompt: X', body_md: 'faca isto' });
  assert.deepEqual(as.map((a) => a.label), ['Copiar', 'Baixar .md']);
});
// The other half of Élder's rule, built 2026-08-16. Until then processed content offered no
// download at all, so the only way out of it was Copiar.
test('getItemActions: processed content gets PDF, never .md', () => {
  const as = getItemActions({ type: 'conteudo', title: 'Aula 1', body_md: '# titulo' });
  assert.deepEqual(as.map((a) => a.label), ['Copiar', 'Baixar PDF']);
  assert.equal(as.filter((a) => a.kind === 'download-md').length, 0, 'no .md for processed text');
});
// The package obeys the SAME format rule as the single item. Élder, 2026-08-16: "md has no rich
// text, that's why I chose pdf; the actual prompts are in md". downloadProject drives fetch, the
// trail API and jsPDF, so this is a source guard: what must never silently return is the zip
// flattening everything back to .md.
test('the package zip applies the verbatim rule too, not a blanket .md', async () => {
  const src = await readFile(new URL('../trilha/js/actions.js', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('export async function downloadProject'));
  assert.match(fn, /isVerbatim\(/, 'the package branches on the verbatim flag');
  assert.match(fn, /itemPdfBytes\(/, 'processed text is rendered to PDF for the zip');
  assert.match(fn, /pdfFailed/, 'a failed PDF falls back to .md and is counted, not swallowed');
});

test('getItemActions: the two formats never appear together on one item', () => {
  // "se o usuário vê o markdown processado ... deve ser pdf. se vê os símbolos, então é md":
  // one or the other, decided by the verbatim flag, never both.
  for (const item of [
    { type: 'prompt', title: 'P', body_md: 'x' },
    { type: 'conteudo', title: 'C', body_md: 'x' },
    { type: 'conteudo', title: 'C', body_md: 'x', meta_json: { verbatim: true } },
    { type: 'prompt', title: 'P', body_md: 'x', meta_json: { verbatim: false } },
  ]) {
    const kinds = getItemActions(item).map((a) => a.kind);
    const md = kinds.filter((k) => k === 'download-md').length;
    const pdf = kinds.filter((k) => k === 'download-pdf').length;
    assert.equal(md + pdf, 1, JSON.stringify(item));
  }
});
// Elder's 3 real items (900028/900029/900030) are all `prompt`: with the .md they end up
// with TWO actions, which is what finally makes the dropdown show up on a live item.
test('getItemActions: Elder\'s 3 project items open the dropdown (2 actions each)', () => {
  for (const t of ['# Prompt: Resumo Preparatório para Audiência para Magistrados',
                   '# Modelo: Relatório Preparatório para Audiência CÍVEL para Magistrados',
                   '# Modelo: Relatório Preparatório para Audiência CRIMINAL para Magistrados']) {
    assert.equal(getItemActions({ type: 'prompt', title: t, body_md: 'x' }).length, 2, t);
  }
});
