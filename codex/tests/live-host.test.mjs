// Q2.2 live host dashboard (questions/live-host.js + questions/live-qa.js) and
// its integration into the Sessions detail. Covers the tab contract, the module
// source rules, the faithful 3-column layout, the facade wiring for launch /
// close / Q&A, and i18n parity. The teardown/leak guarantees live in
// questions-unmount.test.mjs (the release blocker).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

test('live-host module satisfies the tab contract', async () => {
  const mod = await import('../questions/live-host.js');
  assert.equal(typeof mod.mount, 'function', 'exports mount');
  assert.equal(typeof mod.unmount, 'function', 'exports unmount');
});

test('live-host + live-qa obey the module source rules', () => {
  for (const rel of ['../questions/live-host.js', '../questions/live-qa.js']) {
    const src = read(rel);
    assert.ok(!/\bcallWorker\s*\(/.test(src), `${rel} makes no direct callWorker() call`);
    assert.ok(!/onclick\s*=/.test(src), `${rel} authors no inline onclick`);
    assert.ok(/cdx-/.test(src), `${rel} authors cdx- classes`);
    assert.ok(!/class="ct-/.test(src) && !/class="cv-/.test(src), `${rel} no ct-/cv- classes`);
    assert.match(src, /from\s+['"]\.\.\/js\/codex-api\.js['"]/, `${rel} imports the facade`);
    assert.match(src, /from\s+['"]\.\.\/js\/i18n\.js['"]/, `${rel} imports t()`);
    assert.ok(!/—/.test(src), `${rel} has no em dashes`);
  }
  assert.match(read('../questions/live-host.js'), /export\s+function\s+mount\s*\(/, 'live-host exports mount');
  assert.match(read('../questions/live-host.js'), /export\s+function\s+unmount\s*\(/, 'live-host exports unmount');
});

test('live-host ports the faithful 3-column dashboard', () => {
  const src = read('../questions/live-host.js');
  assert.match(src, /cdx-hd-col-left/, 'left column');
  assert.match(src, /cdx-hd-col-center/, 'center column');
  assert.match(src, /cdx-hd-col-right/, 'right column');
  assert.match(src, /cdx-hd-resizer/, 'column resizers');
  assert.match(src, /cdx-active-panel/, 'active-question panel');
  assert.match(src, /cdx-history-list/, 'question history');
  assert.match(src, /createElement\(QTAG\)/, 'embeds the codex-question render element');
});

test('live-host launches/closes via the facade and drives the element through scoped callbacks', () => {
  const src = read('../questions/live-host.js');
  assert.match(src, /\.launchQuestion\s*\(/, 'launches via the facade');
  assert.match(src, /\.closeQuestion\s*\(/, 'closes via the facade');
  assert.match(src, /\.onData\s*=/, 'wires the element scoped onData callback');
  assert.ok(!/['"]cpq-data['"]/.test(src), 'no legacy cpq-data document bus');
});

test('live-qa feed wires the full instructor Q&A surface through the facade', () => {
  const src = read('../questions/live-qa.js');
  assert.match(src, /\.toggleQa\s*\(/, 'Q&A enable');
  assert.match(src, /\.listStudentQuestions\s*\(/, 'feed poll');
  assert.match(src, /\.promoteStudentQuestion\s*\(/, 'promote to display');
  assert.match(src, /\.updateStudentQuestion\s*\(/, 'answer/dismiss');
  assert.match(src, /\.deleteStudentQuestion\s*\(/, 'delete');
});

test('the Sessions detail mounts the native live host for an open session', () => {
  const src = read('../questions/sessions.js');
  assert.match(src, /from\s+['"]\.\/live-host\.js['"]/, 'imports the live host');
  assert.match(src, /liveHost\.mount\s*\(/, 'mounts it for the selected session');
  assert.match(src, /liveHost\.unmount\s*\(\)/, 'tears it down before any re-render/stats/unmount');
});

test('live host + Q&A i18n keys exist in BOTH dictionaries', async () => {
  const pt = (await import('../i18n/pt.js')).default;
  const en = (await import('../i18n/en.js')).default;
  const keys = [
    'questions.host_view', 'questions.host_columns', 'questions.host_col_composer',
    'questions.host_col_active', 'questions.host_col_qa', 'questions.host_reset_layout',
    'questions.host_display', 'questions.host_launch', 'questions.host_bank',
    'questions.host_bank_pick', 'questions.host_bank_launch', 'questions.host_show_results',
    'questions.host_reveal_answer', 'questions.host_launch_btn', 'questions.host_clear',
    'questions.host_active_q', 'questions.host_close_q', 'questions.host_history',
    'questions.host_qa_title', 'questions.host_relaunch', 'questions.host_edit',
    'questions.host_not_hosted', 'questions.host_sqa_badge', 'questions.host_sqa_answer_label',
    'questions.host_sqa_answer_placeholder', 'questions.host_sqa_saving', 'questions.host_sqa_saved',
    'questions.host_err_no_text', 'questions.host_err_launch',
    'questions.qa_empty', 'questions.qa_see_resolved', 'questions.qa_on_display',
    'questions.qa_answer_label', 'questions.qa_answer_placeholder', 'questions.qa_show_on_display',
    'questions.qa_answer_here', 'questions.qa_dismiss', 'questions.qa_delete',
    'questions.qa_close_on_display', 'questions.qa_delete_confirm', 'questions.qa_promote_confirm',
    'questions.qa_err_delete', 'questions.qa_err_update', 'questions.qa_err_promote', 'questions.qa_err_close',
  ];
  for (const k of keys) {
    assert.ok(k in pt, `pt.js has ${k}`);
    assert.ok(k in en, `en.js has ${k}`);
  }
});
