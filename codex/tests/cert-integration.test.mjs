// tests/cert-integration.test.mjs
// Integration of the certificate RENDERER (cert-render.js — the 7 fixed fronts +
// shared back) into the Certificados face (certificates.js). The catalog, the
// issue flow and the preview/print are DOM-bound (browser-only), but they rest on
// a handful of PURE helpers that compose a saved certificate row (+ its meta_json
// snapshot) into render args and a printable document. Those helpers unit-test
// here under node --test with zero dependencies. This is the red phase.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Polyfills + stub so codex-api.js and vendor/qr.js import cleanly in node.
if (typeof globalThis.btoa === 'undefined') {
  globalThis.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
  globalThis.atob = (s) => Buffer.from(s, 'base64').toString('binary');
}
if (typeof globalThis.unescape === 'undefined') {
  globalThis.unescape = (s) => decodeURIComponent(s.replace(/%(?![\da-f]{2})/gi, '%25'));
}
globalThis.callWorker = (p) => Promise.resolve(p);

const certs = await import(new URL('../certificates/certificates.js', import.meta.url));

// ── buildIssuePayload now carries template_slug (key), theme and meta_json ──────
describe('buildIssuePayload — template / theme / meta', () => {
  test('serializes theme and the verso meta into meta_json', () => {
    const meta = { instructor: 'Élder Prudente Barbosa Filho', place: 'Aracaju · SE', modules: [{ n: 'I', t: 'X', d: 'y' }] };
    const payload = certs.buildIssuePayload({
      turmaId: 5, participantIds: [1], courseTitle: 'Curso',
      templateSlug: 'eclipse', theme: 'navy', meta,
    });
    assert.equal(payload.template_slug, 'eclipse');
    assert.equal(payload.theme, 'navy');
    assert.equal(typeof payload.meta_json, 'string');
    assert.deepEqual(JSON.parse(payload.meta_json), meta);
  });

  test('omits theme and meta_json when not provided (additive, back-compatible)', () => {
    const payload = certs.buildIssuePayload({ turmaId: 1, participantIds: [1], courseTitle: 'C' });
    assert.ok(!('theme' in payload) || payload.theme === undefined);
    assert.ok(!('meta_json' in payload) || payload.meta_json === undefined);
  });
});

// ── parseModulesText: one module per line, "Título :: descrição" ───────────────
describe('parseModulesText', () => {
  test('parses lines into {n,t,d} with roman numerals', () => {
    const mods = certs.parseModulesText('Fundamentos de LLMs :: Tokens e contexto.\nEngenharia de Prompt :: Frameworks.');
    assert.equal(mods.length, 2);
    assert.deepEqual(mods[0], { n: 'I', t: 'Fundamentos de LLMs', d: 'Tokens e contexto.' });
    assert.deepEqual(mods[1], { n: 'II', t: 'Engenharia de Prompt', d: 'Frameworks.' });
  });

  test('a line without :: becomes a title with empty description', () => {
    const mods = certs.parseModulesText('Só o título');
    assert.deepEqual(mods, [{ n: 'I', t: 'Só o título', d: '' }]);
  });

  test('blank lines are skipped and numbering stays sequential', () => {
    const mods = certs.parseModulesText('A\n\n   \nB\nC');
    assert.deepEqual(mods.map((m) => m.n), ['I', 'II', 'III']);
    assert.deepEqual(mods.map((m) => m.t), ['A', 'B', 'C']);
  });

  test('empty / null input yields an empty array', () => {
    assert.deepEqual(certs.parseModulesText(''), []);
    assert.deepEqual(certs.parseModulesText(null), []);
  });
});

// ── parseCertMeta: defaults merged with the row's meta_json snapshot ───────────
describe('parseCertMeta', () => {
  test('returns defaultMeta fields when there is no meta_json', () => {
    const meta = certs.parseCertMeta({ code: 'X' });
    assert.equal(meta.instructor, 'Élder Prudente Barbosa Filho');
    assert.equal(meta.issuer, 'EPBF Soluções em Tecnologia Ltda');
    assert.deepEqual(meta.modules, []);
  });

  test('meta_json overrides defaults and supplies modules', () => {
    const cert = { meta_json: JSON.stringify({ place: 'Aracaju · SE', modules: [{ n: 'I', t: 'M', d: '' }] }) };
    const meta = certs.parseCertMeta(cert);
    assert.equal(meta.place, 'Aracaju · SE');
    assert.equal(meta.modules.length, 1);
    assert.equal(meta.instructor, 'Élder Prudente Barbosa Filho'); // default kept
  });

  test('malformed meta_json falls back to defaults (no throw)', () => {
    const meta = certs.parseCertMeta({ meta_json: '{not json' });
    assert.equal(meta.instructor, 'Élder Prudente Barbosa Filho');
  });
});

