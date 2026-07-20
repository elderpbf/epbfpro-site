// tests/roteiro-model.test.mjs
// track-46 fatia 1 — RED contract for the pure roteiro model.
// Behavioral: imports the real module (js/roteiro-model.js) and pins its API.
// The model is DOM-free (mirrors js/ementa.js). No window/document, no persistence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  emptyRoteiro, normalizeRoteiro, roteiroStats,
  totalMin, blocoMin, compat, fmtDur,
  patchPonto, nextBaseNumber, findPonto,
} from '../js/roteiro-model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readSrc = (rel) => fs.readFileSync(path.join(__dirname, rel), 'utf8').replace(/\r\n/g, '\n');

// A faithful VNC Aula 2 skeleton: 14 pontos + 1 pausa, durations summing to 143 min.
function vncAula2() {
  return {
    blocos: [
      { nome: 'Resgate', pontos: [
        { n: 0, rotulo: 'Resgate da Aula 1', tipo: 'resgate', dur: 5, notas: [] },
      ]},
      { nome: 'Engenharia de Prompt', pontos: [
        { n: 1, rotulo: 'Introduz engenharia de prompt', tipo: 'expositivo', dur: 5, notas: [] },
        { n: 2, rotulo: 'Prática 1', tipo: 'pratica', dur: 10, notas: [] },
        { n: 3, rotulo: 'Vago x estruturado', tipo: 'expositivo', dur: 8, notas: [] },
        { n: 4, rotulo: 'Frameworks', tipo: 'expositivo', dur: 10, notas: [] },
      ]},
      { nome: 'Contexto', pontos: [
        { n: 5, rotulo: 'Embeddings', tipo: 'expositivo', dur: 15, notas: [] },
        { n: 6, rotulo: 'C, O, R', tipo: 'expositivo', dur: 12, notas: [] },
        { n: 7, rotulo: 'Prática 2', tipo: 'pratica', dur: 12, notas: [] },
      ]},
      { nome: null, pausa: true, pontos: [
        { n: null, rotulo: 'Pausa', tipo: 'pausa', dur: 10, notas: [] },
      ]},
      { nome: 'Estrutura', pontos: [
        { n: 8, rotulo: 'Observação', tipo: 'expositivo', dur: 6, notas: [] },
        { n: 9, rotulo: 'Janela de contexto', tipo: 'expositivo', dur: 15, notas: [] },
        { n: 10, rotulo: 'Pulo do gato', tipo: 'expositivo', dur: 12, notas: [] },
        { n: 11, rotulo: 'Prática 3', tipo: 'pratica', dur: 12, notas: [] },
      ]},
      { nome: 'Fechamento', pontos: [
        { n: 12, rotulo: 'Fecho da construção', tipo: 'fechamento', dur: 6, notas: [] },
        { n: 13, rotulo: 'Fechamento', tipo: 'fechamento', dur: 5, notas: [] },
      ]},
    ],
  };
}

test('emptyRoteiro é uma forma vazia válida', () => {
  assert.deepEqual(emptyRoteiro(), { blocos: [] });
});

test('normalizeRoteiro coage lixo/JSON inválido pra vazio, NUNCA lança', () => {
  assert.deepEqual(normalizeRoteiro('lixo{'), { blocos: [] });
  assert.deepEqual(normalizeRoteiro(null), { blocos: [] });
  assert.deepEqual(normalizeRoteiro(42), { blocos: [] });
  assert.deepEqual(normalizeRoteiro(undefined), { blocos: [] });
});

test('normalizeRoteiro preserva blocos/pontos válidos e completa notas[] default', () => {
  const r = normalizeRoteiro({ blocos: [ { nome: 'Resgate', pontos: [ { n: 0, rotulo: 'x', tipo: 'resgate', dur: 5 } ] } ] });
  assert.equal(r.blocos.length, 1);
  assert.equal(r.blocos[0].pontos[0].dur, 5);
  assert.ok(Array.isArray(r.blocos[0].pontos[0].notas), 'ponto ganha notas:[] default');
});

