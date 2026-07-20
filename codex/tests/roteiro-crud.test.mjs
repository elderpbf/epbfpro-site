// tests/roteiro-crud.test.mjs
// track-46 fatia 2.5 — RED contract for the STRUCTURAL mutators of the roteiro model.
//
// Why this file exists: fatias 1+2 shipped a roteiro you could not build. The view
// edited only `chamada`/`notas` of an ALREADY-EXISTING ponto, while the aula starts
// blank by Élder's rule and the curso bases start empty too — so there was no path
// to create any content at all. These are the mutators that fix that.
//
// Two load-bearing rules, both pinned below:
//   PURITY  — every mutator returns a NEW roteiro and never touches its input. The
//             view holds `_roteiro` and reassigns it; an in-place mutation would make
//             the "did it change?" question unanswerable and break undo later.
//   TOTAL   — no mutator ever throws. An unknown id returns the roteiro normalized
//             and otherwise untouched. The view calls these straight from click
//             handlers, where a throw is a dead tab.
//
// IDs are DETERMINISTIC (b1/b2…, p1/p2…, filled from the max already present) because
// the list-rail addresses rows by `getId`, and `n` renumbers on every reorder so it
// cannot be the identity. Deterministic also means testable: no Math.random, no Date.now.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeRoteiro, emptyRoteiro, totalMin, roteiroStats,
  nextBlocoId, nextPontoId,
  addBloco, renameBloco, removeBloco, reorderBlocos,
  addPonto, updatePonto, removePonto, movePonto, reorderPontos,
  findPonto, renumber, addPausa, TIPOS,
} from '../js/roteiro-model.js';

// A small two-bloco roteiro WITHOUT ids, so normalize has to mint them.
function seed() {
  return normalizeRoteiro({
    blocos: [
      { nome: 'Resgate', pontos: [
        { n: 0, rotulo: 'Resgate da Aula 1', tipo: 'resgate', dur: 5 },
      ] },
      { nome: 'Contexto', pontos: [
        { n: 1, rotulo: 'Embeddings', tipo: 'expositivo', dur: 15 },
        { n: 2, rotulo: 'Prática 2', tipo: 'pratica', dur: 12 },
      ] },
    ],
  });
}

const snapshot = (r) => JSON.parse(JSON.stringify(r));
const rotulos = (r) => r.blocos.flatMap((b) => b.pontos.map((p) => p.rotulo));
const blocoNomes = (r) => r.blocos.map((b) => b.nome);

// ── IDs ─────────────────────────────────────────────────────────────────────
test('normalizeRoteiro atribui ids determinísticos a blocos (b1,b2…) e pontos (p1,p2…)', () => {
  const r = seed();
  assert.deepEqual(r.blocos.map((b) => b.id), ['b1', 'b2']);
  assert.deepEqual(r.blocos.flatMap((b) => b.pontos.map((p) => p.id)), ['p1', 'p2', 'p3']);
});

test('normalizeRoteiro PRESERVA ids existentes e preenche só os que faltam, a partir do máximo', () => {
  const r = normalizeRoteiro({
    blocos: [
      { id: 'b7', nome: 'A', pontos: [{ id: 'p4', rotulo: 'x', tipo: 'expositivo', dur: 5 }] },
      { nome: 'B', pontos: [{ rotulo: 'y', tipo: 'expositivo', dur: 5 }] },
    ],
  });
  assert.deepEqual(r.blocos.map((b) => b.id), ['b7', 'b8'], 'o novo bloco continua do máximo, não colide');
  assert.deepEqual(r.blocos.flatMap((b) => b.pontos.map((p) => p.id)), ['p4', 'p5']);
});

test('normalizar duas vezes é estável: os ids não mudam (idempotência)', () => {
  const once = seed();
  const twice = normalizeRoteiro(snapshot(once));
  assert.deepEqual(twice, once);
});

test('nextBlocoId / nextPontoId são previsíveis, e num roteiro vazio começam em 1', () => {
  assert.equal(nextBlocoId(emptyRoteiro()), 'b1');
  assert.equal(nextPontoId(emptyRoteiro()), 'p1');
  const r = seed();
  assert.equal(nextBlocoId(r), 'b3');
  assert.equal(nextPontoId(r), 'p4');
});

// ── Blocos ──────────────────────────────────────────────────────────────────
test('addBloco acrescenta no fim, com o id previsto por nextBlocoId e pontos vazios', () => {
  const r = seed();
  const id = nextBlocoId(r);
  const out = addBloco(r, { nome: 'Fechamento' });
  assert.equal(out.blocos.length, 3);
  assert.equal(out.blocos[2].id, id);
  assert.equal(out.blocos[2].nome, 'Fechamento');
  assert.deepEqual(out.blocos[2].pontos, []);
});

test('addBloco NÃO muta o roteiro de entrada', () => {
  const r = seed();
  const before = snapshot(r);
  addBloco(r, { nome: 'Novo' });
  assert.deepEqual(r, before, 'a entrada saiu intacta');
});