// ── certTemplateKey / certThemeKey: validated keys with safe fallbacks ─────────
describe('certTemplateKey / certThemeKey', () => {
  test('reads the saved key when valid', () => {
    assert.equal(certs.certTemplateKey({ template_slug: 'console' }), 'console');
    assert.equal(certs.certThemeKey({ theme: 'teal' }), 'teal');
  });
  test('falls back for missing/invalid keys', () => {
    assert.equal(certs.certTemplateKey({ template_slug: 'legacy-slides-slug' }), 'vetor');
    assert.equal(certs.certTemplateKey({}), 'vetor');
    assert.equal(certs.certThemeKey({ theme: 'pink' }), 'duo');
    assert.equal(certs.certThemeKey({}), 'duo');
  });
});

// ── renderCertHtml: full front+back from a saved row (the smoke seam) ──────────
describe('renderCertHtml', () => {
  test('renders the chosen front, the back, holder, code, QR and every module', () => {
    const cert = certs.sampleCert();
    const html = certs.renderCertHtml(cert, 'https://pensoia.com');
    assert.ok(html.includes('f-vetor'), 'front template applied');
    assert.ok(html.includes('cdxc-sheet back'), 'back included');
    assert.ok(html.includes('Marina Andrade Conrado'), 'holder');
    assert.ok(html.includes('AB3HNQ4VXY'), 'code');
    assert.ok(html.includes('data-qr'), 'qr placeholder for hydrate');
    assert.ok(html.includes('Fundamentos de LLMs'), 'verso module I');
    assert.ok(html.includes('Engenharia de Prompt'), 'verso module II');
    assert.ok(html.includes('VNC Advocacia'), 'client from meta');
  });

  test('honors the saved template + theme keys', () => {
    const cert = Object.assign(certs.sampleCert(), { template_slug: 'mono', theme: 'navy' });
    const html = certs.renderCertHtml(cert, 'https://pensoia.com');
    assert.ok(html.includes('f-mono'), 'mono front');
    assert.ok(html.includes('data-pal="navy"'), 'navy theme');
  });
  test('a retired dark template falls back to the default (vetor)', () => {
    const cert = Object.assign(certs.sampleCert(), { template_slug: 'eclipse' });
    assert.ok(certs.renderCertHtml(cert, 'https://pensoia.com').includes('f-vetor'), 'falls back to vetor');
  });
});

// ── PDF download path: rasterize the live render (cert-pdf.js), not window.print ──
// The interactive browser print dialog rendered certs inconsistently (shifted
// elements, dropped gradient, missing logo, backing boxes). The download now goes
// through cert-pdf.js (modern-screenshot + jsPDF), so the PDF is pixel-faithful to
// the on-screen sheet. Source-contract test (the module render is browser-only).
import { readFileSync as _readFile } from 'node:fs';
describe('PDF download path', () => {
  const src = _readFile(new URL('../certificates/certificates.js', import.meta.url), 'utf8');
  const pdf = _readFile(new URL('../certificates/cert-pdf.js', import.meta.url), 'utf8');

  test('certificates.js downloads via the rasterizer, not window.print', () => {
    assert.ok(src.includes("from './cert-pdf.js'"), 'imports the cert-pdf module');
    assert.ok(src.includes('downloadCertsPdf'), 'calls downloadCertsPdf');
    assert.ok(!/window\.open\(/.test(src), 'no window.open print popup');
    assert.ok(!src.includes('buildPrintDocument'), 'old print-document builder is gone');
  });
  test('cert-pdf.js uses modern-screenshot + jsPDF, vendored locally', () => {
    assert.ok(pdf.includes('downloadCertsPdf'), 'exports downloadCertsPdf');
    assert.ok(pdf.includes('domToCanvas'), 'uses modern-screenshot domToCanvas');
    assert.ok(pdf.includes('jspdf.umd.min.js'), 'jsPDF vendored locally (no CDN)');
    assert.ok(pdf.includes('modern-screenshot.umd.js'), 'modern-screenshot vendored locally (no CDN)');
  });
  test('cert-pdf.js exposes a base64 export (e-mail/upload path) sharing the build', () => {
    assert.ok(pdf.includes('export async function renderCertsPdfBase64'), 'renderCertsPdfBase64 exported');
    assert.ok(pdf.includes('datauristring'), 'returns the PDF bytes as base64');
    assert.ok(pdf.includes('_buildCertsDoc'), 'shares one build path with downloadCertsPdf (identical file)');
  });
});

// ── catalog/registry surface re-exported for the Modelos catalog ───────────────
describe('catalog surface', () => {
  test('re-exports the 3 templates and 3 themes for the catalog UI', () => {
    assert.equal(certs.CERT_TEMPLATES.length, 3);
    assert.equal(certs.CERT_THEMES.length, 3);
  });
});
