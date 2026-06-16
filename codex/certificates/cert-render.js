// certificates/cert-render.js
// Certificate renderer: the 7 fixed FRONT templates + 1 shared BACK (verso),
// ported from the approved mocks (backstage/mocks/certificate/*). The render
// functions are PURE (data in, HTML string out) and emit placeholders for the
// brand logo and the QR code, so they unit-test under node --test with zero
// dependencies. hydrate() (browser only) fills those placeholders using the
// Codex brand-logos module + a QR renderer the caller injects.
//
// The visual layer lives in certificates/cert-render.css, scoped under
// .cdx-cert-page so it never leaks into the rest of Codex.
import { stdColors, mark, glyphWordmarkTag } from '../js/brand-logos.js';

// Pure, dependency-free HTML escaper (kept local so the render path has no DOM
// coupling and stays testable in node).
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// ── Registries ────────────────────────────────────────────────────────────────
export const CERT_TEMPLATES = [
  { key: 'vetor',   label: 'Vetor' },
  { key: 'console', label: 'Console' },
  { key: 'mono',    label: 'Monograma' },
  { key: 'aurora',  label: 'Aurora' },
  { key: 'plate',   label: 'Folha' },
  { key: 'holo',    label: 'Holograma' },
  { key: 'eclipse', label: 'Eclipse' },
];
export const CERT_TEMPLATE_KEYS = CERT_TEMPLATES.map(function (t) { return t.key; });

export const CERT_THEMES = [
  { key: 'navy', label: 'Navy' },
  { key: 'teal', label: 'Teal' },
  { key: 'duo',  label: 'Duo' },
];
export const CERT_THEME_KEYS = CERT_THEMES.map(function (t) { return t.key; });

const DEFAULT_TEMPLATE = 'vetor';
const DEFAULT_THEME = 'duo';

export function isTemplate(k) { return CERT_TEMPLATE_KEYS.indexOf(k) !== -1; }
export function isTheme(k) { return CERT_THEME_KEYS.indexOf(k) !== -1; }

