// trilha/js/push-invite.js (track-44) — the offer to turn notifications on.
//
// Push has worked since Etapa B, but the only way in was the preferences grid behind the gear,
// which nobody finds. What these tests pin is the LADDER (who sees the strip and who must not)
// and the two promises that make it honest: it is never shown to someone who cannot receive
// push, and it is gone for good once the browser has been told no.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pushInviteState, currentPermission } from '../trilha/js/push-invite.js';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const src = read('../trilha/js/push-invite.js');
const pageJs = read('../trilha/js/page.js');
const i18nJs = read('../trilha/i18n.js');

const ok = (o = {}) => Object.assign({
  hasSession: true, capable: true, installAvailable: false, permission: 'default',
}, o);

test('a logged-in student on a capable device, not yet asked, gets the offer', () => {
  assert.equal(pushInviteState(ok()), 'offer');
});

test('the install bar wins the spot: one strip at a time, never a stack of asks', () => {
  assert.equal(pushInviteState(ok({ installAvailable: true })), 'hidden');
});

test('already authorized shows nothing: there is nothing left to ask', () => {
  assert.equal(pushInviteState(ok({ permission: 'granted' })), 'hidden');
});

test('BLOCKED means gone, not a dead button', () => {
  // Once the browser permission is denied, no click of ours can reopen it. A strip that stays
  // would be a switch that lies.
  assert.equal(pushInviteState(ok({ permission: 'denied' })), 'hidden');
});

test('a device that cannot receive push is never offered it', () => {
  // iOS Safari off the Home Screen lands here: the APIs may exist and silently never fire.
  assert.equal(pushInviteState(ok({ capable: false })), 'hidden');
});

test('an anonymous visitor is not asked: a subscription needs an identity to hang on', () => {
  assert.equal(pushInviteState(ok({ hasSession: false })), 'hidden');
  assert.equal(pushInviteState({}), 'hidden');
});

test('a missing Notification API reads as "not asked yet", it does not throw', () => {
  assert.equal(currentPermission({}), 'default');
  assert.equal(currentPermission(undefined), 'default');
  assert.equal(currentPermission({ Notification: { permission: 'granted' } }), 'granted');
});

// ── it is the SAME strip, not a lookalike ─────────────────────────────────────────────

test('it reuses the install bar markup instead of growing a second bar', () => {
  assert.match(src, /cdx-install-bar cdx-push-invite/);
  assert.match(src, /cdx-install-minlabel/);
  assert.match(src, /cdx-install-glyph/);
  // No new CSS: a copied ruleset is how two strips that must look identical stop being so.
  const css = read('../trilha/css/trilha.css');
  assert.ok(!/\.cdx-push-invite\s*\{/.test(css), 'no private stylesheet for the invite');
});

test('it collapses on first interaction, and offers no "later" button', () => {
  assert.match(src, /onFirstInteraction/);
  assert.ok(!/dismiss/i.test(src), 'the collapsed strip IS the re-offer, so nothing dismisses it');
});

// ── the promise it makes ──────────────────────────────────────────────────────────────

test('the text is generic: it promises the trail, never one category', () => {
  // Élder 2026-07-26: browser permission covers every category at once, so "we will remind you
  // the day before class" is a promise the next producer breaks.
  assert.match(i18nJs, /'pushinvite\.title':\s*'Receba atualizações da sua trilha'/);
  assert.match(i18nJs, /'pushinvite\.desc':\s*'Novos materiais e lembretes'/);
  assert.match(i18nJs, /'pushinvite\.pill':\s*'Avisos da trilha'/);
  assert.ok(!/aula/i.test((i18nJs.match(/'pushinvite\.[a-z]+':\s*'[^']*'/g) || []).join(' ')));
});

test('every pushinvite key exists in BOTH dictionaries and is used', () => {
  const keys = [...i18nJs.matchAll(/'(pushinvite\.[a-z_]+)':/g)].map((m) => m[1]);
  const uniq = [...new Set(keys)];
  assert.equal(uniq.length, 4);
  for (const k of uniq) {
    assert.equal(keys.filter((x) => x === k).length, 2, `${k} is in pt AND en`);
    assert.ok(src.includes(k), `${k} is actually used`);
  }
});

// ── wiring ────────────────────────────────────────────────────────────────────────────

test('the trail mounts it after the install bar, and only on the timeline', () => {
  assert.match(pageJs, /import \{ initPushInvite, hidePushInvite \}/);
  const install = pageJs.indexOf('initInstallPrompt(root');
  const invite = pageJs.indexOf('initPushInvite(root');
  assert.ok(install > 0 && invite > install, 'install is offered first, the invite takes the spot after');
  // renderWall returns before both: the login wall must never carry either strip.
  assert.ok(pageJs.indexOf('renderWall(root)') < install);
});

test('subscribing from the preferences grid takes the strip down too', () => {
  assert.match(pageJs, /hidePushInvite\(\)/);
});

test('the subscribe glue is injected, so this module never reaches the facade itself', () => {
  assert.ok(!/codex-api/.test(src), 'no direct facade import');
  assert.ok(!/\bcallWorker\s*\(/.test(src));
  assert.match(src, /opts\.subscribe/);
  assert.ok(!/—/.test(src), 'no em dashes');
});
