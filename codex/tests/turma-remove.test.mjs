// cohorts/turma-remove.js — the dossiê "remover" with option B (track-42, Élder 2026-07-16).
//
// The rule under test is classifyRemoval. A person in their ONLY turma (or when the count lookup
// failed) is a TOTAL removal that must reach the completa/anonimizar modal — never a silent detach,
// which would purge the childless identity and leave the name written into submissions / Perguntas.
// A person in 2+ turmas ALWAYS asks this-turma-or-all first — single OR batch, so a bulk remove can
// never detach people with no prompt (Élder: "se tem mais de uma turma, é só perguntar").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { classifyRemoval } from '../cohorts/turma-remove.js';

const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const trJs = read('../cohorts/turma-remove.js');

const one = [{ turma_id: 1 }];
const two = [{ turma_id: 1 }, { turma_id: 2 }];

test('a person in a single turma is a TOTAL removal — erase, never a silent detach', () => {
  assert.equal(classifyRemoval({ id: 5 }, one), 'erase');
});

test('a failed turma lookup fails SAFE to the explicit modal, not a blind detach', () => {
  assert.equal(classifyRemoval({ id: 5 }, null), 'erase');
});

test('a person in 2+ turmas ALWAYS asks — single OR batch, no back door (advisor)', () => {
  // classifyRemoval does not even see the selection size, so a batch cannot skip the question.
  assert.equal(classifyRemoval({ id: 5 }, two), 'ask');
  assert.equal(classifyRemoval.length, 2);   // (person, turmas) — no `single` parameter to narrow it
});

test('an identity-less roster row (no e-mail) is only ever here — a plain detach', () => {
  assert.equal(classifyRemoval({ id: null }, null), 'detach');
  assert.equal(classifyRemoval({ id: null }, one), 'detach');
});

test('both removal paths exist: the erase modal for total, applyRosterAction for the detach', () => {
  assert.match(trJs, /openEraseModal\(/);
  assert.match(trJs, /applyRosterAction\('remove'/);
});

test('the count comes from the worker BEFORE any decision (ct_person_turmas)', () => {
  // Without the count we cannot tell a last turma from one of several — deciding blind is the bug.
  assert.match(trJs, /api\.personTurmas\(/);
});

test('the 2+ question is asked over the WHOLE selection, so a batch prompts too (advisor)', () => {
  // The old batch remove fired applyRosterAction with no prompt at all. Here the ask covers askList,
  // the set of every 2+-turma person selected — batch included.
  assert.match(trJs, /_askScope\(askList/);
  assert.match(trJs, /remove_scope_this/);
  assert.match(trJs, /remove_scope_all/);
});
