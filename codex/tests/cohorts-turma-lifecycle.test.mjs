// Source-contract for the turma lifecycle controls (Batch A): a turma can be
// unarchived back to active and permanently deleted from its dossier. Delete is
// irreversible, so it must be gated by the typed-name confirm modal. These pin
// the wiring (facade mapping + dossier buttons + handlers) so a refactor can't
// silently drop the confirm step or the facade hop.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => {
  const p = fileURLToPath(new URL(rel, import.meta.url));
  assert.ok(fs.existsSync(p), `${rel} exists`);
  return fs.readFileSync(p, 'utf8');
};

const facadeJs = read('../js/codex-api.js');
const cohortsJs = read('../cohorts/cohorts.js');
const ptJs = read('../i18n/pt.js');
const enJs = read('../i18n/en.js');

test('facade maps unarchive/delete turma to the frozen ct_* actions', () => {
  assert.match(facadeJs, /unarchiveTurma:\s*\(p\)\s*=>\s*call\('ct_unarchive_turma',\s*p\)/);
  assert.match(facadeJs, /deleteTurma:\s*\(p\)\s*=>\s*call\('ct_delete_turma',\s*p\)/);
});

test('archived dossier shows Desarquivar + Deletar (and active shows Arquivar)', () => {
  assert.match(cohortsJs, /data-doss="unarchive"/);
  assert.match(cohortsJs, /data-doss="delete"/);
  assert.match(cohortsJs, /data-doss="archive"/);
});

test('dossier click handler routes unarchive/delete to their helpers', () => {
  assert.match(cohortsJs, /a === 'unarchive'\)\s*_unarchiveTurma\(/);
  assert.match(cohortsJs, /a === 'delete'\)\s*_deleteTurma\(/);
});

