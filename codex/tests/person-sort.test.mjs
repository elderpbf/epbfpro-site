// The column headers ARE the sort control (Élder 2026-07-15: "since we have column headers now,
// let's make them sort by those; so the sort dropdown is no longer needed").
//
// What these pin is the part that is easy to get subtly wrong: which END each column opens on, and
// that `acesso` sorts by what the column SHOWS (the live session) rather than by último acesso,
// which is a different number living in the hover.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { headerHtml, SORT_DEFAULT_DIR } from '../cohorts/person-list.js';
import { emptyFilterState, applySortClick, applyFilters, filtersBarHtml, FILTER_IDS } from '../cohorts/person-filters.js';

const NOW = 1_700_000_000;
const row = (o = {}) => ({
  participant_id: o.pid || 1, turma_id: o.turma_id || 1, client_slug: o.client_slug || 'jfse',
  turma_slug: 't', turma_name: 'turma', access_status: o.status || 'approved',
  approved_via: 'manual', email_verified: o.verified ? 1 : 0,
  last_access_at: o.last_access_at || null,
  session_expires_at: o.exp === undefined ? null : o.exp,
  active_sessions: o.active || 0, reentry_count: 0,
});
const person = (o = {}) => ({
  id: o.id || 1, name: o.name || 'Pessoa', email: o.email || 'p@x.com', role: 'student',
  aliases: [], rows: o.rows || [row()],
  turma_count: (o.rows || [row()]).length,
  email_verified: o.verified ? 1 : 0,
  last_access_at: o.last_access_at || null,
});
const names = (list, state) => applyFilters(list, { ...emptyFilterState(), ...state, nowSec: NOW }).map((p) => p.name);

// ── the control moved from a dropdown to the headers ────────────────────────────────
test('the sort dropdown is GONE from the bar', () => {
  const h = filtersBarHtml(emptyFilterState(), [person(), person({ id: 2 })], '');
  assert.doesNotMatch(h, /cdx-al-sort/);
  assert.equal(FILTER_IDS.sort, undefined);
});

test('every data column header is a sort button; the structural ones are not', () => {
  const h = headerHtml({ scope: 'global', sort: 'name', dir: 'asc' });
  ['name', 'turmas', 'status', 'validated', 'access'].forEach((k) => {
    assert.match(h, new RegExp('data-sort="' + k + '"'));
  });
  assert.equal((h.match(/data-sort=/g) || []).length, 5);   // not the checkbox/avatar/actions cells
});

test('inside a turma there is no turma column, so there is no sorting by it', () => {
  const h = headerHtml({ scope: 'turma', sort: 'name', dir: 'asc' });
  assert.doesNotMatch(h, /data-sort="turmas"/);
  // ...and the other four still sort
  ['name', 'status', 'validated', 'access'].forEach((k) => assert.match(h, new RegExp('data-sort="' + k + '"')));
});

