// codex/trilha/js/tarefa-submit-modal.js — pure helpers. The modal DOM + the
// facade submit flow are verified on staging; here we pin the error-code mapping
// and meta parsing (the logic that decides what the student sees on failure).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { errorMessage, parseMeta } from '../trilha/js/tarefa-submit-modal.js';

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
