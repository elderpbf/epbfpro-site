// cohorts/person-list.js — THE one list, rendered for both scopes. These pin the rules Élder
// specified, not a snapshot: the column ORDER, the one-turma-does-not-expand rule, the sub-rows
// landing on the SAME grid columns as their header, and the "+" only existing when there are
// aliases. Élder: "both the participant list in the dossier and this one should be the same list."
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  summarize,
  isExpandable,
  fmtLeft,
  remainingSec,
  accessCell,
  approvalTitle,
  personRowHtml,
  personListHtml,
  headerHtml,
} from '../cohorts/person-list.js';

const NOW = 1_700_000_000;
const row = (o = {}) => ({
  participant_id: o.pid || 1, turma_id: o.turma_id || 1,
  client_slug: o.client_slug || 'JFSE', turma_slug: 'gab', turma_name: o.turma_name || 'gabinete',
  access_status: o.status || 'approved', approved_via: o.via || 'enrollment',
  approved_at: o.approved_at || null, email_verified: o.verified ? 1 : 0,
  last_access_at: o.last_access_at || null, session_expires_at: o.exp === undefined ? null : o.exp,
  active_sessions: o.active || 0, reentry_count: 0,
});
const person = (o = {}) => ({
  id: o.id || 7, email: o.email || 'ario@jfse.jus.br', name: o.name || 'Ariovaldo Macedo',
  role: 'student', aliases: o.aliases || [], rows: o.rows || [row()],
});

// ── the aggregates on a multi-turma header ────────────────────────────────────────
test('summarize: "2/2" means approved in 2 of the 2 turmas this person is in', () => {
  const p = person({ rows: [
    row({ pid: 1, turma_id: 1, status: 'approved', verified: 1, exp: NOW + 999 }),
    row({ pid: 2, turma_id: 2, status: 'approved', verified: 0, exp: null }),
  ] });
  const s = summarize(p, NOW);
  assert.equal(s.total, 2);
  assert.equal(s.approved, 2, 'approved in both');
  assert.equal(s.validated, 1, 'proved the inbox in one');
  assert.equal(s.live, 1, 'one live session');
});

test('summarize: a person with no rows does not divide by zero', () => {
  const s = summarize({ rows: [] }, NOW);
  assert.deepEqual([s.total, s.approved, s.validated, s.live], [0, 0, 0, 0]);
  assert.equal(s.lastAccess, null);
});

// ── Élder: "if a person only has one cohort there's no need to open it" ────────────
test('isExpandable: one turma never expands; two do', () => {
  assert.equal(isExpandable(person({ rows: [row()] })), false);
  assert.equal(isExpandable(person({ rows: [row({ pid: 1 }), row({ pid: 2, turma_id: 2 })] })), true);
  assert.equal(isExpandable({ rows: [] }), false);
});

test('one turma: the row IS the information — no detail block, no caret', () => {
  const html = personRowHtml(person({ rows: [row({ via: 'manual', verified: 1 })] }), { scope: 'global', nowSec: NOW });
  assert.ok(!/cdx-pl-detail/.test(html), 'nothing opens below');
  assert.ok(!/data-caret/.test(html), 'no expander control');
  assert.ok(/Manual/.test(html), 'its own approval is on the line itself');
  assert.ok(/gabinete/.test(html), 'its own turma is on the line itself');
});

test('many turmas: the header carries aggregates and the detail lines drop below', () => {
  const html = personRowHtml(person({ rows: [
    row({ pid: 1, turma_id: 1, via: 'enrollment', verified: 1 }),
    row({ pid: 2, turma_id: 2, via: 'manual', verified: 0, turma_name: 'admissibilidade' }),
  ] }), { scope: 'global', nowSec: NOW });
  assert.ok(/data-caret/.test(html), 'expander present');
  assert.ok(/cdx-pl-detail/.test(html), 'detail block present');
  assert.ok(/2\/2/.test(html), 'approved 2 of 2');
  assert.ok(/1\/2/.test(html), 'validated 1 of 2');
  assert.ok(/2 turmas/.test(html), 'the turma cell summarises');
  assert.ok(/admissibilidade/.test(html), 'each turma named in the detail');
});

// ── the grid: sub-rows must land under the same columns as the header ─────────────
test('a detail line emits the SAME column cells as the header, in the same order', () => {
  const html = personRowHtml(person({ rows: [
    row({ pid: 1, turma_id: 1 }), row({ pid: 2, turma_id: 2 }),
  ] }), { scope: 'global', nowSec: NOW });
  const detail = html.slice(html.indexOf('cdx-pl-detail'));
  // Match the CELL class only, never its modifier (cdx-pl-val--ok must not read as a second cell).
  const order = (s) => (s.match(/cdx-pl-(?:chk|av|id|turma|appr|val|acc|act)(?![-\w])/g) || []);
  // Élder: "make the information follow a column line... the information on the lines inside do
  // not match the ones on the person's header". Same classes, same order = same grid tracks.
  assert.deepEqual(order(detail.slice(0, detail.indexOf('</div>', 200))).slice(0, 8),
    ['cdx-pl-chk', 'cdx-pl-av', 'cdx-pl-id', 'cdx-pl-turma', 'cdx-pl-appr', 'cdx-pl-val', 'cdx-pl-acc', 'cdx-pl-act']);
});