test('unarchive calls the facade; delete is gated by the typed-name confirm modal', () => {
  assert.match(cohortsJs, /function _unarchiveTurma[\s\S]*?api\.unarchiveTurma\(/);
  // _deleteTurma must go through _openDeleteConfirm (typed-name) before api.deleteTurma
  const del = cohortsJs.match(/function _deleteTurma\([\s\S]*?\n}/);
  assert.ok(del, '_deleteTurma defined');
  assert.match(del[0], /_openDeleteConfirm\(/, 'delete gated by typed-name confirm');
  assert.match(del[0], /confirmName:\s*turma\.name/, 'confirm matches the turma name');
  assert.match(del[0], /api\.deleteTurma\(/, 'delete calls the facade');
});

test('lifecycle i18n keys exist in both dictionaries', () => {
  for (const key of [
    'cohorts.unarchive', 'cohorts.turma_unarchived', 'cohorts.turma_deleted',
    'cohorts.delete_turma_btn', 'cohorts.delete_turma_warning',
  ]) {
    assert.ok(ptJs.includes(`'${key}'`), `pt.js has ${key}`);
    assert.ok(enJs.includes(`'${key}'`), `en.js has ${key}`);
  }
});

test('delete confirm matches the typed name case-insensitively', () => {
  // The name is shown uppercased (label styling), so a PascalCase turma must
  // still confirm when the user types what they see.
  assert.match(cohortsJs, /toLowerCase\(\) === String\(opts\.confirmName\)\.trim\(\)\.toLowerCase\(\)/);
});

test('turma actions update in place, not via a full reload', () => {
  // The success path mutates _turmas + re-renders in place (no _loadAll refetch,
  // which the user saw as a whole-page refresh).
  assert.match(cohortsJs, /turma_archived'\)\);\s*const tm = _findTurma/);
  assert.match(cohortsJs, /turma_unarchived'\)\);\s*const tm = _findTurma/);
  assert.match(cohortsJs, /turma_deleted'\)\);\s*const wasSelected/);
  assert.match(cohortsJs, /_refreshDossierHeader\(/, 'archive/unarchive repaint the header in place');
  // none of the lifecycle success handlers fall back to a full reload
  assert.ok(!/turma_(archived|unarchived|deleted)'\)\);[\s\S]{0,400}?_loadAll\(\)/.test(cohortsJs),
    'lifecycle actions do not call _loadAll');
});

// The accordion moved into the shared rail (track-41), so its BEHAVIOUR is proven where it
// lives — tests/list-rail-bands.test.mjs renders it and counts the open sections. What is
// still cohorts' own, and is what this guards, is the wiring: it asks for the accordion, it
// keeps the truth of which client is open, and a toggle goes through a re-render.
test('client groups are an accordion whose open client THIS module owns', () => {
  assert.match(cohortsJs, /exclusive: true/, 'asks the rail for the accordion');
  assert.match(cohortsJs, /openId: \(\) => _expandedClient/, 'the open client is this module state');
  assert.match(cohortsJs, /onToggle: \(slug\) => _toggleClient\(slug\)/);
  // _toggleClient must flip _expandedClient and re-render — never poke the DOM class itself,
  // which would fight sections.openId and silently win until the next render.
  const fn = /function _toggleClient\(slug\) \{([\s\S]*?)\n\}/.exec(cohortsJs);
  assert.ok(fn, 'has _toggleClient');
  assert.match(fn[1], /_expandedClient = \(_expandedClient === slug\) \? null : slug/);
  assert.match(fn[1], /_renderList\(\)/, 'a toggle re-renders from the new state');
  assert.ok(!/classList/.test(fn[1]), '_toggleClient must not hand-flip classes');
});

test('phase uses aula-derived dates (a turma with future classes reads live)', () => {
  assert.match(cohortsJs, /computed_date_start \|\| tm\.date_start/);
  assert.match(cohortsJs, /computed_date_end \|\| tm\.date_end/);
});

test('the list bands clients into ativos / futuros / inativos', () => {
  assert.match(cohortsJs, /_SECTIONS = \['ativo', 'futuro', 'inativo'\]/);
  assert.match(cohortsJs, /function _clientStatus\(/);
  assert.match(cohortsJs, /function _sortTurmas\(/);
  // The status divider is the rail's BAND (its outer level), not a hand-emitted div.
  assert.match(cohortsJs, /bands: \{[\s\S]*?of: \(sec\) => sec\.band/, 'bands read the client band');
  assert.match(cohortsJs, /list: \(\) => _SECTIONS\.map/, '...in the ativo/futuro/inativo order');
  for (const key of ['cohorts.section_ativo', 'cohorts.section_futuro', 'cohorts.section_inativo']) {
    assert.ok(ptJs.includes(`'${key}'`) && enJs.includes(`'${key}'`), `${key} in both dicts`);
  }
});

test('turma phase is a left bar (not a dot); client uses its own icon; hover = selected teal', () => {
  // The phase class has to reach the ROW ELEMENT, which through the rail means rowClass —
  // markup inside renderRow could not carry the row's own left border.
  assert.match(cohortsJs, /rowClass: \(tm\) => _turmaPhase\(tm\)\.cls/);
  assert.ok(!/cdx-ti-dot/.test(cohortsJs), 'phase dot removed');
  // icon goes through _iconSrc (R2 key -> served URL), with an initials fallback
  assert.match(cohortsJs, /src="' \+ _esc\(_iconSrc\(client\.icon_path\)\)/);
  assert.match(cohortsJs, /function _wireAvatars\(/);
  // The rail replaces its whole body on render, so the <img> error handlers must be
  // re-attached every time — not once at mount, which was the bug this pins.
  assert.match(cohortsJs, /_navRail\.render\(\);\s*\n[\s\S]{0,220}?_wireAvatars\(_q\(IDS\.list\)\)/,
    '_renderList re-wires the avatars after every rail render');
  const css = read('../cohorts/cohorts.css');
  // Scoped to this rail: the other eight must not inherit the accent bar or the teal.
  assert.match(css, /\.cdx-cohorts-listpane \.cdx-rail-row \{[^}]*border-left: 3px solid var\(--ph/);
  assert.match(css, /\.cdx-cohorts-listpane \.cdx-rail-row:hover,\s*\.cdx-cohorts-listpane \.cdx-rail-row\.is-on \{ background: var\(--cdx-chip-bg\)/);
});