test('normalizeRoteiro aceita string JSON válida', () => {
  const r = normalizeRoteiro(JSON.stringify(vncAula2()));
  assert.equal(totalMin(r), 143);
});

test('totalMin soma todos os pontos, inclusive a pausa', () => {
  assert.equal(totalMin(vncAula2()), 143);
});

test('blocoMin soma os pontos de um bloco', () => {
  const r = vncAula2();
  assert.equal(blocoMin(r.blocos.find((b) => b.nome === 'Resgate')), 5);
  assert.equal(blocoMin(r.blocos.find((b) => b.nome === 'Contexto')), 39);
});

test('roteiroStats conta pontos, práticas e pausa', () => {
  const s = roteiroStats(vncAula2());
  assert.equal(s.pontos, 14);   // 0..13, a pausa não conta como ponto numerado
  assert.equal(s.praticas, 3);
});

test('compat lê aula.hours (em horas) e devolve planejado/reserva/estouro', () => {
  assert.deepEqual(compat(vncAula2(), 4), { planejadoMin: 143, reservaMin: 97, estouro: false });
});

test('compat marca estouro quando o roteiro passa das horas da aula', () => {
  const c = compat(vncAula2(), 2); // 120 min < 143 planejado
  assert.equal(c.estouro, true);
  assert.equal(c.planejadoMin, 143);
  assert.equal(c.reservaMin, 0); // reserva nunca negativa
});

test('fmtDur formata minutos e horas', () => {
  assert.equal(fmtDur(45), '45 min');
  assert.equal(fmtDur(60), '1h');
  assert.equal(fmtDur(90), '1h30');
  assert.equal(fmtDur(143), '2h23');
});

// ── track-46 fatia 2: promover helpers ──────────────────────────────────────
test('patchPonto substitui o ponto de mesmo n no target, mantendo o resto intacto', () => {
  const target = { blocos: [
    { nome: 'Resgate', pontos: [{ n: 0, rotulo: 'antigo', tipo: 'resgate', dur: 5, notas: [] }] },
    { nome: 'Fechamento', pontos: [{ n: 1, rotulo: 'fecho', tipo: 'fechamento', dur: 5, notas: [] }] },
  ] };
  const source = { blocos: [
    { nome: 'Resgate', pontos: [{ n: 0, rotulo: 'novo', tipo: 'resgate', dur: 8, notas: ['melhor'] }] },
  ] };
  const out = patchPonto(target, source, { bi: 0, pi: 0 });
  assert.equal(out.blocos[0].pontos[0].rotulo, 'novo');
  assert.equal(out.blocos[0].pontos[0].dur, 8);
  assert.deepEqual(out.blocos[0].pontos[0].notas, ['melhor']);
  // o resto do target não foi tocado
  assert.equal(out.blocos[1].pontos[0].rotulo, 'fecho');
});

test('patchPonto nunca muta os roteiros de entrada (target/source)', () => {
  const target = { blocos: [{ nome: 'B', pontos: [{ n: 0, rotulo: 'x', tipo: 'expositivo', dur: 5, notas: [] }] }] };
  const targetSnapshot = JSON.parse(JSON.stringify(target));
  const source = { blocos: [{ nome: 'B', pontos: [{ n: 0, rotulo: 'y', tipo: 'expositivo', dur: 9, notas: [] }] }] };
  const sourceSnapshot = JSON.parse(JSON.stringify(source));
  patchPonto(target, source, { bi: 0, pi: 0 });
  assert.deepEqual(normalizeRoteiro(target), normalizeRoteiro(targetSnapshot));
  assert.deepEqual(normalizeRoteiro(source), normalizeRoteiro(sourceSnapshot));
});

