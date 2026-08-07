// codex/js/ai-spec.js — Codex-owned AI item-generation spec (port of CT_AI_SPEC).
// All exports are pure logic, so this exercises them exhaustively: the edit diff,
// the defensive JSON parsing, the truncation heuristic, the prompt-verbatim
// guard, and the prompt builders' structural contract.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSystemPrompt,
  buildRefineSystemPrompt,
  buildRefineUserMessage,
  computeEditDiff,
  parseModelJson,
  looksTruncated,
  applyVerbatim,
  MAX_TOKENS,
} from '../js/ai-spec.js';

// ── computeEditDiff ──────────────────────────────────────────────────────────
test('computeEditDiff: no previous -> returns current wholesale', () => {
  const cur = { title: 'A', body_md: 'x' };
  assert.equal(computeEditDiff(null, cur), cur);
});

test('computeEditDiff: identical -> empty diff', () => {
  const o = { title: 'A', summary: 'S', type: 'mc', body_md: 'B', tag_labels: ['x', 'y'] };
  assert.deepEqual(computeEditDiff(o, { ...o }), {});
});

test('computeEditDiff: only changed scalar fields appear', () => {
  const prev = { title: 'A', summary: 'S', type: 'mc', body_md: 'B' };
  const cur = { title: 'A2', summary: 'S', type: 'mc', body_md: 'B2' };
  assert.deepEqual(computeEditDiff(prev, cur), { title: 'A2', body_md: 'B2' });
});

test('computeEditDiff: tag_labels diff is order-insensitive', () => {
  const prev = { tag_labels: ['a', 'b'] };
  assert.deepEqual(computeEditDiff(prev, { tag_labels: ['b', 'a'] }), {}, 'same set, reordered -> no diff');
  assert.deepEqual(computeEditDiff(prev, { tag_labels: ['a', 'c'] }), { tag_labels: ['a', 'c'] });
});

test('computeEditDiff: missing fields treated as empty string', () => {
  assert.deepEqual(computeEditDiff({ title: '' }, { title: '' }), {});
  assert.deepEqual(computeEditDiff({}, { title: 'New' }), { title: 'New' });
});

// ── parseModelJson ───────────────────────────────────────────────────────────
test('parseModelJson: plain JSON', () => {
  assert.deepEqual(parseModelJson('{"a":1}'), { a: 1 });
});
test('parseModelJson: strips ```json fences', () => {
  assert.deepEqual(parseModelJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseModelJson('```\n{"a":1}\n```'), { a: 1 });
});
test('parseModelJson: extracts the brace span from surrounding prose', () => {
  assert.deepEqual(parseModelJson('Here you go: {"a":1} done'), { a: 1 });
});
test('parseModelJson: null / empty / no-braces / invalid -> null', () => {
  assert.equal(parseModelJson(''), null);
  assert.equal(parseModelJson(null), null);
  assert.equal(parseModelJson('no json here'), null);
  assert.equal(parseModelJson('{not valid}'), null);
  assert.equal(parseModelJson('}{'), null, 'last < first -> null');
});

// ── looksTruncated ───────────────────────────────────────────────────────────
test('looksTruncated: short inputs (<200 chars) never flagged', () => {
  assert.equal(looksTruncated('short', 'x'), false);
});
test('looksTruncated: output far shorter than a long input -> true', () => {
  const input = 'a '.repeat(200); // ~400 chars
  assert.equal(looksTruncated(input, 'tiny'), true);
});
test('looksTruncated: comparable lengths -> false', () => {
  const input = 'a '.repeat(200);
  assert.equal(looksTruncated(input, input), false);
});
test('looksTruncated: missing input/output -> false', () => {
  assert.equal(looksTruncated('', 'x'), false);
  assert.equal(looksTruncated('x', ''), false);
});

// ── applyVerbatim ────────────────────────────────────────────────────────────
// Elder 2026-08-07: "as vezes a IA toma como prompt algo que nao e e ai nao faz a formatacao.
// Ele deveria formatar de qualquer jeito, mas se o tipo ou a opcao nao permitir, ai ele mostra
// o texto original". O que mudou: a formatacao da IA nao e mais JOGADA FORA por um palpite de
// tipo, ela fica guardada, e quem escolhe e a tela.
test('applyVerbatim: guarda os DOIS corpos, para a tela poder alternar sem chamar de novo', () => {
  const out = applyVerbatim({ type: 'guide', body_md: 'formatado' }, 'CRU', false);
  assert.equal(out.body_raw, 'CRU');
  assert.equal(out.body_ai, 'formatado');
  assert.equal(out.body_md, 'formatado', 'verbatim=false fica com o da IA');
  assert.equal(out.verbatim, false);
});

