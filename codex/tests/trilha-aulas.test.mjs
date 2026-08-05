// tests/trilha-aulas.test.mjs
// Codex Trail · Aulas timeline. Unit-tests the DOM-free logic: the NOVO-window
// freshness derivation and the item-action dispatch. Card/timeline DOM is
// verified visually on staging.
import { test } from 'node:test';
import assert from 'node:assert/strict';
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

// ── getItemActions: o fim da exclusao mutua (track-61) ──────────────────────
// A cadeia antiga tinha UM `return`, entao um item com anexo PERDIA o "Copiar" e
// prompt + arquivos juntos era irrepresentavel. Este e o defeito que o track-61 conserta.
test('getItemActions: anexo + corpo entregam Baixar E Copiar (antes so Baixar)', () => {
  const as = getItemActions({ type: 'prompt', title: 'P', body_md: 'instrucao', meta_json: { attachment_url: 'base.pdf' } });
  assert.deepEqual(as.map((a) => a.label), ['Baixar', 'Copiar', 'Baixar .md']);
});
test('getItemActions: pdf + anexo + doc + corpo entregam as quatro, nessa ordem', () => {
  const as = getItemActions({
    type: 'x', body_md: 'txt',
    meta_json: { pdf_url: 'a.pdf', attachment_url: 'b.zip', doc_url: 'https://d' },
  });
  assert.deepEqual(as.map((a) => a.label), ['Baixar PDF', 'Baixar', 'Documentação', 'Copiar']);
});
// A primeira acao segue sendo a que a linha fechada mostrava sozinha, entao item de acao
// unica nao muda em nada.
test('getItemActions: a primeira acao e a que getItemAction ja devolvia', () => {
  const item = { type: 'x', body_md: 'txt', meta_json: { pdf_url: 'a.pdf' } };
  assert.deepEqual(getItemActions(item)[0], getItemAction(item));
});
// Lab, interativo e tarefa seguem exclusivos: a acao E o item, nao ha o que somar.
test('getItemActions: lab e exclusivo mesmo com corpo e anexo', () => {
  const as = getItemActions({ type: 'lab', body_md: 'txt', meta_json: { lab_key: 'k1', attachment_url: 'x.pdf' } });
  assert.equal(as.length, 1);
  assert.equal(as[0].kind, 'lab-open');
});
test('getItemActions: tarefa e exclusiva mesmo com corpo', () => {
  const as = getItemActions({ type: 'tarefa', id: 7, body_md: 'txt' });
  assert.equal(as.length, 1);
  assert.equal(as[0].kind, 'go-tarefas');
});
test('getItemActions: nada acionavel -> lista vazia', () => {
  assert.deepEqual(getItemActions({ type: 'x' }), []);
});

// ── projeto: item embalador (track-61) ─────────────────────────────────────
// "quando eu insiro o projeto na trilha nao aparecem os 3 itens separadamente, aparece o
// projeto, e quando eu abro ele aparecem listados os 3 itens" (Élder 2026-08-04).
test('getItemActions: projeto oferece Baixar tudo (.zip)', () => {
  const as = getItemActions({
    type: 'projeto', title: '# Projeto Audiencia',
    children: [{ id: 900028 }, { id: 900029 }, { id: 900030 }],
  });
  const zip = as.find((a) => a.kind === 'download-project');
  assert.ok(zip, 'o projeto tem que oferecer o pacote');
  assert.deepEqual(zip.project.items, [
    { id: 900028, dir: '' }, { id: 900029, dir: '' }, { id: 900030, dir: '' },
  ]);
  assert.equal(zip.project.name, 'Projeto Audiencia', 'o # do markdown sai do nome do arquivo');
});

// O aninhamento vira PASTA: a estrutura que o aluno ve na trilha e a que ele abre no
// descompactador (Elder 2026-08-05).
test('packageOf: o filho que tambem embala vira pasta no zip', () => {
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

// Elder 2026-08-05, sobre pasta com lab dentro: permitir e AVISAR, nunca proibir. Proibir
// deixaria a regra dependente da ORDEM (poe um lab primeiro e a pasta trava contra documentos).
test('packageOf: lab e interativo saem do zip mas sao CONTADOS, nao sumidos', () => {
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
  assert.equal(zip.project.skipped, 2, 'o que nao cabe no zip tem que ser dito, nao escondido');
});

// Uma tarefa que leva documentos dentro precisa das DUAS acoes: "Entregar" e o que ela e,
// "Baixar tudo" e o que ela carrega. So a exclusiva esconderia os anexos.
test('getItemActions: tarefa com filhos mantem a acao dela E ganha o pacote', () => {
  const as = getItemActions({ type: 'tarefa', title: 'Tarefa 1', children: [{ id: 9, title: 'Anexo' }] });
  assert.ok(as.length >= 2, 'a tarefa nao pode perder a acao propria');
  assert.ok(as.find((a) => a.kind === 'download-project'), 'nem os documentos que ela carrega');
});
// Elder testou e pegou a incoerencia: o "Copiar" copiava a frase de apresentacao do projeto
// enquanto o "Baixar" trazia um zip de 3 arquivos, entao nao dava pra prever o que cada botao
// faria. Um embalador so oferece acoes DO PACOTE; o texto dele e pra ler na tela.
test('getItemActions: projeto NAO oferece Copiar da propria apresentacao', () => {
  const as = getItemActions({
    type: 'projeto', title: 'P', body_md: 'Baixe tudo e suba na sua IA.',
    children: [{ id: 1 }, { id: 2 }],
  });
  assert.deepEqual(as.map((a) => a.kind), ['download-project']);
});
test('getItemActions: projeto vazio nao oferece pacote', () => {
  assert.deepEqual(getItemActions({ type: 'projeto', title: 'X', children: [] }), []);
});
// Um item comum nao vira embalador so por ter corpo.
test('getItemActions: item sem filhos nao oferece pacote', () => {
  const as = getItemActions({ type: 'prompt', title: 'P', body_md: 'x' });
  assert.equal(as.some((a) => a.kind === 'download-project'), false);
});

// ── download .md (track-61) ────────────────────────────────────────────────
// Regra do Elder: quem ve os simbolos do markdown baixa .md; quem ve processado baixa PDF.
// Hoje o unico texto literal e o `prompt` ("o prompt sempre cru").
test('getItemActions: prompt entrega Copiar E Baixar .md', () => {
  const as = getItemActions({ type: 'prompt', title: '# Prompt: X', body_md: 'faca isto' });
  assert.deepEqual(as.map((a) => a.label), ['Copiar', 'Baixar .md']);
});
test('getItemActions: conteudo processado NAO ganha .md (sai em PDF, fatia propria)', () => {
  const as = getItemActions({ type: 'conteudo', title: 'Aula 1', body_md: '# titulo' });
  assert.deepEqual(as.map((a) => a.label), ['Copiar']);
});
// Os 3 itens reais do Elder (900028/900029/900030) sao todos `prompt`: com o .md eles passam
// a ter DUAS acoes, que e o que finalmente faz o dropdown aparecer em item vivo.
test('getItemActions: os 3 itens do projeto do Elder abrem o dropdown (2 acoes cada)', () => {
  for (const t of ['# Prompt: Resumo Preparatório para Audiência para Magistrados',
                   '# Modelo: Relatório Preparatório para Audiência CÍVEL para Magistrados',
                   '# Modelo: Relatório Preparatório para Audiência CRIMINAL para Magistrados']) {
    assert.equal(getItemActions({ type: 'prompt', title: t, body_md: 'x' }).length, 2, t);
  }
});
