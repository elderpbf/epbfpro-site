// Certificates facade: each method maps to the correct FROZEN Worker action
// string (API.md §Certificate Administration + §Participant Roster) and passes
// params straight through. callWorker is stubbed to echo the final payload so
// we can read back the action.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const api = await import('../js/codex-api.js');

// Stub the window global the facade calls. The facade references `callWorker`
// as a bare global, so it resolves to globalThis.callWorker at call time.
globalThis.callWorker = (payload) => payload;

// ── cohorts roster extensions ─────────────────────────────────────────────────

test('cohorts facade exposes the roster methods', () => {
  assert.ok(api.cohorts, 'codex-api exports a `cohorts` group');
  const expected = [
    'listParticipants', 'addParticipant', 'updateParticipant',
    'deleteParticipant', 'importParticipants',
  ];
  for (const m of expected) {
    assert.equal(typeof api.cohorts[m], 'function', `cohorts.${m} is a function`);
  }
});

test('cohorts roster methods map to the frozen action strings', () => {
  const c = api.cohorts;
  const cases = [
    [() => c.listParticipants({ turma_id: 1 }),                              'ct_list_participants'],
    [() => c.addParticipant({ turma_id: 1, name: 'Ana Silva' }),             'ct_add_participant'],
    [() => c.updateParticipant({ id: 1, name: 'Ana Costa' }),                'ct_update_participant'],
    [() => c.deleteParticipant({ id: 1 }),                                   'ct_delete_participant'],
    [() => c.importParticipants({ turma_id: 1, rows: [{ name: 'Bob' }] }),   'ct_import_participants'],
  ];
  for (const [fn, action] of cases) {
    const out = fn();
    assert.equal(out.action, action, `maps to ${action}`);
  }
});

test('cohorts roster methods pass params through unchanged', () => {
  const out = api.cohorts.addParticipant({ turma_id: 7, name: 'Ana Silva', email: 'ana@example.com', cpf: '000.000.000-00' });
  assert.equal(out.action, 'ct_add_participant');
  assert.equal(out.turma_id, 7);
  assert.equal(out.name, 'Ana Silva');
  assert.equal(out.email, 'ana@example.com');
  assert.equal(out.cpf, '000.000.000-00');
});

test('importParticipants passes rows array through unchanged', () => {
  const rows = [{ name: 'Ana Silva', email: 'ana@example.com' }, { name: 'Bob Santos' }];
  const out = api.cohorts.importParticipants({ turma_id: 3, rows });
  assert.equal(out.action, 'ct_import_participants');
  assert.equal(out.turma_id, 3);
  assert.deepEqual(out.rows, rows);
});

// ── certificates export ───────────────────────────────────────────────────────

test('codex-api exports a `certificates` group', () => {
  assert.ok(api.certificates, 'codex-api exports a `certificates` group');
  const expected = ['issue', 'list', 'get', 'revoke', 'markSent', 'attachPdf'];
  for (const m of expected) {
    assert.equal(typeof api.certificates[m], 'function', `certificates.${m} is a function`);
  }
});

test('certificates facade does NOT expose cert_validate (public action, not an admin method)', () => {
  assert.equal(api.certificates.validate, undefined, 'cert_validate is not on the certificates export');
});

test('certificates facade maps methods to the frozen action strings', () => {
  const c = api.certificates;
  const cases = [
    [() => c.issue({ turma_id: 1, participant_ids: [1, 2], course_title: 'JS' }), 'cert_issue'],
    [() => c.list({ turma_id: 1, status: 'issued' }),                             'cert_list'],
    [() => c.get({ code: 'AB3HNQ4VXY' }),                                         'cert_get'],
    [() => c.revoke({ code: 'AB3HNQ4VXY' }),                                      'cert_revoke'],
    [() => c.markSent({ code: 'AB3HNQ4VXY' }),                                    'cert_mark_sent'],
    [() => c.attachPdf({ code: 'AB3HNQ4VXY', pdf_b64: 'abc==' }),                 'cert_attach_pdf'],
  ];
  for (const [fn, action] of cases) {
    const out = fn();
    assert.equal(out.action, action, `maps to ${action}`);
  }
});

test('certificates facade passes params through unchanged', () => {
  const ids = [1, 2, 3];
  const out = api.certificates.issue({
    turma_id: 1,
    participant_ids: ids,
    course_title: 'Formação em JavaScript',
    hours: '40',
    issued_on: '2024-06-01',
    issuer: 'PensoIA',
    template_slug: 'padrao-2024',
  });
  assert.equal(out.action, 'cert_issue');
  assert.equal(out.turma_id, 1);
  assert.deepEqual(out.participant_ids, ids);
  assert.equal(out.course_title, 'Formação em JavaScript');
  assert.equal(out.hours, '40');
  assert.equal(out.issued_on, '2024-06-01');
  assert.equal(out.issuer, 'PensoIA');
  assert.equal(out.template_slug, 'padrao-2024');
});

test('certificates.list optional filters pass through', () => {
  const out = api.certificates.list({ turma_id: 2, status: 'sent', q: 'ana' });
  assert.equal(out.action, 'cert_list');
  assert.equal(out.turma_id, 2);
  assert.equal(out.status, 'sent');
  assert.equal(out.q, 'ana');
});

test('certificates.attachPdf passes code and pdf_b64 through unchanged', () => {
  const out = api.certificates.attachPdf({ code: 'ZT9KMPWXE2', pdf_b64: 'JVBERi0xLjQ=' });
  assert.equal(out.action, 'cert_attach_pdf');
  assert.equal(out.code, 'ZT9KMPWXE2');
  assert.equal(out.pdf_b64, 'JVBERi0xLjQ=');
});
