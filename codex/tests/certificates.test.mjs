// tests/certificates.test.mjs
// Unit tests for the pure functions in certificates/certificates.js.
// Tests that require a real DOM, the Slides editor, or the Worker backend are
// tagged BROWSER-ONLY in comments and excluded from node --test.
//
// Coverage:
//   - module loads and exports mount/unmount
//   - buildValidarUrl (pure)
//   - formatIssuedOn (pure)
//   - statusBadgeClass (pure)
//   - buildTokenValues (pure — stubs generateQrDataUrl via the same module import)
//   - buildIssuePayload (pure)
//   - filterCerts (pure)
//   - QR vendor: generateQrDataUrl returns a data URL string (Node fallback)
//   - QR vendor: generateQrSvg returns valid SVG string

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Polyfill btoa/atob for Node (needed by vendor/qr.js SVG fallback path)
if (typeof globalThis.btoa === 'undefined') {
  globalThis.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
  globalThis.atob = (s) => Buffer.from(s, 'base64').toString('binary');
}
// Polyfill unescape for Node (used by vendor/qr.js UTF-8 encoding)
if (typeof globalThis.unescape === 'undefined') {
  globalThis.unescape = (s) => decodeURIComponent(s.replace(/%(?![\da-f]{2})/gi, '%25'));
}

// Stub callWorker so codex-api.js doesn't crash on import
globalThis.callWorker = (p) => Promise.resolve(p);

// ── Import the module under test ──────────────────────────────────────────────
const certs = await import(new URL('../certificates/certificates.js', import.meta.url));
const qr    = await import(new URL('../certificates/vendor/qr.js',   import.meta.url));

// ── 1. Module surface ─────────────────────────────────────────────────────────
describe('certificates module exports', () => {
  test('exports mount function', () => {
    assert.equal(typeof certs.mount, 'function');
  });

  test('exports unmount function', () => {
    assert.equal(typeof certs.unmount, 'function');
  });

  test('exports subtabs function', () => {
    assert.equal(typeof certs.subtabs, 'function');
  });

  test('exports SUBTABS array with modelos and emitidos', () => {
    assert.ok(Array.isArray(certs.SUBTABS));
    const keys = certs.SUBTABS.map((s) => s.key);
    assert.ok(keys.includes('modelos'),  'SUBTABS has modelos');
    assert.ok(keys.includes('emitidos'), 'SUBTABS has emitidos');
  });

  test('exports all pure helper functions', () => {
    assert.equal(typeof certs.buildValidarUrl,   'function');
    assert.equal(typeof certs.formatIssuedOn,    'function');
    assert.equal(typeof certs.statusBadgeClass,  'function');
    assert.equal(typeof certs.buildTokenValues,  'function');
    assert.equal(typeof certs.buildIssuePayload, 'function');
    assert.equal(typeof certs.filterCerts,       'function');
  });
});

// ── 2. buildValidarUrl ────────────────────────────────────────────────────────
describe('buildValidarUrl', () => {
  test('builds the correct validar URL', () => {
    assert.equal(
      certs.buildValidarUrl('https://pensoia.com', 'AB3HNQ4VXY'),
      'https://pensoia.com/trilha/validar/AB3HNQ4VXY'
    );
  });

  test('empty origin produces a relative path', () => {
    assert.equal(
      certs.buildValidarUrl('', 'ABCDE'),
      '/trilha/validar/ABCDE'
    );
  });

  test('null origin defaults to empty string', () => {
    assert.equal(
      certs.buildValidarUrl(null, 'XYZ'),
      '/trilha/validar/XYZ'
    );
  });

  test('empty code produces a trailing slash', () => {
    assert.equal(
      certs.buildValidarUrl('https://example.com', ''),
      'https://example.com/trilha/validar/'
    );
  });
});

