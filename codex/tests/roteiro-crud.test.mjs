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
test('normalizeRoteiro assigns deterministic ids to blocos (b1,b2…) and pontos (p1,p2…)', () => {
  const r = seed();
  assert.deepEqual(r.blocos.map((b) => b.id), ['b1', 'b2']);
  assert.deepEqual(r.blocos.flatMap((b) => b.pontos.map((p) => p.id)), ['p1', 'p2', 'p3']);
});

test('normalizeRoteiro PRESERVES existing ids and fills only the missing ones, from the max', () => {
  const r = normalizeRoteiro({
    blocos: [
      { id: 'b7', nome: 'A', pontos: [{ id: 'p4', rotulo: 'x', tipo: 'expositivo', dur: 5 }] },
      { nome: 'B', pontos: [{ rotulo: 'y', tipo: 'expositivo', dur: 5 }] },
    ],
  });
  assert.deepEqual(r.blocos.map((b) => b.id), ['b7', 'b8'], 'the new bloco continues from the max, no collision');
  assert.deepEqual(r.blocos.flatMap((b) => b.pontos.map((p) => p.id)), ['p4', 'p5']);
});

test('normalizing twice is stable: the ids do not change (idempotency)', () => {
  const once = seed();
  const twice = normalizeRoteiro(snapshot(once));
  assert.deepEqual(twice, once);
});

test('nextBlocoId / nextPontoId are predictable, and start at 1 for an empty roteiro', () => {
  assert.equal(nextBlocoId(emptyRoteiro()), 'b1');
  assert.equal(nextPontoId(emptyRoteiro()), 'p1');
  const r = seed();
  assert.equal(nextBlocoId(r), 'b3');
  assert.equal(nextPontoId(r), 'p4');
});

// Ids are DOCUMENT-scoped: every roteiro restarts at b1/p1. So an id coming from
// ANOTHER document collides routinely, which is exactly what `promover` does
// (patchPonto takes a ponto from the course base and shoves it into the aula's
// roteiro, id and all). A duplicate id is silent corruption: findPonto/updatePonto/
// removePonto stop at the FIRST match, so editing or deleting "that ponto" hits the
// wrong one. normalizeRoteiro is the sole guardian: the first stays, the repeat gets reminted.
const allIds = (r) => r.blocos.flatMap((b) => [b.id, ...b.pontos.map((p) => p.id)]);
const hasDupes = (xs) => new Set(xs).size !== xs.length;

test('normalizeRoteiro REMINTS a repeated id: the first stays, the duplicate gets a new one', () => {
  const r = normalizeRoteiro({
    blocos: [
      { id: 'b1', nome: 'A', pontos: [{ id: 'p1', rotulo: 'primeiro', tipo: 'expositivo', dur: 5 }] },
      { id: 'b1', nome: 'B', pontos: [{ id: 'p1', rotulo: 'colidido', tipo: 'expositivo', dur: 5 }] },
    ],
  });
  assert.ok(!hasDupes(allIds(r)), 'no repeated id survives the normalize');
  assert.equal(r.blocos[0].id, 'b1', 'the first keeps its identity');
  assert.equal(r.blocos[0].pontos[0].id, 'p1');
  assert.notEqual(r.blocos[1].id, 'b1');
  assert.notEqual(r.blocos[1].pontos[0].id, 'p1');
  assert.equal(r.blocos[1].pontos[0].rotulo, 'colidido', 'the duplicate\'s content is not lost');
});

test('after the remint, each id resolves to the CORRECT ponto (the real damage from the duplicate)', () => {
  const r = normalizeRoteiro({
    blocos: [{ nome: 'A', pontos: [
      { id: 'p1', rotulo: 'primeiro', tipo: 'expositivo', dur: 5 },
      { id: 'p1', rotulo: 'segundo', tipo: 'pratica', dur: 9 },
    ] }],
  });
  const [a, b] = r.blocos[0].pontos;
  assert.equal(findPonto(r, a.id).ponto.rotulo, 'primeiro');
  assert.equal(findPonto(r, b.id).ponto.rotulo, 'segundo', 'the second is reachable, does not vanish behind the first');
  const out = removePonto(r, b.id);
  assert.deepEqual(rotulos(out), ['primeiro'], 'deleting the second deletes the second, not the first');
});

test('normalizing again is stable even after a remint (does not keep renaming on every load)', () => {
  const once = normalizeRoteiro({
    blocos: [{ nome: 'A', pontos: [
      { id: 'p1', rotulo: 'x', tipo: 'expositivo', dur: 5 },
      { id: 'p1', rotulo: 'y', tipo: 'expositivo', dur: 5 },
    ] }],
  });
  assert.deepEqual(normalizeRoteiro(snapshot(once)), once);
});

