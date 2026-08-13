// codex/trilha/js/tarefa-submit-modal.js — pure helpers. The modal DOM + the
// facade submit flow are verified on staging; here we pin the error-code mapping
// and meta parsing (the logic that decides what the student sees on failure).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { errorMessage, parseMeta, identityConfig } from '../trilha/js/tarefa-submit-modal.js';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

test('errorMessage: known codes map to specific messages', () => {
  assert.match(errorMessage('already_submitted'), /já enviou/i);
  assert.match(errorMessage('anon_not_allowed'), /exige identificação/i);
  assert.match(errorMessage('forbidden'), /Acesso negado/i);
  assert.match(errorMessage('not_a_tarefa'), /não aceita respostas/i);
  assert.match(errorMessage('not_found'), /não encontrada/i);
});

test('errorMessage: unknown code falls back to a generic prefix', () => {
  assert.equal(errorMessage('weird_code'), 'Erro ao enviar: weird_code');
});

test('parseMeta: object passthrough, JSON string parse, junk -> {}', () => {
  assert.deepEqual(parseMeta({ field_type: 'text' }), { field_type: 'text' });
  assert.deepEqual(parseMeta('{"allow_anonymous":true}'), { allow_anonymous: true });
  assert.deepEqual(parseMeta('not json'), {});
  assert.deepEqual(parseMeta(null), {});
  assert.deepEqual(parseMeta(''), {});
});

// identityConfig: the modal's name/anon control decision (track-26 item 3).
test('identityConfig: logged-in student drops the name field', () => {
  const c = identityConfig('Ana Beatriz', false);
  assert.equal(c.authed, true);
  assert.equal(c.showNameField, false);
});
// NEVER comes pre-checked (Élder 2026-07-15: "o usuário deve marcar para ser anônimo" - the
// user has to check it to be anonymous). It used to, and that inverted consent: someone who
// logged in identified and just clicked "Enviar" ended up submitting anonymous WITHOUT
// MEANING TO, and the delivery arrived with no owner on the teacher's panel. It is
// irreversible: the name column goes null and there is nowhere to recover it from. Anonymity
// is the deviation, not the default.
test('identityConfig: logged-in + anon-allowed shows the option, but NOT checked', () => {
  const c = identityConfig('Ana', true);
  assert.equal(c.showAnonCheckbox, true);
  assert.equal(c.anonChecked, false);
});
test('identityConfig: logged-in + anon-NOT-allowed hides the checkbox entirely', () => {
  const c = identityConfig('Ana', false);
  assert.equal(c.showAnonCheckbox, false);
  assert.equal(c.anonChecked, false);
});

// "Pode ser anonima" (can be anonymous) is the teacher's choice FOR THIS TURMA (release,
// migration 0036), not a flag on the BANK item: there it would apply to every turma using the
// task. It has to be the SAME source ct_submit_tarefa consults, otherwise the modal offers
// what submission refuses.
test('the anonymous option comes from the release, not from the bank item\'s meta_json', () => {
  const src = read('../trilha/js/tarefa-submit-modal.js');
  assert.match(src, /const allowAnon = !!item\.allow_anonymous;/, 'reads the turma\'s choice');
  assert.ok(!/meta\.allow_anonymous/.test(src), 'no longer reads the bank flag');
});
test('identityConfig: open turma (no name) keeps the name field, anon never pre-checked', () => {
  const anon = identityConfig('', true);
  assert.equal(anon.authed, false);
  assert.equal(anon.showNameField, true);
  assert.equal(anon.showAnonCheckbox, true);
  assert.equal(anon.anonChecked, false);
  const named = identityConfig('   ', false); // whitespace-only counts as no identity
  assert.equal(named.authed, false);
  assert.equal(named.showNameField, true);
  assert.equal(named.showAnonCheckbox, false);
});
