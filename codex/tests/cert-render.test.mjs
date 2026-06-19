// tests/cert-render.test.mjs
// The certificate renderer turns a saved certificate record + course metadata
// into the HTML for the 7 fixed front templates and the 1 shared back. The
// render functions are PURE (string in, string out) with placeholders for the
// brand logo / QR (filled by hydrate() in the browser), so they unit-test here
// with zero dependencies. This is the red phase: it imports cert-render.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CERT_TEMPLATES, CERT_TEMPLATE_KEYS, CERT_THEMES, CERT_THEME_KEYS,
  isTemplate, isTheme, defaultMeta, buildCertData,
  renderFront, renderBack, renderFrontPage, renderBackPage, renderCertificate,
  hoursNumber, hoursLabel,
} from '../certificates/cert-render.js';

const cert = {
  holder_name: 'Marina Andrade Conrado',
  course_title: 'IA do Zero ao Entendimento Prático',
  hours: '12 horas',
  issued_on: '2026-08-15',
  code: 'AB3HNQ4VXY',
  issuer: 'EPBF Soluções em Tecnologia Ltda',
  template: 'vetor',
  theme: 'duo',
};
const meta = Object.assign(defaultMeta(), {
  place: 'Aracaju · SE',
  client: 'VNC Advocacia',
  format: '3 encontros de 4 horas',
  meetings: '3',
  modules: [
    { n: 'I', t: 'Fundamentos de LLMs', d: 'Tokens e contexto.' },
    { n: 'II', t: 'Engenharia de Prompt', d: 'Frameworks.' },
  ],
});
const d = buildCertData(cert, meta, 'https://pensoia.com');

test('exposes exactly the 3 surviving light templates and 3 themes', () => {
  assert.equal(CERT_TEMPLATE_KEYS.length, 3);
  assert.deepEqual(CERT_TEMPLATE_KEYS, ['vetor', 'console', 'mono']);
  assert.equal(CERT_THEME_KEYS.length, 3);
  assert.deepEqual(CERT_THEME_KEYS, ['navy', 'teal', 'duo']);
  assert.ok(CERT_TEMPLATES.every((t) => t.key && t.label));
  assert.ok(CERT_THEMES.every((t) => t.key && t.label));
});

test('the 4 dark models are retired', () => {
  for (const k of ['aurora', 'plate', 'holo', 'eclipse']) assert.ok(!isTemplate(k), k + ' retired');
});

test('isTemplate / isTheme guard the known keys', () => {
  assert.ok(isTemplate('vetor'));
  assert.ok(isTemplate('mono'));
  assert.ok(!isTemplate('nope'));
  assert.ok(isTheme('duo'));
  assert.ok(!isTheme('pink'));
});

test('buildCertData composes cert + meta + origin', () => {
  assert.equal(d.holder, 'Marina Andrade Conrado');
  assert.equal(d.code, 'AB3HNQ4VXY');
  assert.equal(d.instructor, 'Élder Prudente Barbosa Filho'); // from default meta
  assert.equal(d.client, 'VNC Advocacia');
  assert.match(d.date, /agosto de 2026/); // issued_on formatted to long PT date
  assert.match(d.validar, /trilha\/validar/);
  assert.equal(d.validarUrl, 'https://pensoia.com/trilha/validar/AB3HNQ4VXY'); // raw, for the QR
  assert.equal(d.modules.length, 2);
});

test('every front renders with the holder name, code and a QR slot', () => {
  for (const k of CERT_TEMPLATE_KEYS) {
    const html = renderFront(k, d);
    assert.ok(html.includes('Marina Andrade Conrado'), k + ': holder');
    assert.ok(html.includes('AB3HNQ4VXY'), k + ': code');
    assert.ok(html.includes('data-qr'), k + ': qr placeholder');
    assert.ok(html.includes('data-logo') || html.includes('data-mk') || html.includes('data-pwm'), k + ': a logo/glyph slot');
  }
});

test('renderFront falls back to the first template for an unknown key', () => {
  assert.equal(renderFront('nope', d), renderFront('vetor', d));
});

test('every front uses the institutional EJUSE sentence, no stray "()"', () => {
  for (const k of CERT_TEMPLATE_KEYS) {
    const html = renderFront(k, d);
    assert.ok(html.includes('participou, com frequência e aproveitamento'), k + ': EJUSE phrasing');
    assert.ok(html.includes('Certificamos, para os devidos fins, que'), k + ': institutional lead');
    assert.ok(!html.includes('()'), k + ': no empty parens');
  }
});

test('every front shows the code ONCE, in the unified validation block', () => {
  for (const k of CERT_TEMPLATE_KEYS) {
    const html = renderFront(k, d);
    assert.ok(html.includes('cert-valblock'), k + ': unified validation block');
    assert.ok(html.includes('Autenticidade verificável'), k + ': validation label');
    assert.equal(html.split('AB3HNQ4VXY').length - 1, 1, k + ': code exactly once on the front');
  }
});

test('no self-referential badge ("autêntico" / "verificado") on any front', () => {
  for (const k of CERT_TEMPLATE_KEYS) {
    const html = renderFront(k, d);
    assert.ok(!/autêntico/i.test(html), k + ': no autêntico');
    assert.ok(!/verificado · pensoIA/i.test(html), k + ': no verificado badge');
  }
});

