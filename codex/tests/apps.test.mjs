// Unit tests for the Aplicativos (Fatia 8) pure logic: the card-copy parser (shared
// shape between the admin catalog editor and the trilha card) and the Windows platform
// detection that gates the Store download button. DOM-dependent builders (buildAppCard,
// the mounts) are verified visually on staging; here we pin the pure rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDescription } from '../content/apps.js';
import { isWindows } from '../trilha/js/app-card.js';

test('parseDescription reads the tagline/access_note/benefits shape', () => {
  const d = parseDescription('{"tagline":"T","access_note":"A","benefits":[{"glyph":"spark","title":"x","desc":"y"}]}');
  assert.equal(d.tagline, 'T');
  assert.equal(d.access_note, 'A');
  assert.equal(d.benefits.length, 1);
  assert.deepEqual(d.benefits[0], { glyph: 'spark', title: 'x', desc: 'y' });
});

test('parseDescription tolerates null / empty / malformed JSON without throwing', () => {
  for (const bad of [null, undefined, '', '{not json', '[]', '42']) {
    const d = parseDescription(bad);
    assert.equal(d.tagline, '');
    assert.equal(d.access_note, '');
    assert.deepEqual(d.benefits, []);
  }
});

test('parseDescription defaults a missing benefits array to []', () => {
  const d = parseDescription('{"tagline":"only"}');
  assert.equal(d.tagline, 'only');
  assert.deepEqual(d.benefits, []);
});

test('parseDescription accepts an already-parsed object', () => {
  const d = parseDescription({ tagline: 'obj', benefits: [{ glyph: 'g', title: 't', desc: 'd' }] });
  assert.equal(d.tagline, 'obj');
  assert.equal(d.benefits[0].title, 't');
});

test('isWindows detects Windows desktop from the user agent', () => {
  assert.equal(isWindows({ navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }), true);
});

test('isWindows returns false for recognizable non-Windows platforms', () => {
  assert.equal(isWindows({ navigator: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)' } }), false);
  assert.equal(isWindows({ navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)' } }), false);
  assert.equal(isWindows({ navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 14)' } }), false);
  assert.equal(isWindows({ navigator: { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' } }), false);
});

test('isWindows prefers userAgentData.platform when present', () => {
  assert.equal(isWindows({ navigator: { userAgentData: { platform: 'Windows' }, userAgent: 'irrelevant' } }), true);
  assert.equal(isWindows({ navigator: { userAgentData: { platform: 'macOS' }, userAgent: 'Windows NT' } }), false);
});

test('isWindows defaults to true only when the platform is undetectable', () => {
  assert.equal(isWindows({ navigator: { userAgent: 'SomeUnknownBot/1.0' } }), true);
});
