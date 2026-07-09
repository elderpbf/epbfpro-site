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

test('opção B: diffOutrosSelection pins/unpins the Outros sentinel (0) and unreleases the last home', () => {
  // item 1: not released, checked -> first release + pin 0 (Outros only)
  // item 2: legacy in-Outros (released, no aula), unchecked -> unrelease (Outros was its only home)
  // item 3: released to aula 4 (not Outros), checked -> ADD 0 (now aula 4 AND Outros), still released
  // item 5: already pinned to aula 4 AND Outros [4,0], still checked -> no change
  const released = [2, 3, 5];
  const bindings = { 2: [], 3: [4], 5: [4, 0] };
  const aulaNumbersOf = (id) => bindings[id] || [];
  const out = rel.diffOutrosSelection({
    released, aulaNumbersOf, poolIds: [1, 2, 3, 5], selectedIds: [1, 3, 5],
  });
  assert.deepEqual(out.toRelease, [1], 'unreleased+checked -> first release');
  assert.deepEqual(out.toUnrelease, [2], 'Outros was its only home -> unrelease');
  const byId = Object.fromEntries(out.updates.map((u) => [u.id, u.aulaNumbers]));
  assert.deepEqual(byId[1], [0], 'new item pinned to Outros only');
  assert.deepEqual(byId[3], [0, 4], 'aula item gains the Outros pin, kept in aula 4');
  assert.equal(byId[5], undefined, 'already-in-Outros + still checked -> no change');
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

test('#23: an item can be bound to SEVERAL aulas (additive, not move)', async () => {
  const mod = await import('../content/releases.js');
  // The additive diff: checking ADDS this aula, unchecking REMOVES it.
  const bindings = { 7: [1] }; // item 7 currently in aula 1
  const aulaNumbersOf = (id) => bindings[id] || [];
  // Check item 7 in aula 3 → it should ADD aula 3 (now [1,3]), not move.
  let r = mod.diffAulaMultiSelection({ released: [7], aulaNumbersOf, aulaNum: 3, poolIds: [7], selectedIds: [7] });
  assert.deepEqual(r.toRelease, [], 'already released, no new ct_release');
  assert.equal(r.updates.length, 1);
  assert.deepEqual(r.updates[0], { id: 7, aulaNumbers: [1, 3] }, 'aula 3 added, aula 1 kept');
  // Unchecking item 7 in aula 1 → removes aula 1 only.
  r = mod.diffAulaMultiSelection({ released: [7], aulaNumbersOf: (id) => (id === 7 ? [1, 3] : []), aulaNum: 1, poolIds: [7], selectedIds: [] });
  assert.deepEqual(r.updates[0], { id: 7, aulaNumbers: [3] }, 'aula 1 removed, aula 3 kept');
  // A brand-new item checked needs a first ct_release.
  r = mod.diffAulaMultiSelection({ released: [], aulaNumbersOf: () => [], aulaNum: 2, poolIds: [9], selectedIds: [9] });
  assert.deepEqual(r.toRelease, [9], 'unreleased item gets a first ct_release');
  assert.deepEqual(r.updates[0], { id: 9, aulaNumbers: [2] });
  // Opção B: unchecking the LAST aula (nothing else holds it) unreleases from the turma,
  // it must NOT silently fall into Outros.
  r = mod.diffAulaMultiSelection({ released: [7], aulaNumbersOf: (id) => (id === 7 ? [1] : []), aulaNum: 1, poolIds: [7], selectedIds: [] });
  assert.deepEqual(r.toUnrelease, [7], 'last aula unchecked -> unrelease');
  assert.equal(r.updates.length, 0, 'no leftover empty-aula update');
  // But an item ALSO pinned to Outros (0) keeps its release when an aula is unchecked.
  r = mod.diffAulaMultiSelection({ released: [7], aulaNumbersOf: (id) => (id === 7 ? [1, 0] : []), aulaNum: 1, poolIds: [7], selectedIds: [] });
  assert.deepEqual(r.toUnrelease, [], 'still pinned to Outros -> not unreleased');
  assert.deepEqual(r.updates[0], { id: 7, aulaNumbers: [0] }, 'aula 1 removed, Outros pin kept');
});

test('#23: the composer saves via setAulas (multi) and reads aula_numbers', () => {
  assert.match(relSrc, /function diffAulaMultiSelection/, 'has the additive multi-aula diff');
  assert.match(relSrc, /api\.setAulas/, 'persists via ct_set_release_aulas');
  assert.match(relSrc, /function _aulaNumbersOf/, 'reads every aula an item is bound to');
  assert.match(relSrc, /function _elsewhereLabel/, 'renders "já nas aulas 1, 3"');
  assert.match(relSrc, /aula_numbers/, 'stores the multi-aula bindings');
  for (const lang of ['../i18n/pt.js', '../i18n/en.js']) {
    const dict = readFileSync(new URL(lang, import.meta.url), 'utf8');
    assert.ok(dict.includes("'releases.already_aulas'"), lang + ' has the plural marker key');
  }
});

test('#22: the apostila pool also carries the "já na aula N" marker', () => {
  // The apostila rows render inline (not via _rowHtml), so the elsewhere marker must
  // be wired into that branch explicitly — pool="apostila" + _releasedElsewhere + note.
  const apostilaBlock = relSrc.slice(relSrc.indexOf('const apostilaRows'), relSrc.indexOf('// R3: lay the item list out por tipo'));
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

test('track-34: the Labs group shows each lab\'s own emoji, ordered per Content > Labs drag order', () => {
  assert.match(relSrc, /import \{ isLabEnabled, labIcon, labOrderIndex \} from '\.\.\/js\/labs-registry\.js'/, 'imports the icon + order readers alongside the enabled flag');
  assert.match(relSrc, /function _rowGlyph/, 'has the per-lab-icon override');
  assert.match(relSrc, /labIcon\(key\)/, 'resolves the icon via labIcon, not the generic type glyph');
  assert.match(relSrc, /function _sortLabsByOrder/, 'has the registry-order sort');
  assert.match(relSrc, /labOrderIndex\(_labKeyOf\(a\)\) - labOrderIndex\(_labKeyOf\(b\)\)/, 'sorts by labOrderIndex');
  assert.match(relSrc, /_sortLabsByOrder\(g\.items\)/, 'applies the sort to lab-typed groups');
});

test('labs3: each composer section header shows liberados/total for the aula', () => {
  // The accordion renders "released/total" when a section carries releasedCount,
  // and plain total otherwise (the no-lesson Outros placeholder).
  assert.match(relSrc, /s\.releasedCount != null\s*\)\s*\?\s*\(s\.releasedCount \+ '\/' \+ s\.count\)/, 'renders released/total');
  // Every real section (apostila, per-type, drive) in the aula composer sets releasedCount
  // from the items bound to THIS aula.
  const aulaBlock = relSrc.slice(relSrc.indexOf('function _renderAulaComposer'), relSrc.indexOf('function _renderOutrosComposer'));
  assert.match(aulaBlock, /releasedCount: _apostilaItems\.filter\(\(i\) => _isBoundTo\(i\.id, aulaNum\)\)\.length/, 'apostila section counts what is bound to the aula');
  assert.match(aulaBlock, /releasedCount: g\.items\.filter\(\(i\) => _isBoundTo\(i\.id, aulaNum\)\)\.length/, 'per-type section counts bound-to-aula');
  assert.match(aulaBlock, /releasedCount: driveItems\.filter\(\(i\) => _isBoundTo\(i\.id, aulaNum\)\)\.length/, 'drive section counts bound-to-aula');
  // The no-lesson Outros composer counts what is currently in Outros.
  const outrosBlock = relSrc.slice(relSrc.indexOf('function _renderOutrosComposer'), relSrc.indexOf('// ── Save'));
  assert.match(outrosBlock, /releasedCount: g\.items\.filter\(\(i\) => _inOutros\(i\.id\)\)\.length/, 'Outros counts in-Outros items');
});

test('labs3: every composer row has an eye preview that reuses the shared renderers, all types covered', () => {
  // A preview button on every row (both _rowHtml and the inline apostila rows).
  assert.match(relSrc, /function _previewBtnHtml/, 'has the eye-button builder');
  assert.match(relSrc, /_previewBtnHtml\(item\.id\)/, '_rowHtml appends the eye button');
  assert.match(relSrc, /_previewBtnHtml\(i\.id\)/, 'apostila inline rows append the eye button');
  assert.match(relSrc, /glyphSvg\('eye'/, 'uses the eye glyph');
  // Dispatch: labs -> the shared lab viewer, Drive -> the Drive viewer, else -> a modal
  // rendering the item body via the shared item-render, so EVERY type is previewable.
  assert.match(relSrc, /import \{ renderItem \} from '\.\.\/js\/item-render\.js'/, 'reuses the shared item renderer');
  assert.match(relSrc, /import \{ openModal as openLabViewer \} from '\.\.\/js\/lab-viewer\.js'/, 'reuses the shared lab viewer');
  assert.match(relSrc, /import \* as driveViewer from '\.\.\/js\/drive-viewer\.js'/, 'reuses the shared Drive viewer');
  const pv = relSrc.slice(relSrc.indexOf('function _openItemPreview'), relSrc.indexOf('// ── Composer rendering'));
  assert.match(pv, /item\.type === 'lab'/, 'labs open the lab viewer');
  assert.match(pv, /item\.type === 'drive_file'/, 'Drive files open the Drive viewer');
  assert.match(pv, /contentApi\.getItem/, 'fetches the full item (body_md) for the body types');
  assert.match(pv, /renderItem\(full, host, \{ preview: true \}\)/, 'renders the body read-only');
  // The click handler dismisses on any click ("clicar em qualquer lugar fecha").
  assert.match(relSrc, /bd\.addEventListener\('click', \(\) => closeModal\(bd\)\)/, 'any click closes the preview');
  // The eye click never toggles the checkbox.
  assert.match(relSrc, /closest\('\.cdx-comp-preview'\)[\s\S]*?e\.preventDefault\(\); e\.stopPropagation\(\);/, 'eye click is intercepted before the checkbox toggles');
  for (const lang of ['../i18n/pt.js', '../i18n/en.js']) {
    const dict = readFileSync(new URL(lang, import.meta.url), 'utf8');
    assert.ok(dict.includes("'releases.preview_title'"), lang + ' has releases.preview_title');
  }
  const css = readFileSync(new URL('../content/content.css', import.meta.url), 'utf8');
  assert.match(css, /\.cdx-comp-preview\s*\{/, 'eye button is styled');
  assert.match(css, /\.cdx-rel-preview-modal\s*\{/, 'preview modal is styled');
});

test('track-34: a disabled lab that was never released drops out of the pool (still shown if already released)', () => {
  // The enabled toggle (Content > Labs) is client-side localStorage; the Labs
  // ct_items rows themselves don't carry it, so the composer must cross
  // reference labs-registry.isLabEnabled by meta_json.lab_key, not just render
  // whatever ct_list_items returns.
  assert.match(relSrc, /import \{ isLabEnabled, labIcon, labOrderIndex \} from '\.\.\/js\/labs-registry\.js'/, 'imports the enabled-flag reader');
  assert.match(relSrc, /function _isVisibleLab/, 'has the enabled-flag filter');
  assert.match(relSrc, /isLabEnabled\(key\)/, 'checks isLabEnabled by the cross-referenced key');
  assert.match(relSrc, /_released\.indexOf\(Number\(item\.id\)\) !== -1/, 'a disabled lab already released stays visible');
  assert.match(relSrc, /_isOutros\)\.filter\(_isVisibleLab\)/, 'aula composer applies the filter');
  assert.match(relSrc, /_isDrive\(i\)\)\.filter\(_isVisibleLab\)/, 'outros composer applies the filter');
});