// ── Blocos ──────────────────────────────────────────────────────────────────
test('addBloco appends at the end, with the id predicted by nextBlocoId and empty pontos', () => {
  const r = seed();
  const id = nextBlocoId(r);
  const out = addBloco(r, { nome: 'Fechamento' });
  assert.equal(out.blocos.length, 3);
  assert.equal(out.blocos[2].id, id);
  assert.equal(out.blocos[2].nome, 'Fechamento');
  assert.deepEqual(out.blocos[2].pontos, []);
});

test('addBloco does NOT mutate the input roteiro', () => {
  const r = seed();
  const before = snapshot(r);
  addBloco(r, { nome: 'Novo' });
  assert.deepEqual(r, before, 'the input came out intact');
});

test('renameBloco swaps only the target bloco\'s name', () => {
  const out = renameBloco(seed(), 'b2', 'Estrutura');
  assert.deepEqual(blocoNomes(out), ['Resgate', 'Estrutura']);
  assert.equal(out.blocos[1].pontos.length, 2, 'the pontos stay where they were');
});

test('removeBloco takes its pontos along and renumbers what is left', () => {
  const out = removeBloco(seed(), 'b1');
  assert.deepEqual(blocoNomes(out), ['Contexto']);
  assert.deepEqual(rotulos(out), ['Embeddings', 'Prática 2']);
  assert.deepEqual(out.blocos[0].pontos.map((p) => p.n), [0, 1], 'renumbered from zero');
});

test('reorderBlocos reorders by the id list and ignores an unknown id without losing any bloco', () => {
  const out = reorderBlocos(seed(), ['b2', 'b1']);
  assert.deepEqual(blocoNomes(out), ['Contexto', 'Resgate']);
  const partial = reorderBlocos(seed(), ['b2', 'bZZ']);
  assert.equal(partial.blocos.length, 2, 'no bloco vanishes because of an id that does not exist');
});

// ── Pontos ──────────────────────────────────────────────────────────────────
test('addPonto appends at the end of the target bloco with the predicted id', () => {
  const r = seed();
  const id = nextPontoId(r);
  const out = addPonto(r, 'b1', { rotulo: 'Novo ponto', tipo: 'pratica', dur: 12 });
  assert.equal(out.blocos[0].pontos.length, 2);
  assert.equal(out.blocos[0].pontos[1].id, id);
  assert.equal(out.blocos[0].pontos[1].tipo, 'pratica');
  assert.deepEqual(out.blocos[0].pontos[1].notas, [], 'a new ponto is already born with notas[]');
});

test('addPonto with no fields uses sane defaults (tipo expositivo, numeric dur, empty rótulo)', () => {
  const out = addPonto(seed(), 'b1', {});
  const p = out.blocos[0].pontos[1];
  assert.equal(p.tipo, 'expositivo');
  assert.equal(typeof p.dur, 'number');
  assert.equal(typeof p.rotulo, 'string');
});

test('updatePonto applies only the requested patch and preserves the rest of the ponto', () => {
  const out = updatePonto(seed(), 'p2', { rotulo: 'Janela de contexto', dur: 20 });
  const p = findPonto(out, 'p2').ponto;
  assert.equal(p.rotulo, 'Janela de contexto');
  assert.equal(p.dur, 20);
  assert.equal(p.tipo, 'expositivo', 'a field not named in the patch is untouched');
});

test('updatePonto edits tipo, chamada, and notas (the fields the right-hand panel exposes)', () => {
  let out = updatePonto(seed(), 'p3', { tipo: 'fechamento' });
  out = updatePonto(out, 'p3', { chamada: 'Quem já usou isso na prática?' });
  out = updatePonto(out, 'p3', { notas: ['citar o caso do cliente'] });
  const p = findPonto(out, 'p3').ponto;
  assert.equal(p.tipo, 'fechamento');
  assert.equal(p.chamada, 'Quem já usou isso na prática?');
  assert.deepEqual(p.notas, ['citar o caso do cliente']);
});

test('updatePonto does NOT allow overwriting id or n through the patch', () => {
  const out = updatePonto(seed(), 'p2', { id: 'pHACK', n: 99, rotulo: 'ok' });
  assert.equal(findPonto(out, 'p2').ponto.rotulo, 'ok', 'the legitimate field went through');
  assert.equal(findPonto(out, 'pHACK'), null, 'the id was not hijacked');
});