test('renameBloco troca só o nome do bloco alvo', () => {
  const out = renameBloco(seed(), 'b2', 'Estrutura');
  assert.deepEqual(blocoNomes(out), ['Resgate', 'Estrutura']);
  assert.equal(out.blocos[1].pontos.length, 2, 'os pontos ficam onde estavam');
});

test('removeBloco leva os pontos dele junto e renumera o que sobrou', () => {
  const out = removeBloco(seed(), 'b1');
  assert.deepEqual(blocoNomes(out), ['Contexto']);
  assert.deepEqual(rotulos(out), ['Embeddings', 'Prática 2']);
  assert.deepEqual(out.blocos[0].pontos.map((p) => p.n), [0, 1], 'renumerado do zero');
});

test('reorderBlocos reordena pela lista de ids e ignora id desconhecido sem perder bloco', () => {
  const out = reorderBlocos(seed(), ['b2', 'b1']);
  assert.deepEqual(blocoNomes(out), ['Contexto', 'Resgate']);
  const partial = reorderBlocos(seed(), ['b2', 'bZZ']);
  assert.equal(partial.blocos.length, 2, 'nenhum bloco some por causa de um id que não existe');
});

// ── Pontos ──────────────────────────────────────────────────────────────────
test('addPonto acrescenta no fim do bloco alvo com o id previsto', () => {
  const r = seed();
  const id = nextPontoId(r);
  const out = addPonto(r, 'b1', { rotulo: 'Novo ponto', tipo: 'pratica', dur: 12 });
  assert.equal(out.blocos[0].pontos.length, 2);
  assert.equal(out.blocos[0].pontos[1].id, id);
  assert.equal(out.blocos[0].pontos[1].tipo, 'pratica');
  assert.deepEqual(out.blocos[0].pontos[1].notas, [], 'ponto novo já nasce com notas[]');
});

test('addPonto sem campos usa defaults sãos (tipo expositivo, dur numérica, rótulo vazio)', () => {
  const out = addPonto(seed(), 'b1', {});
  const p = out.blocos[0].pontos[1];
  assert.equal(p.tipo, 'expositivo');
  assert.equal(typeof p.dur, 'number');
  assert.equal(typeof p.rotulo, 'string');
});

test('updatePonto aplica só o patch pedido e preserva o resto do ponto', () => {
  const out = updatePonto(seed(), 'p2', { rotulo: 'Janela de contexto', dur: 20 });
  const p = findPonto(out, 'p2').ponto;
  assert.equal(p.rotulo, 'Janela de contexto');
  assert.equal(p.dur, 20);
  assert.equal(p.tipo, 'expositivo', 'campo não citado no patch não se mexe');
});

test('updatePonto edita tipo, chamada e notas (os campos que o painel direito expõe)', () => {
  let out = updatePonto(seed(), 'p3', { tipo: 'fechamento' });
  out = updatePonto(out, 'p3', { chamada: 'Quem já usou isso na prática?' });
  out = updatePonto(out, 'p3', { notas: ['citar o caso do cliente'] });
  const p = findPonto(out, 'p3').ponto;
  assert.equal(p.tipo, 'fechamento');
  assert.equal(p.chamada, 'Quem já usou isso na prática?');
  assert.deepEqual(p.notas, ['citar o caso do cliente']);
});

test('updatePonto NÃO deixa reescrever id nem n por dentro do patch', () => {
  const out = updatePonto(seed(), 'p2', { id: 'pHACK', n: 99, rotulo: 'ok' });
  assert.equal(findPonto(out, 'p2').ponto.rotulo, 'ok', 'o campo legítimo passou');
  assert.equal(findPonto(out, 'pHACK'), null, 'o id não foi sequestrado');
});

test('removePonto tira o ponto e renumera os seguintes', () => {
  const out = removePonto(seed(), 'p2');
  assert.deepEqual(rotulos(out), ['Resgate da Aula 1', 'Prática 2']);
  assert.deepEqual(out.blocos.flatMap((b) => b.pontos.map((p) => p.n)), [0, 1]);
});

test('movePonto leva o ponto para outro bloco, na posição pedida pela ordem de ids', () => {
  // 'p3' (Prática 2) sai do bloco Contexto e entra no Resgate ANTES do ponto que já estava lá.
  const out = movePonto(seed(), 'p3', 'b1', ['p3', 'p1']);
  assert.deepEqual(out.blocos[0].pontos.map((p) => p.rotulo), ['Prática 2', 'Resgate da Aula 1']);
  assert.deepEqual(out.blocos[1].pontos.map((p) => p.rotulo), ['Embeddings']);
  assert.deepEqual(out.blocos.flatMap((b) => b.pontos.map((p) => p.n)), [0, 1, 2], 'renumera no documento inteiro');
});

