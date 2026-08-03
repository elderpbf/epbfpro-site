// How a session is NAMED on an admin surface now goes through js/session-label.js.
//
// The diagnosis: Perguntas > Sessões built "Cliente · Turma" inline, while the cohorts
// dossiê picker listed the bare `s.name`. Every other client's session survived that by
// accident, because its TITLE happened to carry the client (PCV, VNC, JFSE); a turma
// titled "Curso de Formação 2026" did not, so the TJSE session was unfindable in the
// dossiê. Two surfaces, one naming rule, so this file asserts both reach the shared one
// AND that the inline join does not grow back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const CONSUMERS = [
  ['questions/sessions.js', 'Perguntas > Sessões'],
  ['cohorts/cohorts.js',    'o picker do dossiê'],
];

for (const [rel, label] of CONSUMERS) {
  test(`${label} (${rel}) reaches the shared session label`, () => {
    const src = read('../' + rel);
    assert.match(src, /from\s+['"][^'"]*session-label\.js['"]/, 'imports js/session-label.js');
    assert.match(src, /sessionLabel\(/, 'and actually calls it');
  });
}

// The regression that matters: someone rebuilding "Cliente · Turma" by hand in a module
// instead of calling the helper. Narrow on purpose — it looks for the client/turma pair
// joined by the middot, not for the middot at large (it is legitimate separator text).
const INLINE_JOIN = /client_name[\s\S]{0,80}·[\s\S]{0,40}turma_name/;

for (const [rel, label] of CONSUMERS) {
  test(`${label} has no inline "Cliente · Turma" join left`, () => {
    assert.ok(!INLINE_JOIN.test(read('../' + rel)), 'found a hand-built client · turma label');
  });
}

test('a turma-linked session is named by its client and turma, not its own title', async () => {
  const { sessionLabel } = await import('../js/session-label.js');
  assert.equal(
    sessionLabel({ title: 'Curso de Formação 2026', client_name: 'TJSE', turma_name: 'Curso de Formação 2026' }),
    'TJSE · Curso de Formação 2026'
  );
});

test('a standalone session keeps its own title, under either row shape', async () => {
  const { sessionLabel } = await import('../js/session-label.js');
  // list_sessions returns `title`; cp_list_sessions aliases the same column to `name`.
  assert.equal(sessionLabel({ title: 'Avulsa' }), 'Avulsa');
  assert.equal(sessionLabel({ name: 'Avulsa' }), 'Avulsa');
});

test('a half-linked row falls back instead of printing "undefined · undefined"', async () => {
  const { sessionLabel } = await import('../js/session-label.js');
  // The JOIN is a LEFT JOIN on both sides: a turma with no ct_clients row yields a
  // turma_name with a null client_name, and that must not reach the screen as a label.
  assert.equal(sessionLabel({ title: 'Avulsa', turma_name: 'Turma 1', client_name: null }), 'Avulsa');
  assert.equal(sessionLabel(null, 'Sem título'), 'Sem título');
  assert.equal(sessionLabel({}, 'Sem título'), 'Sem título');
});
