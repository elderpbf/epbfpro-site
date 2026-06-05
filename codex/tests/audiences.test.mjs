// audiences.test.mjs — unit tests for the pure PT-BR grammar resolver in
// js/audiences.js. Covers every determiner form x gender x number, bare tokens,
// the enclitic pronoun form, realistic end-to-end stems, the leave-untouched
// fallbacks, and the config helpers. Zero dependencies, node:test only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, resolveQuestion, isVariable, usedVars, lintConfig, questionType, visibleForAudience } from '../js/audiences.js';

// helpers to build one-variable value maps
const fsg = (text) => ({ d: { text, g: 'f', n: 'sg' } });
const msg = (text) => ({ d: { text, g: 'm', n: 'sg' } });
const fpl = (text) => ({ d: { text, g: 'f', n: 'pl' } });
const mpl = (text) => ({ d: { text, g: 'm', n: 'pl' } });

test('def article a/o/as/os', () => {
  assert.equal(resolve('{{d:def}}', fsg('petição')), 'a petição');
  assert.equal(resolve('{{d:def}}', msg('despacho')), 'o despacho');
  assert.equal(resolve('{{d:def}}', fpl('peças')), 'as peças');
  assert.equal(resolve('{{d:def}}', mpl('autos')), 'os autos');
});

test('indef article uma/um/umas/uns', () => {
  assert.equal(resolve('{{d:indef}}', fsg('petição')), 'uma petição');
  assert.equal(resolve('{{d:indef}}', msg('despacho')), 'um despacho');
  assert.equal(resolve('{{d:indef}}', fpl('peças')), 'umas peças');
  assert.equal(resolve('{{d:indef}}', mpl('autos')), 'uns autos');
});

test('de contraction da/do/das/dos', () => {
  assert.equal(resolve('{{d:de}}', fsg('petição')), 'da petição');
  assert.equal(resolve('{{d:de}}', msg('despacho')), 'do despacho');
  assert.equal(resolve('{{d:de}}', fpl('peças')), 'das peças');
  assert.equal(resolve('{{d:de}}', mpl('autos')), 'dos autos');
});

test('em contraction na/no/nas/nos', () => {
  assert.equal(resolve('{{d:em}}', fsg('petição')), 'na petição');
  assert.equal(resolve('{{d:em}}', msg('despacho')), 'no despacho');
  assert.equal(resolve('{{d:em}}', fpl('peças')), 'nas peças');
  assert.equal(resolve('{{d:em}}', mpl('autos')), 'nos autos');
});

test('a contraction (crase) à/ao/às/aos', () => {
  assert.equal(resolve('{{d:a}}', fsg('petição')), 'à petição');
  assert.equal(resolve('{{d:a}}', msg('despacho')), 'ao despacho');
  assert.equal(resolve('{{d:a}}', fpl('peças')), 'às peças');
  assert.equal(resolve('{{d:a}}', mpl('autos')), 'aos autos');
});

test('por contraction pela/pelo/pelas/pelos', () => {
  assert.equal(resolve('{{d:por}}', fsg('petição')), 'pela petição');
  assert.equal(resolve('{{d:por}}', msg('despacho')), 'pelo despacho');
  assert.equal(resolve('{{d:por}}', fpl('peças')), 'pelas peças');
  assert.equal(resolve('{{d:por}}', mpl('autos')), 'pelos autos');
});

test('com keeps the article, no contraction', () => {
  assert.equal(resolve('{{d:com}}', fsg('petição')), 'com a petição');
  assert.equal(resolve('{{d:com}}', msg('despacho')), 'com o despacho');
  assert.equal(resolve('{{d:com}}', fpl('peças')), 'com as peças');
  assert.equal(resolve('{{d:com}}', mpl('autos')), 'com os autos');
});

test('obj is the pronoun only, no noun', () => {
  assert.equal(resolve('assiná-{{d:obj}}', fsg('petição')), 'assiná-la');
  assert.equal(resolve('assiná-{{d:obj}}', msg('despacho')), 'assiná-lo');
  assert.equal(resolve('revê-{{d:obj}}', fpl('peças')), 'revê-las');
  assert.equal(resolve('revê-{{d:obj}}', mpl('autos')), 'revê-los');
});

test('bare token uses text verbatim', () => {
  assert.equal(resolve('um {{d}}', fsg('petição')), 'um petição');
});

test('multiple tokens and the same var twice', () => {
  const v = { d: { text: 'despacho', g: 'm', n: 'sg' } };
  assert.equal(
    resolve('Antes de assinar {{d:def}}, confira algo {{d:em}}.', v),
    'Antes de assinar o despacho, confira algo no despacho.',
  );
});

test('realistic stem resolves per audience', () => {
  const stem = 'Antes de assinar {{d:def}}, confira algo {{d:em}} gerada pela IA.';
  assert.equal(
    resolve(stem, fsg('petição')),
    'Antes de assinar a petição, confira algo na petição gerada pela IA.',
  );
  assert.equal(
    resolve(stem, msg('despacho')),
    'Antes de assinar o despacho, confira algo no despacho gerada pela IA.',
  );
});

test('plural masculine autos via em/de/def', () => {
  assert.equal(resolve('{{d:em}}', mpl('autos')), 'nos autos');
  assert.equal(resolve('{{d:de}}', mpl('autos')), 'dos autos');
  assert.equal(resolve('{{d:def}}', mpl('autos')), 'os autos');
});