test('removePonto removes the ponto and renumbers the ones that follow', () => {
  const out = removePonto(seed(), 'p2');
  assert.deepEqual(rotulos(out), ['Resgate da Aula 1', 'Prática 2']);
  assert.deepEqual(out.blocos.flatMap((b) => b.pontos.map((p) => p.n)), [0, 1]);
});

test('movePonto moves the ponto to another bloco, at the position requested by the id order', () => {
  // 'p3' (Prática 2) leaves the Contexto bloco and enters Resgate BEFORE the ponto already there.
  const out = movePonto(seed(), 'p3', 'b1', ['p3', 'p1']);
  assert.deepEqual(out.blocos[0].pontos.map((p) => p.rotulo), ['Prática 2', 'Resgate da Aula 1']);
  assert.deepEqual(out.blocos[1].pontos.map((p) => p.rotulo), ['Embeddings']);
  assert.deepEqual(out.blocos.flatMap((b) => b.pontos.map((p) => p.n)), [0, 1, 2], 'renumbers across the whole document');
});

test('reorderPontos reorders within the same bloco', () => {
  const out = reorderPontos(seed(), 'b2', ['p3', 'p2']);
  assert.deepEqual(out.blocos[1].pontos.map((p) => p.rotulo), ['Prática 2', 'Embeddings']);
});

test('findPonto returns the ponto, the bloco, and the indexes; null when it does not exist', () => {
  const r = seed();
  const hit = findPonto(r, 'p3');
  assert.equal(hit.ponto.rotulo, 'Prática 2');
  assert.equal(hit.bloco.id, 'b2');
  assert.equal(hit.bi, 1);
  assert.equal(hit.pi, 1);
  assert.equal(findPonto(r, 'pNOPE'), null);
});

// ── Pausa ───────────────────────────────────────────────────────────────────
test('addPausa creates a pausa bloco with one ponto of tipo pausa, and its time counts toward the total', () => {
  const r = seed();
  const out = addPausa(r, { dur: 10 });
  const pausaBloco = out.blocos[out.blocos.length - 1];
  assert.equal(pausaBloco.pausa, true);
  assert.equal(pausaBloco.pontos.length, 1);
  assert.equal(pausaBloco.pontos[0].tipo, 'pausa');
  assert.equal(pausaBloco.pontos[0].dur, 10);
  assert.equal(totalMin(out), totalMin(r) + 10, 'the pausa counts toward the planned time');
});

test('the pausa does NOT get a number and does NOT count as a ponto in the statistics', () => {
  const out = addPausa(seed(), { dur: 10 });
  const pausa = out.blocos[out.blocos.length - 1].pontos[0];
  assert.equal(pausa.n, null);
  assert.equal(roteiroStats(out).pontos, 3, 'the 3 real pontos, the pausa excluded');
});

// ── renumber ────────────────────────────────────────────────────────────────
test('renumber numbers the non-pausa pontos 0..N-1 in document order', () => {
  const r = addPausa(seed(), { dur: 10 });
  const out = renumber(reorderBlocos(r, ['b2', 'b1', r.blocos[2].id]));
  const ns = out.blocos.flatMap((b) => b.pontos.map((p) => p.n));
  assert.deepEqual(ns, [0, 1, 2, null], 'renumbered in the new order; the pausa stays null');
});

// ── Totality: none of this can throw ──────────────────────────────────────
test('a nonexistent id NEVER throws: returns the roteiro normalized and intact', () => {
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

test('garbage input to any mutator turns into an empty roteiro, no exception', () => {
  assert.deepEqual(addBloco(null, { nome: 'x' }).blocos.length, 1, 'null becomes empty and accepts the bloco');
  assert.deepEqual(removeBloco('lixo{', 'b1'), emptyRoteiro());
  assert.deepEqual(updatePonto(undefined, 'p1', {}), emptyRoteiro());
  assert.deepEqual(reorderBlocos(42, []), emptyRoteiro());
});

test('ALL mutators are pure: the input comes out byte for byte equal', () => {
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

test('updatePonto with notas does not leave the array shared with the caller (copy, not alias)', () => {
  const notas = ['uma'];
  const out = updatePonto(seed(), 'p1', { notas });
  notas.push('duas');
  assert.deepEqual(findPonto(out, 'p1').ponto.notas, ['uma'], 'mutating the outside array does not reach the roteiro');
});

// ── TIPOS ───────────────────────────────────────────────────────────────────
test('TIPOS lists the choosable types in the dropdown, without pausa (pausa is a bloco, not a choice)', () => {
  assert.deepEqual(TIPOS, ['resgate', 'expositivo', 'pratica', 'fechamento']);
});
