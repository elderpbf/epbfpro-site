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
    // Batch 3: per-session stats overlay + delete
    'questions.sessions_stats', 'questions.sessions_delete', 'questions.sessions_delete_confirm',
    'questions.sessions_delete_error', 'questions.sessions_untitled',
    'questions.sessions_stats_kpi_q', 'questions.sessions_stats_kpi_s',
    'questions.sessions_stats_most_missed', 'questions.sessions_stats_empty',
    'questions.sessions_stats_close', 'questions.sessions_stats_loading',
    // Faithful re-port: sidebar picker + main host area
    'questions.sessions_sidebar_heading', 'questions.sessions_title_label',
    'questions.sessions_placeholder', 'questions.sessions_start',
    'questions.sessions_live_label',
  ];
  for (const k of keys) {
    assert.ok(k in pt, `pt.js has ${k}`);
    assert.ok(k in en, `en.js has ${k}`);
  }
});

test('sessions re-ports the faithful card layout (cp-session-card -> cdx-session-card)', () => {
  const src = read('../questions/sessions.js');
  assert.match(src, /cdx-session-card/, 'renders faithful session cards');
  assert.match(src, /cdx-live/, 'renders the legacy live indicator on open sessions');
});

test('sessions re-ports the floating sidebar picker + main host area', () => {
  const src = read('../questions/sessions.js');
  assert.match(src, /cdx-sessions-sidebar/, 'has the floating left-edge sidebar');
  assert.match(src, /cdx-sm--open/, 'toggles the cv-sm reveal class');
  assert.match(src, /mousemove/, 'reveals on left-edge hover');
  assert.match(src, /clientX/, 'uses the cursor left-edge zone');
  assert.match(src, /cdx-sessions-(main|detail)/, 'has the main host area');
  assert.match(src, /sessions_placeholder/, 'shows the empty-selection placeholder');
});

test('sessions lifecycle is Iniciar/Encerrar (no Reabrir) on the selected session', () => {
  const src = read('../questions/sessions.js');
  assert.match(src, /sessions_start/, 'uses the Iniciar label');
  assert.match(src, /data-act=["']start["']|act === ['"]start['"]/, 'has a start action');
  assert.match(src, /\.reopenSession\s*\(/, 'Iniciar maps to reopen under the hood');
  assert.match(src, /\.closeSession\s*\(/, 'Encerrar closes the session');
});

test('sessions wires the per-session stats overlay through the facade', () => {
  const src = read('../questions/sessions.js');
  assert.match(src, /\.sessionStats\s*\(/, 'calls api.sessionStats for the overlay');
  assert.match(src, /cdx-session-stats/, 'renders a per-session stats overlay panel');
  // overlay shows the legacy KPIs + per-question accuracy bars (reuse cdx-stats-bar)
  assert.match(src, /cdx-stats-bar/, 'overlay reuses the accuracy bar primitive');
});

test('sessions puts delete in a bottom danger zone behind an inline confirm', () => {
  const src = read('../questions/sessions.js');
  assert.match(src, /\.deleteSession\s*\(/, 'calls api.deleteSession');
  assert.match(src, /data-act=["']delete["']|act === ['"]delete['"]/, 'has a delete action');
  assert.match(src, /cdx-session-danger/, 'delete lives in a bottom danger zone');
  assert.match(src, /sessions_delete_confirm/, 'guards delete behind an inline confirm');
});

test('sessions unmount tears down the document-level reveal listeners', () => {
  const src = read('../questions/sessions.js');
  // mousemove/keydown are bound on document, so they MUST be cleaned up to
  // avoid leaking across tab switches. Assert they go through the tracked _on.
  assert.match(src, /_on\(\s*document/, 'document listeners are registered via the tracked helper');
});