test('header column ORDER is Élder\'s: nome/email, turma, aprovação, validação, acesso', () => {
  const h = headerHtml({ scope: 'global' });
  const i = (c) => h.indexOf(c);
  assert.ok(i('cdx-pl-id') < i('cdx-pl-turma'), 'nome/email before turma');
  assert.ok(i('cdx-pl-turma') < i('cdx-pl-appr'), 'turma before aprovação');
  assert.ok(i('cdx-pl-appr') < i('cdx-pl-val'), 'aprovação before validação');
  assert.ok(i('cdx-pl-val') < i('cdx-pl-acc'), 'validação before acesso');
});

// ── scope is the ONLY difference ──────────────────────────────────────────────────
test('turma scope hides the turma column; global shows it', () => {
  assert.ok(!/cdx-pl-turma/.test(headerHtml({ scope: 'turma' })), 'the cohort column is pointless inside a cohort');
  assert.ok(/cdx-pl-turma/.test(headerHtml({ scope: 'global' })));
});

test('turma scope drops the "go to cohort" arrow (you are already there)', () => {
  const p = person({ rows: [row()] });
  assert.ok(!/cdx-pl-go/.test(personRowHtml(p, { scope: 'turma', nowSec: NOW })));
  assert.ok(/cdx-pl-go/.test(personRowHtml(p, { scope: 'global', nowSec: NOW })));
});

test('both scopes render the SAME person with the same identity and actions data', () => {
  const p = person({ rows: [row()] });
  for (const scope of ['global', 'turma']) {
    const html = personRowHtml(p, { scope, nowSec: NOW });
    assert.ok(/data-status="approved"/.test(html), scope + ': gating data present');
    assert.ok(/data-verified="0"/.test(html), scope + ': gating data present');
    assert.ok(/data-edit/.test(html), scope + ': the same edit affordance');
    assert.ok(/cdx-pchk/.test(html), scope + ': the same selection affordance');
  }
});

// ── the "+" (Élder: "if they don't have any the hover should do nothing") ─────────
test('the "+" appears only when the person really has other addresses', () => {
  assert.ok(!/cdx-pl-plus/.test(personRowHtml(person({ aliases: [] }), { scope: 'global', nowSec: NOW })));
  const withAlias = personRowHtml(person({ aliases: ['maiana@agu.gov.br'] }), { scope: 'global', nowSec: NOW });
  assert.ok(/cdx-pl-plus/.test(withAlias));
  assert.ok(/maiana@agu\.gov\.br/.test(withAlias), 'carries the addresses for the popover');
});

// ── acesso: the live session, which expires ───────────────────────────────────────
test('accessCell: none / never / lapsed / live', () => {
  assert.equal(accessCell(row({ status: 'pending', exp: NOW + 99 }), NOW).label, '', 'no approval = no session');
  assert.equal(accessCell(row({ exp: null }), NOW).tone, 'off');
  assert.equal(accessCell(row({ exp: NOW - 1 }), NOW).tone, 'off');
  assert.equal(accessCell(row({ exp: NOW + 15 * 86400 }), NOW).label, '15d');
  assert.equal(accessCell(row({ exp: NOW + 15 * 86400 }), NOW).tone, 'ok');
  assert.equal(accessCell(row({ exp: NOW + 3600 }), NOW).tone, 'soon', 'under a day warns');
});

test('fmtLeft / remainingSec: days, hours, minutes, and never negative', () => {
  assert.equal(fmtLeft(15 * 86400), '15d');
  assert.equal(fmtLeft(5 * 3600), '5h');
  assert.equal(fmtLeft(42 * 60), '42min');
  assert.equal(fmtLeft(10), '<1min');
  assert.equal(remainingSec(NOW - 100, NOW), 0, 'an expired session is 0, not negative');
  assert.equal(remainingSec(null, NOW), 0);
});

// ── hover: every cell says what it is ─────────────────────────────────────────────
test('approvalTitle: says where and how, and when we know when', () => {
  assert.match(approvalTitle(row({ status: 'approved', via: 'enrollment', approved_at: null })), /Janela/);
  assert.match(approvalTitle(row({ status: 'pending' })), /esperando/);
  assert.match(approvalTitle(row({ status: 'denied' })), /bloqueou/);
});

test('every cell in a rendered row carries a hover title', () => {
  const html = personRowHtml(person({ rows: [row({ verified: 1, exp: NOW + 999 })] }), { scope: 'global', nowSec: NOW });
  for (const cls of ['cdx-pl-turma', 'cdx-pl-appr', 'cdx-pl-val', 'cdx-pl-acc']) {
    const m = new RegExp('cdx-pl-c [^"]*' + cls + '[^"]*"\\s+title="');
    assert.ok(m.test(html), cls + ' explains itself on hover');
  }
});

// ── the list shell ────────────────────────────────────────────────────────────────
test('personListHtml: empty renders the empty state, not a bare grid', () => {
  assert.match(personListHtml([], { scope: 'global' }), /cdx-empty/);
});

test('personListHtml: one header for N people', () => {
  const html = personListHtml([person({ id: 1 }), person({ id: 2, name: 'Cleo Pire' })], { scope: 'global', nowSec: NOW });
  assert.equal((html.match(/cdx-pl-head/g) || []).length, 1);
  assert.equal((html.match(/cdx-pl-row/g) || []).length, 2);
});

test('a nameless person still renders (no crash, a visible placeholder)', () => {
  const html = personRowHtml({ id: null, email: null, name: null, aliases: [], rows: [row()] }, { scope: 'turma', nowSec: NOW });
  assert.match(html, /sem nome/);
  assert.ok(/data-person=""/.test(html), 'an identity-less row carries no person id');
});
