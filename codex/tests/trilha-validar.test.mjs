// tests/trilha-validar.test.mjs
// Codex Trail · certificate-validation face. Ports the behavior contract of the
// legacy trilha/js/validar.test.js to the cdx- module, asserting the DOM-free
// view logic (fmtDate / getCode / certView / validateCode). The innerHTML
// rendering is verified visually on staging, the no-node_modules way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtDate, getCode, certView, validateCode } from '../trilha/js/validar.js';

// ── fmtDate ─────────────────────────────────────────────────────────────────
test('fmtDate: ISO -> d/m/yyyy, leading zeros stripped', () => {
  assert.equal(fmtDate('2026-01-07'), '7/1/2026');
  assert.equal(fmtDate('2024-11-30'), '30/11/2024');
});
test('fmtDate: falsy/short -> empty or passthrough', () => {
  assert.equal(fmtDate(''), '');
  assert.equal(fmtDate(null), '');
});

// ── getCode ─────────────────────────────────────────────────────────────────
test('getCode: reads ?code=', () => {
  assert.equal(getCode('?code=ABC123XY'), 'ABC123XY');
});
test('getCode: absent -> empty', () => {
  assert.equal(getCode(''), '');
  assert.equal(getCode('?x=1'), '');
});

const VALID = {
  holder_name: 'Maria da Silva',
  course_title: 'Inteligência Artificial na Prática',
  hours: 20,
  issued_on: '2026-05-15',
  issuer: 'PensoIA Educação',
  status: 'issued',
  pdf_url: '/r2/certificates/ABC123XY.pdf',
};
const REVOKED = { ...VALID, status: 'revoked' };

// ── certView ────────────────────────────────────────────────────────────────
test('certView valid: badge, fields, pdf', () => {
  const v = certView(VALID);
  assert.equal(v.revoked, false);
  assert.equal(v.badge.kind, 'valid');
  assert.match(v.badge.label, /válido/i);
  assert.equal(v.fields.holder, 'Maria da Silva');
  assert.equal(v.fields.course, 'Inteligência Artificial na Prática');
  assert.equal(v.fields.hours, '20h');
  assert.equal(v.fields.issued, '15/5/2026');
  assert.equal(v.fields.issuer, 'PensoIA Educação');
  assert.deepEqual(v.pdf, { show: true, href: '/r2/certificates/ABC123XY.pdf' });
});
test('certView: hours null -> em dash', () => {
  assert.equal(certView({ ...VALID, hours: null }).fields.hours, '—');
});
test('certView valid without pdf_url: pdf hidden', () => {
  assert.equal(certView({ ...VALID, pdf_url: null }).pdf.show, false);
});
test('certView revoked: revoked badge + pdf suppressed even with url', () => {
  const v = certView(REVOKED);
  assert.equal(v.revoked, true);
  assert.equal(v.badge.kind, 'revoked');
  assert.match(v.badge.label, /revogado/i);
  assert.equal(v.pdf.show, false);
});

// ── validateCode (facade stubbed) ───────────────────────────────────────────
test('validateCode ok -> result state with view', async () => {
  const api = { validateCert: async () => ({ ok: true, certificate: VALID }) };
  const s = await validateCode(api, 'ABC123XY');
  assert.equal(s.state, 'result');
  assert.equal(s.view.fields.holder, 'Maria da Silva');
});
test('validateCode ok:false -> not-found error', async () => {
  const api = { validateCert: async () => ({ ok: false }) };
  const s = await validateCode(api, 'UNKNOWN');
  assert.equal(s.state, 'error');
  assert.match(s.msg, /não encontrado/i);
});
test('validateCode throw -> connection error', async () => {
  const api = { validateCert: async () => { throw new Error('net'); } };
  const s = await validateCode(api, 'NETFAIL');
  assert.equal(s.state, 'error');
  assert.match(s.msg, /conexão/i);
});
test('validateCode passes { code } to the facade', async () => {
  let got;
  const api = { validateCert: async (p) => { got = p; return { ok: true, certificate: VALID }; } };
  await validateCode(api, 'ABC123XY');
  assert.deepEqual(got, { code: 'ABC123XY' });
});
test('validateCode accepts a flat {ok:true,...cert} payload (no .certificate)', async () => {
  const api = { validateCert: async () => ({ ok: true, ...VALID }) };
  const s = await validateCode(api, 'FLAT');
  assert.equal(s.state, 'result');
  assert.equal(s.view.fields.holder, 'Maria da Silva');
});