test('the active column shows the direction; the others show nothing', () => {
  const asc = headerHtml({ scope: 'global', sort: 'name', dir: 'asc' });
  assert.match(asc, /cdx-pl-sort is-on" data-sort="name"[^>]*>[^<]*▴/);
  assert.equal((asc.match(/is-on/g) || []).length, 1);
  const desc = headerHtml({ scope: 'global', sort: 'access', dir: 'desc' });
  assert.match(desc, /data-sort="access"[^>]*>[^<]*▾/);
  assert.doesNotMatch(desc, /data-sort="name"[^>]*>[^<]*[▴▾]/);
});

// ── which end a column opens on ─────────────────────────────────────────────────────
test('a NEW column opens on its own natural end, not blindly ascending', () => {
  // The trap: an always-ascending toggle would open `acesso` on "nunca entrou" and `turma` on
  // "1 turma" — sorts nobody clicks a header to see.
  const s = emptyFilterState();
  applySortClick(s, 'access');
  assert.deepEqual([s.sort, s.dir], ['access', 'desc']);
  applySortClick(s, 'turmas');
  assert.deepEqual([s.sort, s.dir], ['turmas', 'desc']);
  applySortClick(s, 'name');
  assert.deepEqual([s.sort, s.dir], ['name', 'asc']);   // ...but a name still opens A→Z
  assert.equal(SORT_DEFAULT_DIR.status, 'asc');         // worst standing first
});

test('clicking the SAME column reverses it', () => {
  const s = emptyFilterState();
  applySortClick(s, 'turmas');
  assert.equal(s.dir, 'desc');
  applySortClick(s, 'turmas');
  assert.equal(s.dir, 'asc');
  applySortClick(s, 'turmas');
  assert.equal(s.dir, 'desc');
});

// ── the comparators ─────────────────────────────────────────────────────────────────
test('nome sorts A→Z, and reverses', () => {
  const list = [person({ id: 1, name: 'Cleo' }), person({ id: 2, name: 'Ana' }), person({ id: 3, name: 'Bruno' })];
  assert.deepEqual(names(list, { sort: 'name', dir: 'asc' }), ['Ana', 'Bruno', 'Cleo']);
  assert.deepEqual(names(list, { sort: 'name', dir: 'desc' }), ['Cleo', 'Bruno', 'Ana']);
});

test('turma sorts by how many, most first on the header default', () => {
  const list = [
    person({ id: 1, name: 'Um', rows: [row()] }),
    person({ id: 2, name: 'Tres', rows: [row({ pid: 1 }), row({ pid: 2 }), row({ pid: 3 })] }),
    person({ id: 3, name: 'Dois', rows: [row({ pid: 4 }), row({ pid: 5 })] }),
  ];
  assert.deepEqual(names(list, { sort: 'turmas', dir: 'desc' }), ['Tres', 'Dois', 'Um']);
  assert.deepEqual(names(list, { sort: 'turmas', dir: 'asc' }), ['Um', 'Dois', 'Tres']);
});

test('aprovação puts pending first — it is the one that needs you', () => {
  const list = [
    person({ id: 1, name: 'Aprovado', rows: [row({ status: 'approved' })] }),
    person({ id: 2, name: 'Bloqueado', rows: [row({ status: 'denied' })] }),
    person({ id: 3, name: 'Pendente', rows: [row({ status: 'pending' })] }),
  ];
  assert.deepEqual(names(list, { sort: 'status', dir: 'asc' }), ['Pendente', 'Bloqueado', 'Aprovado']);
});

test('validação puts the ones still owing proof first', () => {
  const list = [
    person({ id: 1, name: 'Validado', verified: 1, rows: [row({ verified: 1 })] }),
    person({ id: 2, name: 'Nao', verified: 0, rows: [row()] }),
  ];
  assert.deepEqual(names(list, { sort: 'validated', dir: 'asc' }), ['Nao', 'Validado']);
  assert.deepEqual(names(list, { sort: 'validated', dir: 'desc' }), ['Validado', 'Nao']);
});

test('acesso sorts by the LIVE SESSION — what the column shows — not by último acesso', () => {
  // Deliberately adversarial: "Expirada" has by far the most recent último acesso, so a sort keyed
  // on last_access_at would put it on top. The column shows the session, so the live one wins.
  const list = [
    person({ id: 1, name: 'Nunca', rows: [row({ exp: null, last_access_at: null })] }),
    person({ id: 2, name: 'Expirada', rows: [row({ exp: NOW - 10, last_access_at: NOW - 20 })] }),
    person({ id: 3, name: 'Viva', rows: [row({ exp: NOW + 86400, active: 1, last_access_at: NOW - 100000 })] }),
    person({ id: 4, name: 'VivaMais', rows: [row({ exp: NOW + 900000, active: 1, last_access_at: NOW - 200000 })] }),
  ];
  assert.deepEqual(names(list, { sort: 'access', dir: 'desc' }), ['VivaMais', 'Viva', 'Expirada', 'Nunca']);
  assert.deepEqual(names(list, { sort: 'access', dir: 'asc' }), ['Nunca', 'Expirada', 'Viva', 'VivaMais']);
});

test('a multi-turma person is ranked by their BEST row, so one live session shows as live', () => {
  const list = [
    person({ id: 1, name: 'UmaViva', rows: [row({ pid: 1, exp: null }), row({ pid: 2, exp: NOW + 86400, active: 1 })] }),
    person({ id: 2, name: 'NenhumaViva', rows: [row({ pid: 3, exp: NOW - 10 }), row({ pid: 4, exp: null })] }),
  ];
  assert.deepEqual(names(list, { sort: 'access', dir: 'desc' }), ['UmaViva', 'NenhumaViva']);
});

// ── the tiebreak ────────────────────────────────────────────────────────────────────
test('name breaks every tie A→Z, even when the primary key is reversed', () => {
  // A plain .reverse() of the sorted array would hand back names Z→A inside each group, and would
  // make an unchanged list appear to shuffle on repaint.
  const list = [
    person({ id: 1, name: 'Carlos', rows: [row()] }),
    person({ id: 2, name: 'Ana', rows: [row()] }),
    person({ id: 3, name: 'Beatriz', rows: [row()] }),
  ];
  assert.deepEqual(names(list, { sort: 'turmas', dir: 'desc' }), ['Ana', 'Beatriz', 'Carlos']);
  assert.deepEqual(names(list, { sort: 'turmas', dir: 'asc' }), ['Ana', 'Beatriz', 'Carlos']);
});

test('sorting is stable across repaints: same input, same output', () => {
  const list = [person({ id: 1, name: 'B' }), person({ id: 2, name: 'A' })];
  const a = names(list, { sort: 'status', dir: 'asc' });
  const b = names(list, { sort: 'status', dir: 'asc' });
  assert.deepEqual(a, b);
});

test('an unknown sort key falls back to name instead of throwing', () => {
  const list = [person({ id: 1, name: 'B' }), person({ id: 2, name: 'A' })];
  assert.deepEqual(names(list, { sort: 'bogus' }), ['A', 'B']);
});

test('filtering still applies before sorting', () => {
  const list = [
    person({ id: 1, name: 'Ana', rows: [row({ status: 'pending' })] }),
    person({ id: 2, name: 'Bruno', rows: [row({ status: 'approved' })] }),
  ];
  assert.deepEqual(names(list, { sort: 'name', status: 'pending' }), ['Ana']);
});

// ── search (js/text-search.js) ────────────────────────────────────────────────
// A roster holds names the STUDENT typed at enrolment, searched by a query Élder
// types while a class is running. Requiring the accents to line up made the box
// answer "no such person" for people who are right there on the list.
test('search ignores accents in both directions', () => {
  const list = [person({ id: 1, name: 'João Inácio' }), person({ id: 2, name: 'Ana Silva' })];
  assert.deepEqual(names(list, { search: 'joao' }), ['João Inácio']);
  assert.deepEqual(names(list, { search: 'João' }), ['João Inácio']);
  assert.deepEqual(names(list, { search: 'inacio' }), ['João Inácio']);
});

test('search still matches the email as well as the name', () => {
  const list = [
    person({ id: 1, name: 'Ana Silva', email: 'ana@tjse.jus.br' }),
    person({ id: 2, name: 'Bruno Costa', email: 'bruno@x.com' }),
  ];
  assert.deepEqual(names(list, { search: 'tjse' }), ['Ana Silva']);
});

test('a blank search matches everyone', () => {
  const list = [person({ id: 1, name: 'Ana' }), person({ id: 2, name: 'Bruno' })];
  assert.deepEqual(names(list, { search: '   ' }), ['Ana', 'Bruno']);
});