test('patchPonto sem match por n cai pra posição bi/pi e faz push se não existir', () => {
  const target = { blocos: [{ nome: 'B', pontos: [] }] };
  const source = { blocos: [{ nome: 'B', pontos: [{ n: 3, rotulo: 'novo ponto', tipo: 'pratica', dur: 12, notas: [] }] }] };
  const out = patchPonto(target, source, { bi: 0, pi: 0 });
  assert.equal(out.blocos[0].pontos.length, 1);
  assert.equal(out.blocos[0].pontos[0].rotulo, 'novo ponto');
});

test('patchPonto com bi fora do range do target acrescenta um novo bloco no final (nunca lança)', () => {
  const target = { blocos: [] };
  const source = { blocos: [{ nome: 'Contexto', pontos: [{ n: 5, rotulo: 'embeddings', tipo: 'expositivo', dur: 15, notas: [] }] }] };
  const out = patchPonto(target, source, { bi: 0, pi: 0 });
  assert.equal(out.blocos.length, 1);
  assert.equal(out.blocos[0].nome, 'Contexto');
  assert.equal(out.blocos[0].pontos[0].rotulo, 'embeddings');
});

test('patchPonto com ref inválida (nenhum ponto na fonte) devolve o target normalizado, intacto', () => {
  const target = { blocos: [{ nome: 'B', pontos: [{ n: 0, rotulo: 'x', tipo: 'expositivo', dur: 5, notas: [] }] }] };
  const out = patchPonto(target, { blocos: [] }, { bi: 0, pi: 0 });
  assert.deepEqual(out, normalizeRoteiro(target));
});

// Regressão do BLOCK do sentinel (fatia 2.5): promover copia um ponto de OUTRO
// documento (a base do curso) para dentro deste, id junto — e como todo roteiro
// recomeça em p1, esse id colide de rotina com um ponto que já mora aqui. Duplicado
// = corrupção silenciosa (findPonto/removePonto param no primeiro match). O conserto
// mora no normalizeRoteiro, então o que este teste trava é o resultado do fluxo real.
test('promover um ponto de outro documento NÃO deixa id duplicado no destino', () => {
  const target = normalizeRoteiro({
    blocos: [{ nome: 'Aula', pontos: [
      { rotulo: 'a', tipo: 'expositivo', dur: 5 },
      { rotulo: 'b', tipo: 'expositivo', dur: 5 },
      { rotulo: 'c', tipo: 'expositivo', dur: 5 },
    ] }],
  });
  // A base do curso, normalizada por conta própria, também tem p1/p2/p3.
  const source = normalizeRoteiro({
    blocos: [{ nome: 'Base', pontos: [
      { rotulo: 'x', tipo: 'expositivo', dur: 5 },
      { rotulo: 'y', tipo: 'expositivo', dur: 5 },
      { rotulo: 'promovido', tipo: 'pratica', dur: 12 },
    ] }],
  });
  assert.equal(source.blocos[0].pontos[2].id, 'p3', 'a fonte de fato reusa um id que o destino já tem');

  const out = normalizeRoteiro(patchPonto(target, source, { bi: 0, pi: 2 }));
  const ids = out.blocos.flatMap((b) => b.pontos.map((p) => p.id));
  assert.equal(new Set(ids).size, ids.length, 'nenhum id repetido depois de promover');

  // E o dano que o duplicado causava não acontece: cada id acha o seu ponto.
  for (const p of out.blocos[0].pontos) {
    assert.equal(findPonto(out, p.id).ponto.rotulo, p.rotulo);
  }
});

test('nextBaseNumber devolve 1 quando não há bases e max+1 quando há', () => {
  assert.equal(nextBaseNumber([]), 1);
  assert.equal(nextBaseNumber(null), 1);
  assert.equal(nextBaseNumber([1, 2, 3]), 4);
  assert.equal(nextBaseNumber([1, 5, 3]), 6);
  assert.equal(nextBaseNumber(['2', '4']), 5); // string numbers coagidos
});

test('roteiro-model.js é DOM-free (sem window/document)', () => {
  const src = readSrc('../js/roteiro-model.js');
  assert.ok(!/\bwindow\b/.test(src), 'sem window');
  assert.ok(!/\bdocument\b/.test(src), 'sem document');
});
