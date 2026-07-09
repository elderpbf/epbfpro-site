// tests/trilha-support-contact.test.mjs
// The support-entry affordance: the /suporte URL builder (origin + live context) and
// the consistent pill markup. The message copy itself now lives on /suporte (keyed by
// ?source=), so this module only routes there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  supportUrl, entryHtml, contextFromState, SUPPORT_PAGE,
} from '../trilha/js/support-contact.js';

test('supportUrl: bare hub link with no source/context', () => {
  assert.equal(supportUrl({}), SUPPORT_PAGE);
});
test('supportUrl: carries the origin as ?source', () => {
  const url = supportUrl({}, 'login');
  assert.ok(url.startsWith(SUPPORT_PAGE + '?'));
  assert.equal(new URLSearchParams(url.split('?')[1]).get('source'), 'login');
});
test('supportUrl: carries client/turma/nome when logged in', () => {
  const url = supportUrl({ client: 'Acme', turma: 'Turma A', studentName: 'Fulano' }, 'trilha');
  const qs = new URLSearchParams(url.split('?')[1]);
  assert.equal(qs.get('source'), 'trilha');
  assert.equal(qs.get('client'), 'Acme');
  assert.equal(qs.get('turma'), 'Turma A');
  assert.equal(qs.get('nome'), 'Fulano');
});

test('entryHtml: renders the consistent pill linking to /suporte', () => {
  const html = entryHtml({ client: 'Acme', turma: 'Turma A' }, 'registro');
  assert.ok(html.includes('psup-entry'));
  assert.ok(html.includes(SUPPORT_PAGE));
  assert.ok(html.includes('source=registro'));
});
test('entryHtml: escapes context so it cannot inject markup', () => {
  const html = entryHtml({ client: '<img onerror=alert(1)>', turma: 'T' }, 'erro');
  assert.ok(!html.includes('<img onerror'));
});

test('contextFromState: prefers display names, falls back to slugs', () => {
  const s1 = { data: { client: { display_name: 'Acme' }, turma: { display_name: 'Turma A' } }, clientSlug: 'acme', turmaSlug: 'turma-a' };
  assert.deepEqual(contextFromState(s1), { client: 'Acme', turma: 'Turma A', studentName: '' });
  const s2 = { data: null, clientSlug: 'acme', turmaSlug: 'turma-a' };
  assert.deepEqual(contextFromState(s2), { client: 'acme', turma: 'turma-a', studentName: '' });
});
test('contextFromState: carries the participant name when present', () => {
  const s = { data: { client: { display_name: 'Acme' }, turma: { name: 'Turma A' }, participant: { display_name: 'Fulano' } }, clientSlug: 'a', turmaSlug: 't' };
  assert.equal(contextFromState(s).studentName, 'Fulano');
});