test('reorderPontos reordena dentro do mesmo bloco', () => {
  const out = reorderPontos(seed(), 'b2', ['p3', 'p2']);
  assert.deepEqual(out.blocos[1].pontos.map((p) => p.rotulo), ['Prática 2', 'Embeddings']);
});

test('findPonto devolve o ponto, o bloco e os índices; null quando não existe', () => {
  const r = seed();
  const hit = findPonto(r, 'p3');
  assert.equal(hit.ponto.rotulo, 'Prática 2');
  assert.equal(hit.bloco.id, 'b2');
  assert.equal(hit.bi, 1);
  assert.equal(hit.pi, 1);
  assert.equal(findPonto(r, 'pNOPE'), null);
});

// ── Pausa ───────────────────────────────────────────────────────────────────
test('addPausa cria um bloco de pausa com um ponto de tipo pausa, e o tempo dela conta no total', () => {
  const r = seed();
  const out = addPausa(r, { dur: 10 });
  const pausaBloco = out.blocos[out.blocos.length - 1];
  assert.equal(pausaBloco.pausa, true);
  assert.equal(pausaBloco.pontos.length, 1);
  assert.equal(pausaBloco.pontos[0].tipo, 'pausa');
  assert.equal(pausaBloco.pontos[0].dur, 10);
  assert.equal(totalMin(out), totalMin(r) + 10, 'a pausa entra no tempo planejado');
});

test('a pausa NÃO recebe número e NÃO conta como ponto nas estatísticas', () => {
  const out = addPausa(seed(), { dur: 10 });
  const pausa = out.blocos[out.blocos.length - 1].pontos[0];
  assert.equal(pausa.n, null);
  assert.equal(roteiroStats(out).pontos, 3, 'os 3 pontos de verdade, a pausa fora');
});

// ── renumber ────────────────────────────────────────────────────────────────
test('renumber numera 0..N-1 os pontos não-pausa na ordem do documento', () => {
  const r = addPausa(seed(), { dur: 10 });
  const out = renumber(reorderBlocos(r, ['b2', 'b1', r.blocos[2].id]));
  const ns = out.blocos.flatMap((b) => b.pontos.map((p) => p.n));
  assert.deepEqual(ns, [0, 1, 2, null], 'renumerado na nova ordem; a pausa fica null');
});

// ── Totalidade: nada disso pode lançar ──────────────────────────────────────
test('id inexistente NUNCA lança: devolve o roteiro normalizado e intacto', () => {
  const r = seed();
  const same = snapshot(r);
  assert.deepEqual(renameBloco(r, 'bNOPE', 'x'), same);
  assert.deepEqual(removeBloco(r, 'bNOPE'), same);
  assert.deepEqual(addPonto(r, 'bNOPE', { rotulo: 'x' }), same);
  assert.deepEqual(updatePonto(r, 'pNOPE', { rotulo: 'x' }), same);
  assert.deepEqual(removePonto(r, 'pNOPE'), same);
  assert.deepEqual(movePonto(r, 'pNOPE', 'b1', []), same);
  assert.deepEqual(reorderPontos(r, 'bNOPE', []), same);
});

test('lixo na entrada de qualquer mutador vira roteiro vazio, sem exceção', () => {
  assert.deepEqual(addBloco(null, { nome: 'x' }).blocos.length, 1, 'null vira vazio e aceita o bloco');
  assert.deepEqual(removeBloco('lixo{', 'b1'), emptyRoteiro());
  assert.deepEqual(updatePonto(undefined, 'p1', {}), emptyRoteiro());
  assert.deepEqual(reorderBlocos(42, []), emptyRoteiro());
});

test('TODOS os mutadores são puros: a entrada sai byte a byte igual', () => {
  const r = seed();
  const before = snapshot(r);
  renameBloco(r, 'b1', 'X');
  removeBloco(r, 'b1');
  reorderBlocos(r, ['b2', 'b1']);
  addPonto(r, 'b1', { rotulo: 'X' });
  updatePonto(r, 'p1', { rotulo: 'X', notas: ['a'] });
  removePonto(r, 'p1');
  movePonto(r, 'p1', 'b2', ['p1']);
  reorderPontos(r, 'b2', ['p3', 'p2']);
  addPausa(r, { dur: 10 });
  renumber(r);
  assert.deepEqual(r, before);
});

test('updatePonto com notas não deixa o array compartilhado com o chamador (cópia, não alias)', () => {
  const notas = ['uma'];
  const out = updatePonto(seed(), 'p1', { notas });
  notas.push('duas');
  assert.deepEqual(findPonto(out, 'p1').ponto.notas, ['uma'], 'mexer no array de fora não alcança o roteiro');
});

// ── TIPOS ───────────────────────────────────────────────────────────────────
test('TIPOS lista os tipos escolhíveis no dropdown, sem pausa (pausa é bloco, não escolha)', () => {
  assert.deepEqual(TIPOS, ['resgate', 'expositivo', 'pratica', 'fechamento']);
});
