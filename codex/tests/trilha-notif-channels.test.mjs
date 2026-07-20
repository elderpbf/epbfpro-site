// codex/tests/trilha-notif-channels.test.mjs
// track-44 — the student's DELIVERY preferences centre (category × channel), the server-side
// grid that tells the worker's router which channels may carry which category to this person.
//
// Pinned here because the two pref surfaces are easy to confuse and the architecture doc calls
// the confusion out by name: trilha/js/notif-prefs.js is the bell's DISPLAY filter
// (localStorage, per turma, forum only); notif-channels.js is DELIVERY (server-side, per
// identity, all categories). They coexist; neither replaces the other.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORIES, CHANNELS, gridRows, channelsHtml, mergePref,
} from '../trilha/js/notif-channels.js';

// The grid axes must match the worker's src/lib/notify.js exactly — a category or channel that
// exists on one side only is a cell that silently never applies.
test('axes match the worker contract', () => {
  assert.deepEqual(CATEGORIES.map((c) => c.key), ['comunicado', 'tarefa_feedback', 'forum', 'noticia']);
  assert.deepEqual(CHANNELS.map((c) => c.key), ['bell', 'email', 'push']);
});

test('gridRows reflects the server prefs, cell by cell', () => {
  const prefs = {
    comunicado:      { bell: true,  email: true,  push: false },
    tarefa_feedback: { bell: true,  email: false, push: false },
    forum:           { bell: false, email: false, push: false },
    noticia:         { bell: true,  email: true,  push: true  },
  };
  const rows = gridRows(prefs, { pushAvailable: true });
  assert.equal(rows.length, 4);
  const com = rows.find((r) => r.key === 'comunicado');
  assert.equal(com.cells.find((c) => c.channel === 'email').enabled, true);
  assert.equal(com.cells.find((c) => c.channel === 'push').enabled, false);
  const forum = rows.find((r) => r.key === 'forum');
  assert.equal(forum.cells.find((c) => c.channel === 'bell').enabled, false);
});

// A missing category in the server payload must not blank the row: the student sees the
// documented default, which is what the router will actually apply.
test('gridRows falls back to the documented defaults for a missing category', () => {
  const rows = gridRows({}, { pushAvailable: true });
  const com = rows.find((r) => r.key === 'comunicado');
  assert.equal(com.cells.find((c) => c.channel === 'bell').enabled, true);
  assert.equal(com.cells.find((c) => c.channel === 'email').enabled, true);
  const forum = rows.find((r) => r.key === 'forum');
  assert.equal(forum.cells.find((c) => c.channel === 'email').enabled, false, 'system categories start e-mail OFF');
  const noticia = rows.find((r) => r.key === 'noticia');
  assert.equal(noticia.cells.find((c) => c.channel === 'email').enabled, false, 'newsletter is opt-in (LGPD)');
});

// Etapa B is not wired yet on this branch. The push column must be visibly UNAVAILABLE rather
// than a live switch that silently does nothing — a toggle that lies is worse than a disabled one.
test('push cells are disabled until the push channel exists', () => {
  const rows = gridRows({}, { pushAvailable: false });
  for (const r of rows) {
    assert.equal(r.cells.find((c) => c.channel === 'push').disabled, true);
  }
  const rowsOn = gridRows({}, { pushAvailable: true });
  for (const r of rowsOn) {
    assert.equal(r.cells.find((c) => c.channel === 'push').disabled, false);
  }
});

// The bell is the floor: it is how the student finds out anything happened at all inside the
// Trilha, and turning it off per category would strand an actionable item with no surface.
// Élder's model is that the student chooses the EXTRA channels (e-mail/celular).
test('the bell column is never a switch', () => {
  for (const r of gridRows({}, { pushAvailable: true })) {
    assert.equal(r.cells.find((c) => c.channel === 'bell').disabled, true);
  }
});

test('mergePref returns a new grid with one cell changed', () => {
  const before = { comunicado: { bell: true, email: false, push: false } };
  const after = mergePref(before, 'comunicado', 'email', true);
  assert.equal(after.comunicado.email, true);
  assert.equal(before.comunicado.email, false, 'the input must not be mutated');
});

test('mergePref seeds a category it has never seen from the defaults', () => {
  const after = mergePref({}, 'noticia', 'email', true);
  assert.equal(after.noticia.email, true);
  assert.equal(after.noticia.bell, true, 'the untouched cells keep their default');
});

test('channelsHtml renders one row per category and marks the checked cells', () => {
  const html = channelsHtml({ comunicado: { bell: true, email: true, push: false } }, { pushAvailable: false });
  assert.match(html, /tr-nc-modal/);
  for (const c of CATEGORIES) assert.match(html, new RegExp('data-nc-row="' + c.key + '"'));
  assert.match(html, /data-nc="comunicado:email"[^>]*checked/);
  assert.match(html, /data-nc="comunicado:push"[^>]*disabled/);
});

// The whole point of this screen is that the student can find it and act. An error while loading
// must say so, not render an empty grid that reads as "you have no preferences".
test('channelsHtml renders a stated error instead of an empty grid', () => {
  const html = channelsHtml(null, { error: true });
  assert.match(html, /tr-nc-error/);
  assert.doesNotMatch(html, /data-nc="/);
});

// track-44 Etapa B: the unavailable-push hint has two distinct reasons. Additive opt
// (pushNeedsInstall) — every call above that never passes it keeps the exact prior "soon"
// text, which is what the 9 tests above just proved still holds unchanged.
test('channelsHtml: pushNeedsInstall swaps the header hint from "soon" to the install hint', () => {
  const soon = channelsHtml({}, { pushAvailable: false });
  assert.match(soon, /em breve/);
  const install = channelsHtml({}, { pushAvailable: false, pushNeedsInstall: true });
  assert.doesNotMatch(install, /em breve/);
  assert.match(install, /instale o app/);
});