test('missing key leaves the token untouched', () => {
  assert.equal(resolve('um {{d:def}}', {}), 'um {{d:def}}');
  assert.equal(resolve('um {{other}}', fsg('petição')), 'um {{other}}');
});

test('empty text leaves the token untouched', () => {
  assert.equal(resolve('{{d:def}}', { d: { text: '', g: 'f', n: 'sg' } }), '{{d:def}}');
});

test('unknown form leaves the token untouched', () => {
  assert.equal(resolve('{{d:bogus}}', fsg('petição')), '{{d:bogus}}');
});

test('bad gender or number leaves the form token untouched', () => {
  assert.equal(resolve('{{d:def}}', { d: { text: 'x', g: 'x', n: 'sg' } }), '{{d:def}}');
  assert.equal(resolve('{{d:def}}', { d: { text: 'x', g: 'f', n: 'zz' } }), '{{d:def}}');
});

test('isVariable detects tokens', () => {
  assert.equal(isVariable('plain text'), false);
  assert.equal(isVariable('has {{d}}'), true);
  assert.equal(isVariable('has {{d:def}}'), true);
  assert.equal(isVariable(null), false);
});

test('usedVars dedupes and preserves first-appearance order', () => {
  assert.deepEqual(
    usedVars('{{deliverable:def}} e {{actor_role}} com {{deliverable:em}}'),
    ['deliverable', 'actor_role'],
  );
  assert.deepEqual(usedVars('no tokens'), []);
});

test('resolveQuestion handles array options', () => {
  const q = { question: 'Sobre {{d:def}}?', options: ['Revisar {{d}}', 'Ignorar'] };
  const r = resolveQuestion(q, fsg('petição'));
  assert.equal(r.question, 'Sobre a petição?');
  assert.deepEqual(r.options, ['Revisar petição', 'Ignorar']);
});

test('resolveQuestion parses a JSON-string options field', () => {
  const q = { question: 'X', options: '["a {{d}}","b"]' };
  const r = resolveQuestion(q, msg('laudo'));
  assert.deepEqual(r.options, ['a laudo', 'b']);
});

test('resolveQuestion passes a non-array options object through', () => {
  const q = { question: 'X', options: { min: 1, max: 5 } };
  const r = resolveQuestion(q, fsg('petição'));
  assert.deepEqual(r.options, { min: 1, max: 5 });
});

test('resolveQuestion falls back to q.text', () => {
  const r = resolveQuestion({ text: 'Sobre {{d:def}}' }, msg('despacho'));
  assert.equal(r.question, 'Sobre o despacho');
});

test('lintConfig flags missing/empty/bad cells and passes a clean config', () => {
  const config = {
    variables: ['deliverable', 'domain'],
    audiences: {
      advocacia: { label: 'IA na advocacia', values: {
        deliverable: { text: 'petição', g: 'f', n: 'sg' },
        domain: { text: 'OAB', g: 'm', n: 'sg' },
      } },
      judiciario: { label: 'IA no Judiciário', values: {
        deliverable: { text: '', g: 'm', n: 'sg' },       // empty
        // domain missing
      } },
      medicina: { label: 'IA na medicina', values: {
        deliverable: { text: 'laudo', g: 'x', n: 'sg' },   // bad gender
        domain: { text: 'prontuário', g: 'm', n: 'zz' },   // bad number
      } },
    },
  };
  const issues = lintConfig(config);
  const has = (a, v, p) => issues.some((i) => i.audience === a && i.variable === v && i.problem === p);
  assert.ok(has('judiciario', 'deliverable', 'empty'));
  assert.ok(has('judiciario', 'domain', 'missing'));
  assert.ok(has('medicina', 'deliverable', 'bad_gender'));
  assert.ok(has('medicina', 'domain', 'bad_number'));
  // advocacia is fully valid, no issues for it
  assert.ok(!issues.some((i) => i.audience === 'advocacia'));
});

test('lintConfig tolerates a malformed config', () => {
  assert.deepEqual(lintConfig(null), []);
  assert.deepEqual(lintConfig({}), []);
});

test('questionType classifies generic, variable, unique', () => {
  assert.equal(questionType({ question: 'O que é um token?' }), 'generic');
  assert.equal(questionType({ question: 'Revisar {{d:def}}' }), 'variable');
  assert.equal(questionType({ question: 'Sobre a Res. 615', audience: 'judiciario' }), 'unique');
  // audience tag wins even if tokens are present (authoring rule violation, but deterministic)
  assert.equal(questionType({ question: '{{d}}', audience: 'advocacia' }), 'unique');
  assert.equal(questionType(null), 'generic');
});

test('visibleForAudience: generic/variable show always, unique only for its audience', () => {
  const generic = { question: 'plain' };
  const variable = { question: '{{d:def}}' };
  const uJud = { question: 'x', audience: 'judiciario' };
  assert.equal(visibleForAudience(generic, 'advocacia'), true);
  assert.equal(visibleForAudience(variable, 'advocacia'), true);
  assert.equal(visibleForAudience(generic, ''), true);
  assert.equal(visibleForAudience(uJud, 'judiciario'), true);
  assert.equal(visibleForAudience(uJud, 'advocacia'), false);
  assert.equal(visibleForAudience(uJud, ''), false);
});
