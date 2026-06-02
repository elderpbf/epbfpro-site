// Questions tab, increment 2: the Sessions sub-tab (questions/sessions.js).
// RED-first. Covers the tab contract, the hostHref() bridge helper, the shell
// promoting Sessions from a legacy bridge to a NATIVE module, the module source
// rules, and the i18n keys (both dicts). Live hosting stays a bridge to the
// legacy host page until Q2.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const path = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const exists = (rel) => fs.existsSync(path(rel));
const read = (rel) => fs.readFileSync(path(rel), 'utf8');

test('sessions module satisfies the tab contract', async () => {
  const s = await import('../questions/sessions.js');
  assert.equal(typeof s.mount, 'function', 'exports mount');
  assert.equal(typeof s.unmount, 'function', 'exports unmount');
});

test('sessions hostHref() builds a legacy host bridge URL carrying the code', async () => {
  const s = await import('../questions/sessions.js');
  const url = s.hostHref('AB12');
  assert.match(url, /\/backstage\/classpulse\/host\.html/, 'points at the legacy host page');
  assert.match(url, /code=AB12/, 'carries the session code');
});

test('questions shell now registers Sessions as a NATIVE module', async () => {
  const shell = await import('../questions/questions.js');
  const sessions = shell.SUBTABS.find((s) => s.key === 'sessions');
  assert.ok(sessions.module && typeof sessions.module.mount === 'function', 'sessions is a native module');
  const subs = shell.subtabs('sessions');
  const entry = subs.find((s) => /\/codex\/\?tab=questions&sub=sessions/.test(s.href));
  assert.ok(entry, 'Sessions routes to /codex/?tab=questions&sub=sessions');
  assert.equal(entry.active, true, 'Sessions is active when selected');
});

test('sessions module obeys the source rules', () => {
  const rel = '../questions/sessions.js';
  assert.ok(exists(rel), `${rel} exists`);
  const src = read(rel);
  assert.ok(!/\bcallWorker\s*\(/.test(src), 'no direct callWorker() call');
  assert.ok(!/onclick\s*=/.test(src), 'no inline onclick');
  assert.ok(/cdx-/.test(src), 'authors cdx- classes');
  assert.ok(!/class="ct-/.test(src) && !/class="cv-/.test(src), 'no ct-/cv- classes');
  assert.match(src, /from\s+['"]\.\.\/js\/i18n\.js['"]/, 'imports t()');
  assert.match(src, /from\s+['"]\.\.\/js\/codex-api\.js['"]/, 'imports the facade');
  assert.ok(!/—/.test(src), 'no em dashes');
  assert.match(src, /export\s+function\s+mount\s*\(/, 'exports mount');
  assert.match(src, /export\s+function\s+unmount\s*\(/, 'exports unmount');
});

test('sessions i18n keys exist in BOTH dictionaries', async () => {
  const pt = (await import('../i18n/pt.js')).default;
  const en = (await import('../i18n/en.js')).default;
  const keys = [
    'questions.sessions_new_title', 'questions.sessions_create', 'questions.sessions_loading',
    'questions.sessions_empty', 'questions.sessions_host', 'questions.sessions_close',
    'questions.sessions_reopen', 'questions.sessions_status_open', 'questions.sessions_status_closed',
    'questions.sessions_reopen_blocked', 'questions.sessions_create_error',
  ];
  for (const k of keys) {
    assert.ok(k in pt, `pt.js has ${k}`);
    assert.ok(k in en, `en.js has ${k}`);
  }
});
