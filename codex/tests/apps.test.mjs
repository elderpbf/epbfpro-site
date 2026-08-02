// Unit tests for the Aplicativos (Fatia 8) pure logic: the card-copy parser (shared
// shape between the admin catalog editor and the trilha card) and the Windows platform
// detection that gates the Store download button. DOM-dependent builders (buildAppCard,
// the mounts) are verified visually on staging; here we pin the pure rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDescription } from '../content/apps.js';
import { isWindows, parseDesc, appAction } from '../trilha/js/app-card.js';

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

test('parseDescription (admin) carries the screenshots, blank when absent', () => {
  const withShots = parseDescription('{"screenshots":{"light":"a.png","dark":"b.png"}}');
  assert.deepEqual(withShots.screenshots, { light: 'a.png', dark: 'b.png' });
  const without = parseDescription('{"tagline":"x"}');
  assert.deepEqual(without.screenshots, { light: '', dark: '' }); // editor fields stay bindable
});

test('parseDesc (trilha) carries screenshots when present, null when absent', () => {
  const withShots = parseDesc('{"screenshots":{"light":"a.png","dark":"b.png"}}');
  assert.deepEqual(withShots.screenshots, { light: 'a.png', dark: 'b.png' });
  assert.equal(parseDesc('{"tagline":"x"}').screenshots, null); // card omits the figure
  assert.equal(parseDesc('bad json').screenshots, null);
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

// ── Delivery (track-59) ───────────────────────────────────────────────────────
// The card used to know exactly ONE way to hand an app over: download it from the Microsoft
// Store on Windows. A web app (prazos) landed as a card with no action at all, and on a Mac it
// announced "Windows only", which is false. `delivery` is what the card now reads.

test('parseDesc defaults delivery to store, so the existing app is untouched', () => {
  assert.equal(parseDesc('{"tagline":"x"}').delivery, 'store');
  assert.equal(parseDesc(null).delivery, 'store');
  assert.equal(parseDesc('bad json').delivery, 'store');
  assert.equal(parseDesc('{"delivery":"nonsense"}').delivery, 'store');
});

test('parseDesc reads delivery:web', () => {
  assert.equal(parseDesc('{"delivery":"web"}').delivery, 'web');
  assert.equal(parseDesc({ delivery: 'web' }).delivery, 'web');
});

test('parseDescription (admin) carries delivery with the same default', () => {
  assert.equal(parseDescription('{"delivery":"web"}').delivery, 'web');
  assert.equal(parseDescription('{"tagline":"x"}').delivery, 'store');
  assert.equal(parseDescription(null).delivery, 'store');
});

test('appAction: a store app keeps exactly the old behaviour', () => {
  const app = { store_url: 'https://apps.microsoft.com/detail/9P08Z6RD6SG6' };
  assert.deepEqual(appAction(app, 'store', true), { kind: 'store', href: app.store_url });
  assert.deepEqual(appAction(app, 'store', false), { kind: 'windows_only' });
  assert.deepEqual(appAction({ store_url: '' }, 'store', true), { kind: 'none' });
});

test('appAction: a web app opens everywhere and never claims to be Windows-only', () => {
  const app = { store_url: 'https://prazos.pensoia.com' };
  assert.deepEqual(appAction(app, 'web', true), { kind: 'web', href: app.store_url });
  assert.deepEqual(appAction(app, 'web', false), { kind: 'web', href: app.store_url });
});

test('appAction: a web app with no URL yet is silent, not a false Windows notice', () => {
  assert.deepEqual(appAction({ store_url: '' }, 'web', false), { kind: 'none' });
  assert.deepEqual(appAction({}, 'web', true), { kind: 'none' });
});

test('appAction: a missing/garbage delivery falls back to store, never to nothing', () => {
  const app = { store_url: 'https://apps.microsoft.com/detail/x' };
  assert.equal(appAction(app, undefined, true).kind, 'store');
  assert.equal(appAction(app, 'weird', true).kind, 'store');
});
