// audience-create.test.mjs — unit tests for the AI-audience-create draft builder
// in js/audiences.js. parseAudienceDraft turns one ai.chat reply (a JSON object,
// possibly fenced) into a reviewable audience draft: a label, a slugged key, and
// exactly one {text,g,n} cell per EXISTING variable (empty where the model
// omitted it, so the grid's lint flags it). It never persists. Zero deps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAudienceDraft, slug, lintConfig } from '../js/audiences.js';

const VARS = ['workspace', 'actor_role', 'deliverable', 'domain'];

test('slug strips accents, lowercases, underscores', () => {
  assert.equal(slug('IA na Advocacia'), 'ia_na_advocacia');
  assert.equal(slug('Contadores & Afins'), 'contadores_afins');
  assert.equal(slug('  Saúde Pública  '), 'saude_publica');
  assert.equal(slug(''), '');
  assert.equal(slug(null), '');
});

test('parses a clean JSON object into a draft (key = slug of label)', () => {
  const ai = JSON.stringify({
    label: 'IA na Advocacia',
    values: {
      workspace: { text: 'escritório', g: 'm', n: 'sg' },
      actor_role: { text: 'advogado', g: 'm', n: 'sg' },
      deliverable: { text: 'petição', g: 'f', n: 'sg' },
      domain: { text: 'OAB', g: 'm', n: 'sg' },
    },
  });
  const d = parseAudienceDraft(ai, VARS);
  assert.equal(d.label, 'IA na Advocacia');
  assert.equal(d.key, 'ia_na_advocacia');
  assert.deepEqual(Object.keys(d.values).sort(), VARS.slice().sort());
  assert.deepEqual(d.values.deliverable, { text: 'petição', g: 'f', n: 'sg' });
});

test('strips ```json fences before parsing', () => {
  const ai = '```json\n{"label":"Medicina","values":{"deliverable":{"text":"laudo","g":"m","n":"sg"}}}\n```';
  const d = parseAudienceDraft(ai, VARS);
  assert.equal(d.key, 'medicina');
  assert.equal(d.values.deliverable.text, 'laudo');
});

test('tolerates prose around the JSON object (cheap-model quirk)', () => {
  const ai = 'Claro! Aqui está a audiência:\n{"label":"Contabilidade","values":{"deliverable":{"text":"balancete","g":"m","n":"sg"}}}\nEspero ter ajudado.';
  const d = parseAudienceDraft(ai, ['deliverable']);
  assert.equal(d.key, 'contabilidade');
  assert.equal(d.values.deliverable.text, 'balancete');
});

test('tolerates a trailing prose sentence after a fenced object', () => {
  const ai = '```json\n{"label":"Saúde","values":{}}\n```\nPosso detalhar mais se quiser.';
  const d = parseAudienceDraft(ai, []);
  assert.equal(d.key, 'saude');
});

test('accepts an already-parsed object too', () => {
  const d = parseAudienceDraft({ label: 'X', values: {} }, ['deliverable']);
  assert.equal(d.key, 'x');
  assert.deepEqual(d.values.deliverable, { text: '', g: 'f', n: 'sg' });
});

test('fills EVERY variable; omitted ones become empty cells lint will flag', () => {
  const d = parseAudienceDraft({ label: 'Parcial', values: { deliverable: { text: 'contrato', g: 'm', n: 'sg' } } }, VARS);
  // every variable present
  assert.deepEqual(Object.keys(d.values).sort(), VARS.slice().sort());
  assert.equal(d.values.deliverable.text, 'contrato');
  assert.equal(d.values.workspace.text, '');
  // staged into a config, lint flags the empty/omitted cells (not the filled one)
  const issues = lintConfig({ variables: VARS, audiences: { [d.key]: { label: d.label, values: d.values } } });
  assert.ok(issues.some((i) => i.variable === 'workspace' && i.problem === 'empty'));
  assert.ok(!issues.some((i) => i.variable === 'deliverable'));
});

test('drops variables the model invented outside the vocabulary', () => {
  const d = parseAudienceDraft({ label: 'X', values: { deliverable: { text: 'a', g: 'f', n: 'sg' }, bogus: { text: 'z', g: 'm', n: 'sg' } } }, ['deliverable']);
  assert.deepEqual(Object.keys(d.values), ['deliverable']);
});

test('coerces invalid gender/number to defaults (f/sg) for a clean draft', () => {
  const d = parseAudienceDraft({ label: 'X', values: { deliverable: { text: 'laudo', g: 'x', n: 'zz' } } }, ['deliverable']);
  assert.equal(d.values.deliverable.g, 'f');
  assert.equal(d.values.deliverable.n, 'sg');
});

test('trims text and coerces non-string text to empty', () => {
  const d = parseAudienceDraft({ label: 'X', values: { deliverable: { text: '  petição  ', g: 'f', n: 'sg' }, domain: { text: 42, g: 'm', n: 'sg' } } }, ['deliverable', 'domain']);
  assert.equal(d.values.deliverable.text, 'petição');
  assert.equal(d.values.domain.text, '');
});

test('returns null when the label is missing or empty', () => {
  assert.equal(parseAudienceDraft({ values: {} }, VARS), null);
  assert.equal(parseAudienceDraft({ label: '   ', values: {} }, VARS), null);
  assert.equal(parseAudienceDraft({ label: '!!!', values: {} }, VARS), null); // slugs to ''
});

test('returns null on non-JSON / non-object input', () => {
  assert.equal(parseAudienceDraft('not json at all', VARS), null);
  assert.equal(parseAudienceDraft('[1,2,3]', VARS), null);
  assert.equal(parseAudienceDraft(null, VARS), null);
  assert.equal(parseAudienceDraft(undefined, VARS), null);
});

test('tolerates a missing/!array variables list', () => {
  const d = parseAudienceDraft({ label: 'X', values: { a: { text: 'y', g: 'm', n: 'sg' } } }, null);
  assert.equal(d.key, 'x');
  assert.deepEqual(d.values, {});
});