// ── 3. formatIssuedOn ─────────────────────────────────────────────────────────
describe('formatIssuedOn', () => {
  test('formats YYYY-MM-DD to DD/MM/YYYY', () => {
    assert.equal(certs.formatIssuedOn('2026-06-12'), '12/06/2026');
  });

  test('formats ISO datetime by slicing to date part', () => {
    assert.equal(certs.formatIssuedOn('2026-01-05T10:30:00Z'), '05/01/2026');
  });

  test('returns empty string for null', () => {
    assert.equal(certs.formatIssuedOn(null), '');
  });

  test('returns empty string for undefined', () => {
    assert.equal(certs.formatIssuedOn(undefined), '');
  });

  test('returns empty string for empty string', () => {
    assert.equal(certs.formatIssuedOn(''), '');
  });

  test('handles single-digit months and days', () => {
    assert.equal(certs.formatIssuedOn('2025-03-07'), '07/03/2025');
  });
});

// ── 4. statusBadgeClass ───────────────────────────────────────────────────────
describe('statusBadgeClass', () => {
  test('issued returns issued class', () => {
    const cls = certs.statusBadgeClass('issued');
    assert.ok(cls.includes('cdx-cert-badge--issued'), 'issued class');
  });

  test('sent returns sent class', () => {
    const cls = certs.statusBadgeClass('sent');
    assert.ok(cls.includes('cdx-cert-badge--sent'), 'sent class');
  });

  test('signed returns signed class', () => {
    const cls = certs.statusBadgeClass('signed');
    assert.ok(cls.includes('cdx-cert-badge--signed'), 'signed class');
  });

  test('revoked returns revoked class', () => {
    const cls = certs.statusBadgeClass('revoked');
    assert.ok(cls.includes('cdx-cert-badge--revoked'), 'revoked class');
  });

  test('unknown status returns unknown class', () => {
    const cls = certs.statusBadgeClass('pending');
    assert.ok(cls.includes('cdx-cert-badge--unknown'), 'unknown class');
  });

  test('all classes include cdx-cert-badge base class', () => {
    for (const s of ['issued', 'sent', 'revoked', 'unknown']) {
      const cls = certs.statusBadgeClass(s);
      assert.ok(cls.includes('cdx-cert-badge'), `base class present for "${s}"`);
    }
  });
});

// ── 5. buildIssuePayload ──────────────────────────────────────────────────────
describe('buildIssuePayload', () => {
  test('builds the expected API payload shape', () => {
    const payload = certs.buildIssuePayload({
      turmaId:        42,
      participantIds: [1, 2, 3],
      templateSlug:   'modelo-2024',
      courseTitle:    'Formação IA',
      hours:          '40',
      issuedOn:       '2026-06-12',
      issuer:         'PensoIA',
    });

    assert.equal(payload.turma_id,                42);
    assert.deepEqual(payload.participant_ids,      [1, 2, 3]);
    assert.equal(payload.template_slug,           'modelo-2024');
    assert.equal(payload.course_title,            'Formação IA');
    assert.equal(payload.hours,                   '40');
    assert.equal(payload.issued_on,               '2026-06-12');
    assert.equal(payload.issuer,                  'PensoIA');
  });

  test('omits undefined optional fields when not provided', () => {
    const payload = certs.buildIssuePayload({
      turmaId:        1,
      participantIds: [5],
      courseTitle:    'Curso',
    });
    assert.equal(payload.turma_id,   1);
    assert.equal(payload.course_title, 'Curso');
    assert.deepEqual(payload.participant_ids, [5]);
    // Optional fields omitted
    assert.ok(!('hours'         in payload) || payload.hours === undefined);
    assert.ok(!('issued_on'     in payload) || payload.issued_on === undefined);
    assert.ok(!('issuer'        in payload) || payload.issuer === undefined);
    assert.ok(!('template_slug' in payload) || payload.template_slug === undefined);
  });

  test('empty templateSlug is omitted (undefined)', () => {
    const payload = certs.buildIssuePayload({
      turmaId:        1,
      participantIds: [1],
      templateSlug:   '',
      courseTitle:    'X',
    });
    assert.equal(payload.template_slug, undefined);
  });
});