test('applyVerbatim: com verbatim=true o corpo e o texto original, e o da IA continua guardado', () => {
  const out = applyVerbatim({ type: 'guide', body_md: 'formatado' }, 'CRU', true);
  assert.equal(out.body_md, 'CRU');
  assert.equal(out.body_ai, 'formatado', 'nada foi perdido');
});

// `null` = ninguem escolheu ainda (item novo). E o que preserva "o prompt sempre cru" para o
// acervo inteiro, que nunca tocou na caixinha.
test('applyVerbatim: sem escolha, vale o palpite do tipo, como antes', () => {
  assert.equal(applyVerbatim({ type: 'prompt', body_md: 'reformatado' }, 'RAW**cru**', null).body_md, 'RAW**cru**');
  assert.equal(applyVerbatim({ type: 'guide', body_md: 'kept' }, 'RAW', null).body_md, 'kept');
  assert.equal(applyVerbatim(null, 'RAW', null), null);
});

// A escolha do usuario VENCE o palpite do tipo: era exatamente o caso que ele descreveu, um
// texto classificado como prompt sem ser, que nunca era formatado.
test('applyVerbatim: a escolha da tela vence o tipo que a IA adivinhou', () => {
  const out = applyVerbatim({ type: 'prompt', body_md: 'formatado' }, 'CRU', false);
  assert.equal(out.body_md, 'formatado');
});

// ── prompt builders (structural contract) ────────────────────────────────────
test('buildSystemPrompt: lists slugs/tags, the PROMPT rule, markdown + emoji rules', () => {
  const types = [{ slug: 'prompt', label: 'Prompt', icon: 'glyph:bolt' }, { slug: 'guide', label: 'Guia', icon: '📘' }];
  const tags = [{ label: 'IA' }, { label: 'Básico' }];
  const p = buildSystemPrompt(types, tags, {});
  assert.match(p, /JSON ESTRITO/);
  assert.match(p, /prompt: Prompt/);            // glyph: icon stripped, slug+label kept
  assert.match(p, /guide: 📘 Guia/);            // legacy emoji icon kept
  assert.match(p, /"IA", "Básico"/);            // tag labels listed
  assert.match(p, /REGRA ESPECIAL/);            // the verbatim-prompt rule
  assert.match(p, /Use APENAS estes elementos de Markdown/);
});
test('buildSystemPrompt: addEmojis flag flips the emoji section, no-tags fallback', () => {
  const withEmoji = buildSystemPrompt([], [], { addEmojis: true });
  const noEmoji = buildSystemPrompt([], [], { addEmojis: false });
  assert.match(withEmoji, /ADICIONE emojis discretos/);
  assert.ok(!/ADICIONE emojis discretos/.test(noEmoji), 'addEmojis:false omits the add-emoji guidance');
  assert.match(buildSystemPrompt([], [], {}), /nenhuma cadastrada/); // empty tags fallback
});
test('buildRefineSystemPrompt: refine instructions + emoji section', () => {
  const p = buildRefineSystemPrompt({});
  assert.match(p, /INPUT ORIGINAL/);
  assert.match(p, /MANTIDAS exatamente/);
  assert.match(p, /RETORNE APENAS o JSON/);
});
test('buildRefineUserMessage: carries original input, prior JSON, and the diff', () => {
  const msg = buildRefineUserMessage('orig text', { title: 'T' }, { title: 'T2' });
  assert.match(msg, /INPUT ORIGINAL DO USUARIO:[\s\S]*orig text/);
  assert.match(msg, /JSON QUE VOCE GEROU ANTES:[\s\S]*"title": "T"/);
  assert.match(msg, /CAMPOS QUE O USUARIO MUDOU[\s\S]*"title": "T2"/);
});

test('MAX_TOKENS is the 8000 budget', () => {
  assert.equal(MAX_TOKENS, 8000);
});
