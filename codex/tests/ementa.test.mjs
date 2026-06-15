// Ementa model (cohorts/ementa.js) — the pure course-program structure shared by
// the Cursos editor and the certificate snapshot. Nested shape:
//   { modules: [ { title, topics: [ { title, subtopics: [ "..." ] } ] } ] }
// Pure functions, no DOM. TDD: these cases define the contract.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyEmenta, normalizeEmenta, ementaStats, parseEmenta, ementaToText, ementaToCertModules,
  buildEmentaAIPrompt, parseEmentaAIResponse,
} from '../js/ementa.js';

test('emptyEmenta is an empty module list', () => {
  assert.deepEqual(emptyEmenta(), { modules: [] });
});

test('normalizeEmenta coerces a partial/garbage object into the full shape', () => {
  const out = normalizeEmenta({ modules: [
    { title: 'M1', topics: [{ title: 'T1', subtopics: ['s1', 2, null] }] },
    { title: 'M2' },                       // no topics
    'junk',                                // not an object
  ] });
  assert.equal(out.modules.length, 2);     // 'junk' dropped
  assert.equal(out.modules[0].title, 'M1');
  assert.deepEqual(out.modules[0].topics[0].subtopics, ['s1', '2']); // null dropped, numbers stringified
  assert.deepEqual(out.modules[1].topics, []);
});

test('normalizeEmenta tolerates a JSON string', () => {
  const out = normalizeEmenta('{"modules":[{"title":"M","topics":[]}]}');
  assert.equal(out.modules[0].title, 'M');
});

test('normalizeEmenta on null/undefined/bad-json returns empty', () => {
  assert.deepEqual(normalizeEmenta(null), { modules: [] });
  assert.deepEqual(normalizeEmenta('not json'), { modules: [] });
  assert.deepEqual(normalizeEmenta(42), { modules: [] });
});

test('ementaStats counts modules, topics, subtopics', () => {
  const e = { modules: [
    { title: 'M1', topics: [
      { title: 'T1', subtopics: ['a', 'b'] },
      { title: 'T2', subtopics: ['c'] },
    ] },
    { title: 'M2', topics: [{ title: 'T3', subtopics: [] }] },
  ] };
  assert.deepEqual(ementaStats(e), { modules: 2, topics: 3, subtopics: 3 });
});

test('parseEmenta: keyword modules + indented topics/subtopics', () => {
  const text = [
    'Módulo I — Fundamentos',
    '  Como o modelo gera texto',
    '    Tokens e contexto',
    '    Temperatura',
    '  Capacidades e limites',
    'Módulo II — Prompt',
    '  Anatomia de um prompt',
  ].join('\n');
  const e = parseEmenta(text);
  assert.equal(e.modules.length, 2);
  assert.equal(e.modules[0].title, 'Módulo I — Fundamentos');
  assert.equal(e.modules[0].topics.length, 2);
  assert.deepEqual(e.modules[0].topics[0].subtopics, ['Tokens e contexto', 'Temperatura']);
  assert.equal(e.modules[1].topics[0].title, 'Anatomia de um prompt');
});

test('parseEmenta: keyword modules + flat bullets become topics', () => {
  const text = [
    'Módulo 1: Fundamentos',
    '- Tokens',
    '- Temperatura',
    'Módulo 2: Prompt',
    '- Anatomia',
  ].join('\n');
  const e = parseEmenta(text);
  assert.equal(e.modules.length, 2);
  assert.deepEqual(e.modules[0].topics.map(t => t.title), ['Tokens', 'Temperatura']);
  assert.equal(e.modules[1].topics[0].title, 'Anatomia');
});

test('parseEmenta: no keyword, pure indentation = three levels', () => {
  const text = [
    'Fundamentos',
    '  Tokens',
    '    detalhe a',
    'Prompt',
    '  Anatomia',
  ].join('\n');
  const e = parseEmenta(text);
  assert.equal(e.modules.length, 2);
  assert.equal(e.modules[0].title, 'Fundamentos');
  assert.equal(e.modules[0].topics[0].title, 'Tokens');
  assert.deepEqual(e.modules[0].topics[0].subtopics, ['detalhe a']);
});

test('parseEmenta: empty/whitespace yields empty ementa', () => {
  assert.deepEqual(parseEmenta(''), { modules: [] });
  assert.deepEqual(parseEmenta('   \n  \n'), { modules: [] });
});

test('ementaToCertModules flattens to the cert {n,t,d} shape', () => {
  const e = { modules: [
    { title: 'Fundamentos', topics: [{ title: 'Tokens', subtopics: [] }, { title: 'Limites', subtopics: [] }] },
    { title: 'Prompt', topics: [] },
  ] };
  const mods = ementaToCertModules(e);
  assert.equal(mods.length, 2);
  assert.deepEqual(mods[0], { n: 'I', t: 'Fundamentos', d: 'Tokens · Limites' });
  assert.deepEqual(mods[1], { n: 'II', t: 'Prompt', d: '' });
});

test('ementaToText round-trips through parseEmenta', () => {
  const e = { modules: [
    { title: 'Fundamentos', topics: [
      { title: 'Tokens', subtopics: ['contexto'] },
    ] },
  ] };
  const text = ementaToText(e);
  const back = parseEmenta(text);
  assert.deepEqual(back, e);
});

// ── AI assistant helpers (pure) ───────────────────────────────────────────────

test('buildEmentaAIPrompt embeds the course title + current outline + JSON contract', () => {
  const p = buildEmentaAIPrompt({ courseTitle: 'IA Jurídica', ementa: {
    modules: [{ title: 'Fundamentos', topics: [{ title: 'Tokens', subtopics: [] }] }],
  } });
  assert.match(p, /IA Jurídica/, 'includes the course title');
  assert.match(p, /Fundamentos/, 'includes the current outline');
  assert.match(p, /"modules"/, 'states the ementa JSON shape');
  assert.match(p, /"reply"/, 'asks for a reply field');
});

test('buildEmentaAIPrompt tolerates an empty/missing ementa', () => {
  const p = buildEmentaAIPrompt({ courseTitle: 'X' });
  assert.match(p, /vazia/, 'marks an empty program');
});

test('parseEmentaAIResponse: reply + ementa, tolerating ```json fences and prose', () => {
  const out = parseEmentaAIResponse('Claro!\n```json\n{"reply":"Pronto","ementa":{"modules":[{"title":"M","topics":[]}]}}\n```');
  assert.equal(out.reply, 'Pronto');
  assert.equal(out.ementa.modules[0].title, 'M');
});

test('parseEmentaAIResponse: a bare ementa object becomes the program with empty reply', () => {
  const out = parseEmentaAIResponse('{"modules":[{"title":"M1","topics":[{"title":"T","subtopics":["s"]}]}]}');
  assert.equal(out.reply, '');
  assert.equal(out.ementa.modules[0].topics[0].subtopics[0], 's');
});

test('parseEmentaAIResponse: reply-only (no change) leaves ementa null', () => {
  const out = parseEmentaAIResponse('{"reply":"Sobre o que é o curso?","ementa":null}');
  assert.equal(out.reply, 'Sobre o que é o curso?');
  assert.equal(out.ementa, null);
});

test('parseEmentaAIResponse: unparseable text never throws', () => {
  const out = parseEmentaAIResponse('desculpe, não entendi');
  assert.deepEqual(out, { reply: '', ementa: null });
});
