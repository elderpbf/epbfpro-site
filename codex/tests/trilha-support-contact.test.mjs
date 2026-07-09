// tests/trilha-support-contact.test.mjs
// The support-contact affordance: pre-fill message/subject logic (context-aware vs
// generic), the WhatsApp/mailto/hub URL builders, and structural rendering. The
// visual result is verified on a branch preview.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  supportMessage, supportSubject, whatsAppUrl, mailtoUrl, supportPageUrl,
  contextFromState, footerHtml, highlightHtml, CONFIG,
} from '../trilha/js/support-contact.js';

test('supportMessage: generic with no trilha context', () => {
  assert.match(supportMessage({}), /minha trilha/i);
});
test('supportMessage: names client + turma when known', () => {
  const msg = supportMessage({ client: 'Acme', turma: 'Turma A' });
  assert.match(msg, /Acme/);
  assert.match(msg, /Turma A/);
});
test('supportMessage: also names the student when logged in', () => {
  const msg = supportMessage({ client: 'Acme', turma: 'Turma A', studentName: 'Fulano' });
  assert.match(msg, /Fulano/);
  assert.match(msg, /Acme/);
});
test('supportSubject: generic vs contextual', () => {
  assert.match(supportSubject({}), /PensoIA/);
  assert.match(supportSubject({ client: 'Acme', turma: 'Turma A' }), /Acme.*Turma A/);
});

test('whatsAppUrl: uses the configured number and URL-encodes the message', () => {
  const url = whatsAppUrl({ client: 'Acme', turma: 'Turma A' });
  assert.ok(url.startsWith('https://wa.me/' + CONFIG.whatsapp + '?text='));
  assert.ok(decodeURIComponent(url.split('?text=')[1]).includes('Acme'));
});
test('mailtoUrl: uses the configured address, subject and body', () => {
  const url = mailtoUrl({ client: 'Acme', turma: 'Turma A' });
  assert.ok(url.startsWith('mailto:' + CONFIG.email + '?subject='));
  assert.ok(url.includes('&body='));
});

test('supportPageUrl: bare hub link with no context', () => {
  assert.equal(supportPageUrl({}), CONFIG.page);
});
test('supportPageUrl: carries client/turma/nome as query params', () => {
  const url = supportPageUrl({ client: 'Acme', turma: 'Turma A', studentName: 'Fulano' });
  assert.ok(url.startsWith(CONFIG.page + '?'));
  const qs = new URLSearchParams(url.split('?')[1]);
  assert.equal(qs.get('client'), 'Acme');
  assert.equal(qs.get('turma'), 'Turma A');
  assert.equal(qs.get('nome'), 'Fulano');
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

test('footerHtml / highlightHtml: render the two channels, XSS-escaped', () => {
  const ctx = { client: '<img onerror=alert(1)>', turma: 'T' };
  const footer = footerHtml(ctx);
  const highlight = highlightHtml(ctx);
  assert.ok(footer.includes('cdx-support-footer'));
  assert.ok(highlight.includes('cdx-support-highlight'));
  assert.ok(!footer.includes('<img onerror'));
  assert.ok(!highlight.includes('<img onerror'));
});
test('highlightHtml: links to the full /suporte hub', () => {
  const html = highlightHtml({ client: 'Acme', turma: 'Turma A' });
  assert.ok(html.includes('cdx-support-more'));
  assert.ok(html.includes(CONFIG.page));
});