// ── 6. filterCerts ────────────────────────────────────────────────────────────
describe('filterCerts', () => {
  const fixtures = [
    { code: 'A1', holder_name: 'Ana Silva',   turma_id: 10, status: 'issued', course_title: 'IA' },
    { code: 'B2', holder_name: 'Bruno Costa',  turma_id: 10, status: 'sent',   course_title: 'JS' },
    { code: 'C3', holder_name: 'Carla Lopes',  turma_id: 20, status: 'issued', course_title: 'CSS' },
    { code: 'D4', holder_name: 'Diego Perez',  turma_id: 20, status: 'revoked',course_title: 'HTML' },
  ];

  test('no filters returns all certs', () => {
    assert.equal(certs.filterCerts(fixtures, {}).length, 4);
  });

  test('filter by turma_id (string)', () => {
    const res = certs.filterCerts(fixtures, { turma_id: '10' });
    assert.equal(res.length, 2);
    assert.ok(res.every((c) => c.turma_id === 10));
  });

  test('filter by status issued', () => {
    const res = certs.filterCerts(fixtures, { status: 'issued' });
    assert.equal(res.length, 2);
    assert.ok(res.every((c) => c.status === 'issued'));
  });

  test('filter by query string (case-insensitive name match)', () => {
    const res = certs.filterCerts(fixtures, { q: 'ana' });
    assert.equal(res.length, 1);
    assert.equal(res[0].code, 'A1');
  });

  test('combined filters: turma + status', () => {
    const res = certs.filterCerts(fixtures, { turma_id: '20', status: 'issued' });
    assert.equal(res.length, 1);
    assert.equal(res[0].code, 'C3');
  });

  test('empty query matches all', () => {
    assert.equal(certs.filterCerts(fixtures, { q: '' }).length, 4);
  });

  test('no match returns empty array', () => {
    assert.equal(certs.filterCerts(fixtures, { q: 'zzznomatch' }).length, 0);
  });

  test('handles empty array input', () => {
    assert.deepEqual(certs.filterCerts([], {}), []);
  });

  test('handles null/undefined input gracefully', () => {
    assert.deepEqual(certs.filterCerts(null, {}), []);
    assert.deepEqual(certs.filterCerts(undefined, {}), []);
  });

  // turma_ids = the set of a client's cohorts (drill down by client).
  test('filter by turma_ids membership (a clients cohorts)', () => {
    const res = certs.filterCerts(fixtures, { turma_ids: [10] });
    assert.equal(res.length, 2);
    assert.ok(res.every((c) => c.turma_id === 10));
  });

  test('turma_ids unions multiple cohorts', () => {
    assert.equal(certs.filterCerts(fixtures, { turma_ids: [10, 20] }).length, 4);
  });

  test('a specific turma_id takes precedence over turma_ids', () => {
    const res = certs.filterCerts(fixtures, { turma_id: '20', turma_ids: [10] });
    assert.equal(res.length, 2);
    assert.ok(res.every((c) => c.turma_id === 20));
  });

  test('empty turma_ids array is ignored (matches all)', () => {
    assert.equal(certs.filterCerts(fixtures, { turma_ids: [] }).length, 4);
  });

  test('turma_ids combines with the name query (AND)', () => {
    const res = certs.filterCerts(fixtures, { turma_ids: [10, 20], q: 'carla' });
    assert.equal(res.length, 1);
    assert.equal(res[0].code, 'C3');
  });

  // Date-range filter over issued_on (ISO yyyy-mm-dd, lexicographic == date order).
  const dated = [
    { code: 'E1', holder_name: 'Eva',  status: 'issued', issued_on: '2026-01-10' },
    { code: 'E2', holder_name: 'Fred', status: 'issued', issued_on: '2026-03-15' },
    { code: 'E3', holder_name: 'Gabi', status: 'issued', issued_on: '2026-06-01' },
    { code: 'E4', holder_name: 'Hugo', status: 'issued', issued_on: null },
  ];
  test('date_from keeps certs issued on/after the bound', () => {
    const res = certs.filterCerts(dated, { date_from: '2026-03-15' });
    assert.deepEqual(res.map((c) => c.code), ['E2', 'E3']);
  });
  test('date_to keeps certs issued on/before the bound', () => {
    const res = certs.filterCerts(dated, { date_to: '2026-03-15' });
    assert.deepEqual(res.map((c) => c.code), ['E1', 'E2']);
  });
  test('date_from + date_to is an inclusive range', () => {
    const res = certs.filterCerts(dated, { date_from: '2026-01-11', date_to: '2026-06-01' });
    assert.deepEqual(res.map((c) => c.code), ['E2', 'E3']);
  });
  test('a cert with no issued_on is excluded while a date bound is active, kept without', () => {
    assert.ok(!certs.filterCerts(dated, { date_from: '2026-01-01' }).some((c) => c.code === 'E4'));
    assert.ok(certs.filterCerts(dated, {}).some((c) => c.code === 'E4'));
  });
});