// ── Data model ────────────────────────────────────────────────────────────────
// defaultMeta() = the course-level fields the back needs (and a couple the front
// uses). These are snapshot at issue time; sensible PensoIA defaults pre-fill.
export function defaultMeta() {
  return {
    issuer: 'EPBF Soluções em Tecnologia Ltda',
    issuerShort: 'EPBF Soluções em Tecnologia',
    cnpj: '65.254.064/0001-64',
    instructor: 'Élder Prudente Barbosa Filho',
    role: 'Instrutor responsável',
    place: '',
    client: '',
    format: '',
    modality: 'Presencial',
    meetings: '',
    modules: [],
  };
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
function fmtDate(iso) {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  if (!m) return String(iso);
  return String(Number(m[3])) + ' de ' + MESES[Number(m[2]) - 1] + ' de ' + m[1];
}
function hostOf(origin) { return String(origin || '').replace(/^https?:\/\//, '').replace(/\/$/, ''); }

// buildCertData(cert, meta, origin) -> the escaped `d` object the render
// functions consume. cert = the saved certificate record (snapshot fields);
// meta = course-level metadata (merged over defaults); origin = location.origin.
export function buildCertData(cert, meta, origin) {
  cert = cert || {};
  meta = Object.assign(defaultMeta(), meta || {});
  const code = cert.code || '';
  const host = hostOf(origin) || 'pensoia.com';
  const base = (origin ? String(origin).replace(/\/$/, '') : 'https://pensoia.com');
  return {
    holder: esc(cert.holder_name),
    course: esc(cert.course_title),
    hours: esc(cert.hours || ''),
    date: esc(fmtDate(cert.issued_on)),
    code: esc(code),
    validar: esc(host + '/trilha/validar'),
    validarUrl: base + '/trilha/validar/' + code, // raw, used as the QR payload
    issuer: esc(cert.issuer || meta.issuer),
    issuerShort: esc(meta.issuerShort),
    cnpj: esc(meta.cnpj),
    instructor: esc(meta.instructor),
    role: esc(meta.role),
    place: esc(meta.place),
    client: esc(meta.client),
    format: esc(meta.format),
    modality: esc(meta.modality),
    meetings: esc(meta.meetings),
    modules: (meta.modules || []).map(function (m) { return { n: esc(m.n), t: esc(m.t), d: esc(m.d) }; }),
  };
}

// ── FRONTS (pure HTML, brand logo + QR as placeholders) ───────────────────────

function fVetor(d) {
  return '<div class="vt-grid"></div>'
    + '<div class="vt-slab"><div class="dots"></div></div>'
    + '<div class="vt-ghost" data-mk></div>'
    + '<div class="vt-content">'
      + '<div class="vt-top"><span class="bmark" data-logo="light"></span>'
        + '<div class="vt-tag">Certificado · Nº ' + d.code + '<br>' + d.client + ' · ' + d.place + '</div></div>'
      + '<div class="vt-mid">'
        + '<div class="eyebrow">Certificado de Participação</div>'
        + '<div class="lead">Certificamos que</div>'
        + '<h1 class="name">' + d.holder + '</h1>'
        + '<div class="gbar"></div>'
        + '<p class="stmt">concluiu o curso <b>' + d.course + '</b>, com carga horária de <b>' + d.hours + '</b>, realizado em ' + d.place + '.</p>'
      + '</div>'
      + '<div class="vt-foot">'
        + '<div class="meta">Emissor · <b>' + d.issuerShort + '</b><br>Instrutor · <b>' + d.instructor + '</b><br>Emissão · <b>' + d.date + '</b></div>'
        + '<div class="vt-vchip"><span class="qr" data-qr></span><div class="vx">'
          + '<div class="l">Validação</div><div class="c">' + d.code + '</div><div class="u">' + d.validar + '</div>'
        + '</div></div>'
      + '</div>'
    + '</div>';
}

function fConsole(d) {
  return '<div class="cs-grid"></div><div class="cs-rail"></div>'
    + '<div class="cs-ghost" data-mk></div>'
    + '<div class="cs-wrap">'
      + '<div class="cs-top"><span class="bmark" data-logo="light"></span>'
        + '<div class="cs-status"><span class="d"></span>verificado · pensoIA</div></div>'
      + '<div class="cs-mid">'
        + '<div class="kicker">Certificado de Participação · <b>' + d.client + '</b></div>'
        + '<div class="lead">Certificamos que</div>'
        + '<h1 class="name">' + d.holder + '</h1>'
        + '<div class="gbar"></div>'
        + '<p class="stmt">concluiu o curso <b>' + d.course + '</b>, com carga horária de <b>' + d.hours + '</b>, realizado em ' + d.place + '.</p>'
      + '</div>'
      + '<div class="cs-foot">'
        + '<div class="cs-fields">'
          + '<div class="fld"><div class="k">Emissor</div><div class="v">' + d.issuerShort + '</div></div>'
          + '<div class="fld"><div class="k">Instrutor</div><div class="v">' + d.instructor + '</div></div>'
          + '<div class="fld"><div class="k">Emissão</div><div class="v">' + d.date + '</div></div>'
          + '<div class="fld"><div class="k">Carga horária</div><div class="v">' + d.hours + '</div></div>'
          + '<div class="fld"><div class="k">Modalidade</div><div class="v">' + d.modality + '</div></div>'
          + '<div class="fld"><div class="k">Local</div><div class="v">' + d.place + '</div></div>'
        + '</div>'
        + '<div class="cs-block">'
          + '<div class="bb"><i></i><i></i><i></i><span>validação</span></div>'
          + '<div class="bd"><span class="qr" data-qr></span><div class="tx">'
            + '<div class="row">scan · <b>QR</b></div>'
            + '<div class="row">' + d.validar + '</div>'
            + '<div class="code">' + d.code + '</div>'
          + '</div></div>'
        + '</div>'
      + '</div>'
    + '</div>';
}

function fMono(d) {
  return '<div class="frame"></div>'
    + '<span class="glyph-wm wm" data-wm="light"></span>'
    + '<div class="inner">'
      + '<div class="m-top"><span class="bmark" data-logo="light"></span>'
        + '<div class="ref"><span class="sc">Certificado n.º</span><div class="no">' + d.code + '</div></div></div>'
      + '<div class="m-body">'
        + '<div class="m-eyebrow">Certificado de Participação</div>'
        + '<div class="m-orn"><span>certificamos que</span></div>'
        + '<h1 class="m-name">' + d.holder + '</h1>'
        + '<p class="m-stmt">concluiu, com aproveitamento, o curso <b>' + d.course + '</b>, com carga horária de ' + d.hours + ', realizado em ' + d.place + '.</p>'
      + '</div>'
      + '<div class="m-foot">'
        + '<div class="ft"><span class="sc">Emissão</span><div class="vv">' + d.date + '</div></div>'
        + '<div class="sig"><div class="sg">Élder B. Filho</div><div class="ln"></div><div class="ft"><span class="sc" style="margin-bottom:3px">Instrutor responsável</span><div class="vv" style="font-size:13px">' + d.instructor + '</div></div></div>'
        + '<div class="val"><span class="qr" data-qr></span><div class="vt"><span class="c">' + d.code + '</span><br>' + d.validar + '</div></div>'
      + '</div>'
    + '</div>';
}

function fAurora(d) {
  return '<div class="au-orb o1"></div><div class="au-orb o2"></div>'
    + '<div class="au-spot"></div>'
    + '<div class="au-ghost" data-mk></div>'
    + '<div class="au-top"><span class="bmark" data-logo="grad"></span></div>'
    + '<div class="au-body">'
      + '<div class="eyebrow">Certificado de Participação</div>'
      + '<div class="lead">Certificamos que</div>'
      + '<h1 class="name">' + d.holder + '</h1>'
      + '<p class="stmt">concluiu o curso <b>' + d.course + '</b>, com carga horária de <b>' + d.hours + '</b>' + (d.format ? ' (' + d.format + ')' : '') + ', realizado em ' + d.place + '.</p>'
    + '</div>'
    + '<dl class="au-foot">'
      + '<div><dt>Emissão</dt><dd>' + d.date + '</dd></div>'
      + '<div><dt>Emissor</dt><dd>' + d.issuerShort + '</dd></div>'
      + '<div class="au-vglass"><span class="qr" data-qr></span><div class="vx">'
        + '<div class="l">Validação</div><div class="c">' + d.code + '</div><div class="u">' + d.validar + '</div>'
      + '</div></div>'
    + '</dl>';
}

function fPlate(d) {
  return '<div class="dots"></div><div class="pl-border"></div>'
    + '<span class="pl-corner tl"></span><span class="pl-corner tr"></span><span class="pl-corner bl"></span><span class="pl-corner br"></span>'
    + '<span class="glyph-wm wm" data-wm="grad"></span>'
    + '<div class="pl-in">'
      + '<div class="pl-top"><span class="bmark" data-logo="grad"></span>'
        + '<div class="ref"><span class="sc">Certificado n.º</span><div class="no">' + d.code + '</div></div></div>'
      + '<div class="pl-body">'
        + '<div class="pl-eyebrow">Certificado de Participação</div>'
        + '<div class="pl-lead">certificamos que</div>'
        + '<h1 class="pl-name">' + d.holder + '</h1>'
        + '<div class="pl-flourish"><span class="d"></span></div>'
        + '<p class="pl-stmt">concluiu o curso <b>' + d.course + '</b>, com carga horária de <b>' + d.hours + '</b>, realizado em ' + d.place + '.</p>'
      + '</div>'
      + '<div class="pl-foot">'
        + '<div class="ft"><span class="sc">Emissão</span><div class="vv">' + d.date + '<br>' + d.issuerShort + '</div></div>'
        + '<div class="seal"><span class="qr" data-qr></span><div class="c">' + d.code + '</div><div class="u">' + d.validar + '</div></div>'
        + '<div class="ft r"><div class="sg">Élder B. Filho</div><span class="sc">' + d.role + '</span><div class="vv" style="font-size:13px">' + d.instructor + '</div></div>'
      + '</div>'
    + '</div>';
}

function fHolo(d) {
  return '<div class="ho-orb"></div>'
    + '<div class="ho-ghost" data-mk></div>'
    + '<div class="ho-card"><div class="dots"></div>'
      + '<div class="ho-top"><span class="bmark" data-logo="grad"></span>'
        + '<div class="ho-id">Certificado Nº <b>' + d.code + '</b><br>' + d.client + ' · ' + d.place + '</div></div>'
      + '<div class="ho-body">'
        + '<div class="eyebrow">Certificado de Participação</div>'
        + '<div class="lead">Certificamos que</div>'
        + '<h1 class="name">' + d.holder + '</h1>'
        + '<div class="gbar"></div>'
        + '<p class="stmt">concluiu o curso <b>' + d.course + '</b>, com carga horária de <b>' + d.hours + '</b>' + (d.format ? ' (' + d.format + ')' : '') + ', realizado em ' + d.place + '.</p>'
      + '</div>'
      + '<div class="ho-foot">'
        + '<div class="meta">Emissor · <b>' + d.issuerShort + '</b><br>Instrutor · <b>' + d.instructor + '</b><br>Emissão · <b>' + d.date + '</b></div>'
        + '<div class="ho-vring"><div class="qwrap"><span class="qr" data-qr></span></div><div class="vx">'
          + '<div class="l">Validação</div><div class="c">' + d.code + '</div><div class="u">' + d.validar + '</div>'
        + '</div></div>'
      + '</div>'
    + '</div>';
}

function fEclipse(d) {
  return '<div class="dots"></div><div class="glow"></div>'
    + '<span class="pwm pwm-big" data-pwm></span>'
    + '<div class="ec-wrap">'
      + '<div class="ec-top"><span class="bmark" data-logo="grad"></span>'
        + '<div class="ec-tag">Certificado de Participação<br><b>Nº ' + d.code + '</b></div></div>'
      + '<div class="ec-mid">'
        + '<div class="eyebrow">Certificado de Participação</div>'
        + '<div class="lead">Certificamos que</div>'
        + '<h1 class="name">' + d.holder + '</h1>'
        + '<p class="sub">concluiu o curso <b>' + d.course + '</b>, com carga horária de <b>' + d.hours + '</b>, realizado em ' + d.place + '.</p>'
      + '</div>'
      + '<dl class="ec-foot">'
        + '<div><dt>Emissão</dt><dd>' + d.date + '</dd></div>'
        + '<div><dt>Emissor</dt><dd>' + d.issuerShort + '</dd></div>'
        + '<div class="ec-val"><span class="qr" data-qr></span>'
          + '<span class="vc">' + d.code + '<small>' + d.validar + '</small></span></div>'
      + '</dl>'
    + '</div>';
}

const FRONTS = {
  vetor: fVetor, console: fConsole, mono: fMono, aurora: fAurora,
  plate: fPlate, holo: fHolo, eclipse: fEclipse,
};

// ── BACK (shared verso) ───────────────────────────────────────────────────────
function backHtml(d) {
  const mods = d.modules.map(function (m) {
    return '<div class="ci"><div class="n">' + m.n + '</div><div><h4>' + m.t + '</h4><p>' + m.d + '</p></div></div>';
  }).join('');
  // The code appears once on the back, in the QR vcard at the bottom. The old
  // top "Código …" line next to the logo was a duplicate — removed.
  return '<div class="bhead">'
      + '<div class="ht"><div class="kicker">Conteúdo Programático</div><h2 class="title">' + d.course + '.</h2></div>'
      + '<div class="hc"><span class="bmark" data-logo="light"></span></div>'
    + '</div><div class="rule"></div>'
    + '<div class="bcols"><div class="curriculum">' + mods + '</div>'
      + '<div class="side"><div class="cargo">'
        + '<div class="s"><div class="v">' + (d.hours || '').replace(' horas', '') + '</div><div class="l">Horas</div></div>'
        + '<div class="s"><div class="v">' + d.meetings + '</div><div class="l">Encontros</div></div>'
        // Modalidade reads label-first ("Modalidade / Presencial") since the value is a
        // word, not a metric like Horas/Encontros (which keep value-first).
        + '<div class="s cm"><div class="l">Modalidade</div><div class="v sm">' + d.modality + '</div></div></div>'
        + '<div class="mblk"><div class="ml">Emissor</div><div class="mv">' + d.issuer + '<small>CNPJ ' + d.cnpj + '</small></div></div>'
        + '<div class="mblk"><div class="ml">Instrutor responsável</div><div class="mv">' + d.instructor + '<small>' + d.format + '</small></div></div>'
        + '<div class="mblk"><div class="ml">Data e local de emissão</div><div class="mv">' + d.date + '<small>' + d.place + '</small></div></div>'
        + '<div class="vcard"><span class="qr" data-qr></span><div class="tx"><div class="b">Autenticidade verificável</div>'
          + '<p>Código <span class="c">' + d.code + '</span> em ' + d.validar + '</p></div></div>'
      + '</div></div>'
    + '<div class="pfoot"><span>pensoIA · Certificado de Participação</span><span>' + d.client + '</span></div>';
}

// ── Public render API ─────────────────────────────────────────────────────────
function frontKey(k) { return isTemplate(k) ? k : DEFAULT_TEMPLATE; }
function themeKey(t) { return isTheme(t) ? t : DEFAULT_THEME; }

export function renderFront(templateKey, d) { return (FRONTS[templateKey] || FRONTS[DEFAULT_TEMPLATE])(d); }
export function renderBack(d) { return backHtml(d); }

// A "page" is one A4 sheet wrapped so all certificate CSS stays scoped under
// .cdx-cert-page; the colour theme rides on data-pal, the layout on .f-<key>.
export function renderFrontPage(templateKey, theme, d) {
  const k = frontKey(templateKey);
  return '<div class="cdx-cert-page" data-pal="' + themeKey(theme) + '">'
    + '<div class="cdxc-sheet f-' + k + '">' + renderFront(k, d) + '</div></div>';
}
export function renderBackPage(theme, d) {
  return '<div class="cdx-cert-page" data-pal="' + themeKey(theme) + '">'
    + '<div class="cdxc-sheet back">' + renderBack(d) + '</div></div>';
}
export function renderCertificate(templateKey, theme, d) {
  return renderFrontPage(templateKey, theme, d) + renderBackPage(theme, d);
}

// ── hydrate (browser only) ────────────────────────────────────────────────────
// Fills the logo/glyph/QR placeholders left by the render functions. Uses the
// Codex brand-logos module (mark/glyphWordmarkTag/stdColors, imported above)
// and a QR renderer injected by the caller
// (opts.qr: (url) => svgString, e.g. generateQrSvg from ./vendor/qr.js).
export function hydrate(rootEl, opts) {
  opts = opts || {};
  const qr = opts.qr;
  const qrUrl = opts.qrUrl || '';
  if (!rootEl || typeof rootEl.querySelectorAll !== 'function') return;
  const pick = function (where) { return stdColors(where === 'grad' ? 'teal' : 'white'); };
  rootEl.querySelectorAll('[data-logo]').forEach(function (el) { el.innerHTML = glyphWordmarkTag(pick(el.getAttribute('data-logo'))); });
  rootEl.querySelectorAll('[data-mark]').forEach(function (el) { el.innerHTML = mark(pick(el.getAttribute('data-mark'))); });
  rootEl.querySelectorAll('[data-mk]').forEach(function (el) { el.innerHTML = mark(stdColors('teal')); });
  rootEl.querySelectorAll('[data-wm]').forEach(function (el) { el.innerHTML = mark(pick(el.getAttribute('data-wm'))); });
  rootEl.querySelectorAll('[data-pwm]').forEach(function (el) { el.innerHTML = mark(stdColors('teal')); });
  if (typeof qr === 'function') {
    rootEl.querySelectorAll('[data-qr]').forEach(function (el) { el.innerHTML = qr(qrUrl); });
  }
}
