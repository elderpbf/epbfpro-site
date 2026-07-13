// codex/trilha/js/tarefa-submit-modal.js — pure helpers. The modal DOM + the
// facade submit flow are verified on staging; here we pin the error-code mapping
// and meta parsing (the logic that decides what the student sees on failure).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { errorMessage, parseMeta, identityConfig } from '../trilha/js/tarefa-submit-modal.js';

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
test('identityConfig: logged-in + anon-allowed shows the checkbox PRE-CHECKED', () => {
  const c = identityConfig('Ana', true);
  assert.equal(c.showAnonCheckbox, true);
  assert.equal(c.anonChecked, true);
});
test('identityConfig: logged-in + anon-NOT-allowed hides the checkbox entirely', () => {
  const c = identityConfig('Ana', false);
  assert.equal(c.showAnonCheckbox, false);
  assert.equal(c.anonChecked, false);
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