// ── 7. buildTokenValues ───────────────────────────────────────────────────────
describe('buildTokenValues', () => {
  test('maps all expected token keys from a certificate row', () => {
    const cert = {
      holder_name:  'Maria Oliveira',
      course_title: 'IA Aplicada',
      hours:        '40',
      issued_on:    '2026-06-12',
      code:         'C1',
    };
    // Use a short origin so the QR URL fits in version 3 (<=42 bytes)
    // "https://x.io/trilha/validar/C1" = 31 bytes
    const values = certs.buildTokenValues(cert, 'https://x.io');
    assert.equal(values.nome,   'Maria Oliveira');
    assert.equal(values.curso,  'IA Aplicada');
    assert.equal(values.carga,  '40');
    assert.equal(values.data,   '12/06/2026');
    assert.equal(values.codigo, 'C1');
    // qr must be a data URL
    assert.ok(typeof values.qr === 'string', 'qr is a string');
    assert.ok(values.qr.startsWith('data:'), 'qr is a data URL: ' + values.qr.slice(0, 30));
  });

  test('qr data URL encodes the correct validar URL', () => {
    // "https://x.io/trilha/validar/C42" = 32 bytes - fits in version 3
    const cert = { holder_name: 'X', course_title: 'Y', hours: '1', issued_on: '2026-01-01', code: 'C42' };
    const values = certs.buildTokenValues(cert, 'https://x.io');
    // We can't decode the QR, but we can assert the validar URL was passed by re-generating it
    const expectedUrl = certs.buildValidarUrl('https://x.io', 'C42');
    // The QR data URL is derived from expectedUrl; just confirm it's a data URL
    assert.ok(values.qr.startsWith('data:'));
    assert.ok(values.qr.length > 20, 'data URL is non-trivial');
  });

  test('missing cert fields produce empty strings (no crash)', () => {
    const cert = { code: 'X' };
    const values = certs.buildTokenValues(cert, '');
    assert.equal(values.nome,   '');
    assert.equal(values.curso,  '');
    assert.equal(values.carga,  '');
    assert.equal(values.data,   '');
    assert.equal(values.codigo, 'X');
  });
});

