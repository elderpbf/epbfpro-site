// Questions tab, increment 1: the shell (questions/questions.js) + the first
// native sub-tab Stats (questions/stats.js). RED-first. Covers the tab + sub-tab
// contract, the subtabs() routing (native -> /codex, others bridge to legacy),
// the Stats pure helper, the module source rules, the i18n keys (both dicts),
// and the index.html boot wiring. Mirrors content.js + contract.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const path = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const exists = (rel) => fs.existsSync(path(rel));
const read = (rel) => fs.readFileSync(path(rel), 'utf8');

// ---- Shell: tab + sub-tab contract ----
test('questions shell exports the tab + sub-tab contract', async () => {
  const shell = await import('../questions/questions.js');
  assert.equal(typeof shell.mount, 'function', 'exports mount');
  assert.equal(typeof shell.unmount, 'function', 'exports unmount');
  assert.equal(typeof shell.subtabs, 'function', 'exports subtabs');
  assert.ok(Array.isArray(shell.SUBTABS), 'exports a SUBTABS array');
});

test('questions shell registers sessions, bank, stats; Stats is native', async () => {
  const shell = await import('../questions/questions.js');
  const keys = shell.SUBTABS.map((s) => s.key);
  for (const k of ['sessions', 'bank', 'stats']) {
    assert.ok(keys.includes(k), `SUBTABS includes ${k}`);
  }
  const stats = shell.SUBTABS.find((s) => s.key === 'stats');
  assert.ok(stats.module && typeof stats.module.mount === 'function', 'stats is a native module');
});

test('questions subtabs() routes every sub-tab to /codex (all native, no bridges)', async () => {
  const shell = await import('../questions/questions.js');
  const subs = shell.subtabs('stats');
  const statsEntry = subs.find((s) => /\/codex\/\?tab=questions&sub=stats/.test(s.href));
  assert.ok(statsEntry && statsEntry.active, 'Stats routes to /codex and is active when selected');
  assert.ok(subs.every((s) => /\/codex\/\?tab=questions&sub=/.test(s.href)), 'every sub-tab routes to /codex');
  assert.ok(!subs.some((s) => /\/backstage\/classpulse/.test(s.href)), 'no legacy bridge remains');
  assert.ok(!subs.some((s) => /↗/.test(s.label)), 'no bridge arrow markers remain');
});

// ---- Stats: contract + pure helper ----
test('stats module satisfies the tab contract', async () => {
  const stats = await import('../questions/stats.js');
  assert.equal(typeof stats.mount, 'function', 'exports mount');
  assert.equal(typeof stats.unmount, 'function', 'exports unmount');
});

test('stats pct() turns server accuracy (0..1) into a rounded percent or null', async () => {
  const stats = await import('../questions/stats.js');
  assert.equal(stats.pct(0.75), 75);
  assert.equal(stats.pct(1), 100);
  assert.equal(stats.pct(0), 0);
  assert.equal(stats.pct(0.666), 67);
  assert.equal(stats.pct(null), null);
  assert.equal(stats.pct(undefined), null);
});

// ---- Source rules (ARCHITECTURE.md) for the two new files ----
test('questions shell + stats obey the module source rules', () => {
  for (const rel of ['../questions/questions.js', '../questions/stats.js']) {
    assert.ok(exists(rel), `${rel} exists`);
    const src = read(rel);
    assert.ok(!/\bcallWorker\s*\(/.test(src), `${rel} makes no direct callWorker() call`);
    assert.ok(!/onclick\s*=/.test(src), `${rel} authors no inline onclick`);
    assert.ok(/cdx-/.test(src), `${rel} authors cdx- classes`);
    assert.ok(!/class="ct-/.test(src) && !/class="cv-/.test(src), `${rel} authors no ct-/cv- classes`);
    assert.match(src, /from\s+['"]\.\.\/js\/i18n\.js['"]/, `${rel} imports t()`);
    assert.ok(!/—/.test(src), `${rel} has no em dashes`);
    assert.match(src, /export\s+function\s+mount\s*\(/, `${rel} exports mount`);
    assert.match(src, /export\s+function\s+unmount\s*\(/, `${rel} exports unmount`);
  }
  assert.match(read('../questions/stats.js'), /from\s+['"]\.\.\/js\/codex-api\.js['"]/, 'stats imports the facade');
});

// ---- i18n: every new key in BOTH dictionaries ----
test('questions sub-tab + stats i18n keys exist in BOTH dictionaries', async () => {
  const pt = (await import('../i18n/pt.js')).default;
  const en = (await import('../i18n/en.js')).default;
  const keys = [
    'questions.sub_sessions', 'questions.sub_bank', 'questions.sub_stats',
    'questions.stats_total_questions', 'questions.stats_unique_students',
    'questions.stats_most_missed', 'questions.stats_empty',
  ];
  for (const k of keys) {
    assert.ok(k in pt, `pt.js has ${k}`);
    assert.ok(k in en, `en.js has ${k}`);
  }
});

// ---- Boot wiring ----
test('index.html boot routes ?tab=questions and links the shell + css', () => {
  const html = read('../index.html');
  assert.match(html, /questions\/questions\.js/, 'boot imports the questions shell');
  assert.match(html, /questions\/questions\.css/, 'questions CSS linked');
  assert.match(html, /const TABS = \{[^}]*questions[^}]*\}/, 'questions is in the TABS routing map');
});
