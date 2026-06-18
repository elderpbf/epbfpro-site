// Releases sub-module: tab contract + the pure release-diff and date-status
// rules that drive the composer's save. Importing must not touch DOM/globals.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rel = await import('../content/releases.js');
const relSrc = readFileSync(new URL('../content/releases.js', import.meta.url), 'utf8');

test('releases module satisfies the tab contract', () => {
  assert.equal(typeof rel.mount, 'function', 'exports mount');
  assert.equal(typeof rel.unmount, 'function', 'exports unmount');
});

test('aulaDateStatusKey classifies lesson dates against today', () => {
  const today = '2026-05-29';
  assert.equal(rel.aulaDateStatusKey({ happened_on: '2026-05-01' }, today).key, 'happened');
  assert.equal(rel.aulaDateStatusKey({ scheduled_for: '2026-06-10' }, today).key, 'scheduled', 'future = scheduled');
  assert.equal(rel.aulaDateStatusKey({ scheduled_for: '2026-05-01' }, today).key, 'happened', 'past scheduled = happened');
  assert.equal(rel.aulaDateStatusKey({ scheduled_for: '2026-06-10', rescheduled_from: '2026-05-20' }, today).key, 'rescheduled');
  assert.equal(rel.aulaDateStatusKey({}, today).key, 'tbd', 'no dates = tbd');
});

test('diffAulaSelection splits release / move-into / drop-out', () => {
  // item 1: not released anywhere, now checked -> release (+set aula)
  // item 2: released in aula 5 already, now checked here (aula 3) -> move (setAula)
  // item 3: bound to this aula (3), now unchecked -> drop
  // item 4: bound to this aula (3), still checked -> no-op
  const released = [2, 3, 4];
  const releasedMeta = { 2: { aula_number: 5 }, 3: { aula_number: 3 }, 4: { aula_number: 3 } };
  const out = rel.diffAulaSelection({
    released, releasedMeta, aulaNum: 3, poolIds: [1, 2, 3, 4], selectedIds: [1, 2, 4],
  });
  assert.deepEqual(out.toRelease, [1], 'unreleased+checked -> release');
  assert.deepEqual(out.toSetAula, [2], 'released-elsewhere+checked -> move');
  assert.deepEqual(out.toDropAula, [3], 'bound+unchecked -> drop');
});

test('diffOutrosSelection releases new picks and unreleases dropped Outros items', () => {
  // item 1: not released, now checked -> release
  // item 2: in Outros (released, no aula), now unchecked -> unrelease
  // item 3: released to aula 4 (not Outros), unchecked -> untouched
  const released = [2, 3];
  const releasedMeta = { 2: { aula_number: null }, 3: { aula_number: 4 } };
  const out = rel.diffOutrosSelection({
    released, releasedMeta, poolIds: [1, 2, 3], selectedIds: [1],
  });
  assert.deepEqual(out.toRelease, [1], 'unreleased+checked -> release');
  assert.deepEqual(out.toUnrelease, [2], 'in-Outros+unchecked -> unrelease');
});

test('R3 + R1a: composer groups items por tipo and greys items already released to another aula', () => {
  // R3: items laid out by type (one section per ct_types slug), not one Outros bucket.
  assert.match(relSrc, /function _groupByType/, 'has a group-by-type helper');
  assert.match(relSrc, /_groupByType\(outrosItems\)/, 'aula composer groups the pool by type');
  assert.match(relSrc, /'type-' \+ g\.type/, 'each type gets its own section key');
  // R1a: items released to another aula are flagged + greyed.
  assert.match(relSrc, /function _releasedElsewhere/, 'computes the already-released-elsewhere state');
  assert.match(relSrc, /is-already-released/, 'applies the grey-out class');
  for (const lang of ['../i18n/pt.js', '../i18n/en.js']) {
    const dict = readFileSync(new URL(lang, import.meta.url), 'utf8');
    assert.ok(dict.includes("'releases.already_aula'"), lang + ' has releases.already_aula');
  }
});

test('#22: the apostila pool also carries the "já na aula N" marker', () => {
  // The apostila rows render inline (not via _rowHtml), so the elsewhere marker must
  // be wired into that branch explicitly — pool="apostila" + _releasedElsewhere + note.
  const apostilaBlock = relSrc.slice(relSrc.indexOf('const apostilaRows'), relSrc.indexOf('const tarefaGlyph'));
  assert.match(apostilaBlock, /data-pool="apostila"/, 'still the apostila pool');
  assert.match(apostilaBlock, /_releasedElsewhere\(i\.id, aulaNum\)/, 'apostila checks released-elsewhere');
  assert.match(apostilaBlock, /is-already-released/, 'apostila greys out when bound elsewhere');
  assert.match(apostilaBlock, /cdx-comp-elsewhere/, 'apostila shows the "já na aula N" note');
  // More spacing before the note (CSS margin on the elsewhere span).
  const css = readFileSync(new URL('../content/content.css', import.meta.url), 'utf8');
  assert.match(css, /\.cdx-comp-elsewhere\s*\{[^}]*margin-left/, 'elsewhere note has left spacing');
});

test('R2: mark-aula-happened control sets happened_on to the scheduled day via a full updateAula', () => {
  assert.match(relSrc, /data-mark-happened=/, 'renders the mark-happened control on aula rows');
  assert.match(relSrc, /function _markAulaHappened/, 'has the handler');
  // Must reuse the FULL aula payload (ct_update_aula replaces every field) and set
  // happened_on to the scheduled day, not today.
  assert.match(relSrc, /happened_on:\s*aula\.scheduled_for/, 'happened_on = scheduled_for (occurred on its planned day)');
  assert.match(relSrc, /scheduled_for:\s*aula\.scheduled_for/, 'preserves scheduled_for in the payload');
  assert.match(relSrc, /cohortsApi\.updateAula/, 'persists via the cohorts facade');
  for (const lang of ['../i18n/pt.js', '../i18n/en.js']) {
    const dict = readFileSync(new URL(lang, import.meta.url), 'utf8');
    for (const k of ['releases.mark_happened', 'releases.mark_happened_title', 'releases.mark_happened_done']) {
      assert.ok(dict.includes("'" + k + "'"), lang + ' has ' + k);
    }
  }
});