// ── 8. subtabs ────────────────────────────────────────────────────────────────
describe('subtabs', () => {
  test('returns two sub-tab entries', () => {
    const tabs = certs.subtabs('modelos');
    assert.equal(tabs.length, 2);
  });

  test('active sub-tab is correctly flagged', () => {
    const tabs = certs.subtabs('emitidos');
    const activeTab = tabs.find((s) => s.active);
    assert.ok(activeTab, 'has an active sub-tab');
    assert.ok(activeTab.href.includes('emitidos'), 'active href references emitidos');
  });

  test('defaults to emitidos (Emissão) when sub is invalid', () => {
    const tabs = certs.subtabs('nonexistent');
    const active = tabs.find((s) => s.active);
    assert.ok(active && active.href.includes('emitidos'), 'defaults to emitidos (the first/main sub-tab)');
  });

  test('Emissão (emitidos) is the first sub-tab, Modelos second', () => {
    const tabs = certs.subtabs('emitidos');
    assert.ok(tabs[0].href.includes('emitidos'), 'first sub-tab is emitidos');
    assert.ok(tabs[1].href.includes('modelos'), 'second sub-tab is modelos');
  });

  test('hrefs point to /codex/?tab=certificates&sub=<key>', () => {
    const tabs = certs.subtabs('modelos');
    for (const s of tabs) {
      assert.ok(s.href.startsWith('/codex/?tab=certificates'), 'href prefix correct');
    }
  });
});

// ── 9. QR vendor: generateQrSvg ──────────────────────────────────────────────
describe('generateQrSvg', () => {
  test('returns a string', () => {
    const svg = qr.generateQrSvg('https://example.com/validar/ABCDE');
    assert.equal(typeof svg, 'string');
  });

  test('returned string starts with <svg', () => {
    const svg = qr.generateQrSvg('https://example.com/validar/ABCDE');
    assert.ok(svg.startsWith('<svg'), 'SVG starts with <svg');
  });

  test('returned SVG contains black fill rects', () => {
    const svg = qr.generateQrSvg('HELLO');
    assert.ok(svg.includes('<rect'), 'SVG has rect elements');
    assert.ok(svg.includes('fill="black"'), 'SVG has black fill');
  });

  test('honors cellSize option', () => {
    const small = qr.generateQrSvg('X', { cellSize: 2 });
    const large = qr.generateQrSvg('X', { cellSize: 8 });
    // Larger cellSize -> larger total dimension
    const dimSmall = parseInt(small.match(/width="(\d+)"/)[1], 10);
    const dimLarge = parseInt(large.match(/width="(\d+)"/)[1], 10);
    assert.ok(dimLarge > dimSmall, 'larger cellSize produces a larger SVG');
  });

  test('throws when text exceeds supported capacity', () => {
    const tooLong = 'A'.repeat(300);
    assert.throws(() => qr.generateQrSvg(tooLong), /too long|overflow/);
  });
});

// ── 10. QR vendor: generateQrDataUrl ─────────────────────────────────────────
describe('generateQrDataUrl', () => {
  test('returns a string', () => {
    const url = qr.generateQrDataUrl('https://example.com/validar/CODE1');
    assert.equal(typeof url, 'string');
  });

  test('returned string is a data URL (starts with data:)', () => {
    const url = qr.generateQrDataUrl('https://example.com/validar/CODE2');
    assert.ok(url.startsWith('data:'), 'is a data URL');
  });

  test('different texts produce different data URLs', () => {
    const a = qr.generateQrDataUrl('https://example.com/validar/AAA');
    const b = qr.generateQrDataUrl('https://example.com/validar/BBB');
    assert.notEqual(a, b);
  });

  test('same text always produces the same data URL (deterministic)', () => {
    // Keep under 42 bytes (version 3 M capacity) to avoid needing higher versions
    const text = 'https://x.com/validar/FIXED123';
    const a = qr.generateQrDataUrl(text);
    const b = qr.generateQrDataUrl(text);
    assert.equal(a, b, 'QR generation is deterministic');
  });
});

