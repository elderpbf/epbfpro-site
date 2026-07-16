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
// NUNCA vem marcado (Élder 2026-07-15: "o usuário deve marcar para ser anônimo"). Vinha, e isso
// invertia o consentimento: quem entrasse identificado e so clicasse "Enviar" mandava anonimo SEM
// QUERER, e a entrega chegava sem dono no painel do professor. E irreversivel: a coluna do nome
// fica nula e nao ha de onde recuperar. Anonimato e o desvio, nao o padrao.
test('identityConfig: logged-in + anon-allowed mostra a opcao, mas NAO marcada', () => {
  const c = identityConfig('Ana', true);
  assert.equal(c.showAnonCheckbox, true);
  assert.equal(c.anonChecked, false);
});
test('identityConfig: logged-in + anon-NOT-allowed hides the checkbox entirely', () => {
  const c = identityConfig('Ana', false);
  assert.equal(c.showAnonCheckbox, false);
  assert.equal(c.anonChecked, false);
});

// "Pode ser anonima" e escolha do professor PRA ESTA TURMA (release, migration 0036), nao marca
// do item do BANCO: la valia pra toda turma que usasse a tarefa. Tem que ser a MESMA fonte que o
// ct_submit_tarefa consulta, senao o modal oferece o que o envio recusa.
test('a opcao de anonimo vem do release, nao do meta_json do banco', () => {
  const src = read('../trilha/js/tarefa-submit-modal.js');
  assert.match(src, /const allowAnon = !!item\.allow_anonymous;/, 'le a escolha da turma');
  assert.ok(!/meta\.allow_anonymous/.test(src), 'nao le mais a marca do banco');
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