test('back renders the course, every module title, and the code', () => {
  const html = renderBack(d);
  assert.ok(html.includes('IA do Zero ao Entendimento Prático'));
  assert.ok(html.includes('Fundamentos de LLMs'));
  assert.ok(html.includes('Engenharia de Prompt'));
  assert.ok(html.includes('AB3HNQ4VXY'));
  assert.ok(html.includes('data-qr'));
});

test('the code appears only ONCE on the back (in the QR vcard, not the top header)', () => {
  const html = renderBack(d);
  const count = html.split('AB3HNQ4VXY').length - 1;
  assert.equal(count, 1, 'code rendered exactly once on the back');
  assert.ok(!html.includes('class="code"'), 'old top header code block is gone');
  assert.ok(html.includes('class="vcard"'), 'the QR vcard (the one kept) is present');
});

test('renderFrontPage wraps with the scoped page class and the chosen theme', () => {
  const html = renderFrontPage('vetor', 'duo', d);
  assert.ok(html.includes('cdx-cert-page'));
  assert.ok(html.includes('cdxc-sheet'));
  assert.ok(html.includes('f-vetor'));
  assert.ok(html.includes('data-pal="duo"'));
});

test('renderBackPage uses the back sheet and theme', () => {
  const html = renderBackPage('navy', d);
  assert.ok(html.includes('cdxc-sheet back'));
  assert.ok(html.includes('data-pal="navy"'));
});

test('an unknown theme falls back to duo', () => {
  assert.ok(renderFrontPage('vetor', 'pink', d).includes('data-pal="duo"'));
});

test('renderCertificate emits front then back', () => {
  const html = renderCertificate('console', 'teal', d);
  const iFront = html.indexOf('f-console');
  const iBack = html.indexOf('cdxc-sheet back');
  assert.ok(iFront !== -1 && iBack !== -1 && iFront < iBack);
});

test('hoursNumber extracts the bare number from numeric or legacy strings (#20)', () => {
  assert.equal(hoursNumber('40'), '40');
  assert.equal(hoursNumber('40 horas'), '40');
  assert.equal(hoursNumber('40h'), '40');
  assert.equal(hoursNumber('40 h/a'), '40');
  assert.equal(hoursNumber('12,5'), '12,5');
  assert.equal(hoursNumber(''), '');
  assert.equal(hoursNumber(null), '');
});

test('hoursLabel always renders the full word "horas", never "h"/"h/a" (#20)', () => {
  assert.equal(hoursLabel('40'), '40 horas');
  assert.equal(hoursLabel('40 h/a'), '40 horas');
  assert.equal(hoursLabel(''), '');
});

test('the sentence renders "N horas" for both numeric and legacy hours, no doubling (#20)', () => {
  for (const h of ['12', '12 horas', '12h']) {
    const dx = buildCertData(Object.assign({}, cert, { hours: h }), meta, 'https://pensoia.com');
    const html = renderFront('vetor', dx);
    assert.ok(html.includes('carga horária total de <b>12 horas</b>'), 'hours=' + h + ': "12 horas"');
    assert.ok(!html.includes('12 horas horas'), 'hours=' + h + ': no doubled "horas"');
    assert.ok(!html.includes('12h<'), 'hours=' + h + ': not bare "12h"');
  }
});

test('a signed cert shows the "assinado digitalmente" note with the CN (#21)', () => {
  const ds = buildCertData(Object.assign({}, cert, { status: 'signed', signer_cn: 'ELDER P B FILHO:123' }), meta, 'https://pensoia.com');
  for (const k of CERT_TEMPLATE_KEYS) {
    const html = renderFront(k, ds);
    assert.ok(html.includes('Certificado assinado digitalmente'), k + ': signed note');
    assert.ok(html.includes('ELDER P B FILHO:123'), k + ': signer CN');
    assert.ok(html.includes('ICP-Brasil'), k + ': ICP-Brasil qualifier');
  }
});

test('a signed cert with no CN still shows the ICP-Brasil note (#21)', () => {
  const ds = buildCertData(Object.assign({}, cert, { status: 'signed' }), meta, 'https://pensoia.com');
  const html = renderFront('vetor', ds);
  assert.ok(html.includes('Certificado assinado digitalmente · ICP-Brasil'));
});

test('an unsigned cert has no signed note (#21)', () => {
  const html = renderFront('vetor', d); // base cert has no status
  assert.ok(!html.includes('assinado digitalmente'), 'no signed note when not signed');
});

test('the BACK also carries the signed note when signed, and the code stays once (#21/2a)', () => {
  const ds = buildCertData(Object.assign({}, cert, { status: 'signed', signer_cn: 'FULANO:1' }), meta, 'https://pensoia.com');
  const back = renderBack(ds);
  assert.ok(back.includes('Certificado assinado digitalmente'), 'back shows the signed note');
  assert.ok(back.includes('FULANO:1'), 'back shows the CN');
  // the signed note must not duplicate the code
  assert.equal(back.split('AB3HNQ4VXY').length - 1, 1, 'code still appears exactly once on the back');
  // unsigned back has no note
  assert.ok(!renderBack(d).includes('assinado digitalmente'), 'no note on an unsigned back');
});

test('data is HTML-escaped (no injection through the holder name)', () => {
  const d2 = buildCertData(Object.assign({}, cert, { holder_name: 'A <script>x</script> B' }), meta, 'https://pensoia.com');
  const html = renderFront('vetor', d2);
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});