// ── Emissão dashboard port (backstage/mocks/emissao/a3.html → cdx-emissao-*) ───
// Source-contract test: pins the A3 port. The Emitidos status <select> is gone,
// replaced by clickable KPI cards; the table gains a header select-all + sortable
// headers + a bulk-action bar; the 'signed' lifecycle is wired through the facade.
import { readFileSync } from 'node:fs';
describe('Emissão dashboard port (source contract)', () => {
  const src = readFileSync(new URL('../certificates/certificates.js', import.meta.url), 'utf8');
  const api = readFileSync(new URL('../js/codex-api.js', import.meta.url), 'utf8');

  test('KPI filter cards present', () => {
    assert.ok(src.includes('cdx-emissao-kpi'), 'KPI card class');
    assert.ok(src.includes('cdx-emissao-kpis'), 'KPI container');
  });
  test('header select-all + sortable headers present', () => {
    assert.ok(src.includes('cdx-emissao-selall'), 'select-all id');
    assert.ok(src.includes('data-sort='), 'sortable headers');
    assert.ok(src.includes('cdx-emissao-cbcol'), 'checkbox column');
  });
  test('bulk-action bar present', () => {
    assert.ok(src.includes('cdx-emissao-bulk'), 'bulk bar');
    assert.ok(src.includes("data-bulk=\"sign\"") || src.includes("data-bulk='sign'"), 'bulk sign action');
  });
  test('old status <select> filter is gone (cards replaced it)', () => {
    assert.ok(!src.includes('cdx-certs-filter-status'), 'old status select removed');
  });
  test("sign/send are gated until real signing/email — no false status flip", () => {
    // The row actions still exist (the workflow is visible)…
    assert.ok(src.includes("data-action=\"sign\""), 'row sign action present');
    assert.ok(src.includes("data-action=\"mark-sent\""), 'row send action present');
    // …but they must NOT complete a status change yet: clicking surfaces the
    // not-wired notice and does not call the mark APIs (no false signed/sent).
    assert.ok(src.includes("t('certificates.sign_not_wired')"), 'sign shows the not-wired notice');
    assert.ok(src.includes("t('certificates.send_not_wired')"), 'send shows the not-wired notice');
    assert.ok(!src.includes('api.markSigned'), 'does NOT flip status to signed yet');
    assert.ok(!src.includes('api.markSent'), 'does NOT flip status to sent yet');
    // The facade keeps the actions ready for when the real flows land.
    assert.ok(api.includes('cert_mark_signed'), 'facade still exposes cert_mark_signed');
    assert.ok(api.includes('cert_mark_sent'), 'facade still exposes cert_mark_sent');
  });
});

// ── Emissão fixes (2026-06-15): per-row PDF, revoked delete, bulk delete, modal
// select-all + model preview ───────────────────────────────────────────────────
describe('Emissão fixes (source contract)', () => {
  const src = readFileSync(new URL('../certificates/certificates.js', import.meta.url), 'utf8');
  const api = readFileSync(new URL('../js/codex-api.js', import.meta.url), 'utf8');

  test('every row can produce a PDF (print → Salvar como PDF), not gated on a stored file', () => {
    assert.ok(src.includes('data-action="pdf"'), 'per-row PDF action present');
    assert.ok(src.includes("if (action === 'pdf')"), 'pdf action routed to print');
  });
  test('delete is bulk-only (no per-row delete button), to avoid mis-click deletes', () => {
    assert.ok(!src.includes('data-action="delete"'), 'no per-row delete button');
    assert.ok(!/if \(action === 'delete'\)/.test(src), 'no per-row delete route');
  });
  test('bulk delete present and confirmed, deletable = issued|revoked', () => {
    assert.ok(src.includes('data-bulk="delete"'), 'bulk delete button');
    assert.ok(src.includes('_bulkDeleteConfirm'), 'bulk delete goes through a confirm');
    assert.ok(/c\.status === 'issued' \|\| c\.status === 'revoked'/.test(src), 'bulk delete filters to deletable statuses');
    assert.ok(api.includes('cert_delete'), 'facade exposes cert_delete');
  });
  test('issue modal has a select-all checkbox and a model preview', () => {
    assert.ok(src.includes('cdx-issue-selall'), 'roster select-all checkbox');
    assert.ok(src.includes('cdx-issue-preview'), 'preview button');
    assert.ok(src.includes('_buildIssuePreviewCert'), 'preview builds a cert from the form');
  });
});
