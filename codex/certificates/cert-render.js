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
// The 3 surviving LIGHT models. The 4 dark full-bleed ones (aurora/plate/holo/
// eclipse) were retired: they read as marketing and print badly on office lasers.
export const CERT_TEMPLATES = [
  { key: 'vetor',   label: 'Vetor' },
  { key: 'console', label: 'Console' },
  { key: 'mono',    label: 'Monograma' },
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
    format: 'Presencial',
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

// Extract the numeric carga horária from a stored value. The field is captured
// as a plain number now, but legacy certs stored strings like "40 horas", "40h"
// or "40 h/a"; pull the leading number so both render uniformly. '' when absent.
export function hoursNumber(raw) {
  if (raw == null) return '';
  const m = /(\d+(?:[.,]\d+)?)/.exec(String(raw));
  return m ? m[1] : '';
}
// The full human label: "40 horas" (always the word, never "h"/"h/a"). '' when
// there is no number to show.
export function hoursLabel(raw) {
  const n = hoursNumber(raw);
  return n ? n + ' horas' : '';
}

// buildCertData(cert, meta, origin) -> the escaped `d` object the render
// functions consume. cert = the saved certificate record (snapshot fields);
// meta = course-level metadata (merged over defaults); origin = location.origin.
export function buildCertData(cert, meta, origin) {
  cert = cert || {};
  meta = Object.assign(defaultMeta(), meta || {});
  const code = cert.code || '';
  const host = hostOf(origin) || 'pensoia.com';
  const base = (origin ? String(origin).replace(/\/$/, '') : 'https://pensoia.com');
  // Course period (snapshotted from the turma start/end dates) for the certifying
  // sentence: "realizado no período de <start> a <end>". Falls back gracefully.
  const periodo = (meta.course_start && meta.course_end)
    ? fmtDate(meta.course_start) + ' a ' + fmtDate(meta.course_end)
    : (meta.course_start ? fmtDate(meta.course_start) : '');
  const hNum = hoursNumber(cert.hours);
  return {
    holder: esc(cert.holder_name),
    course: esc(cert.course_title),
    hours: esc(cert.hours || ''),     // raw snapshot (back-compat; not rendered directly)
    hoursNum: esc(hNum),              // just the number, for metric boxes
    hoursLabel: hNum ? esc(hNum + ' horas') : '', // "40 horas" for the sentence
    // A signed cert (status 'signed') gets a "assinado digitalmente" note on the
    // front; the CN is shown when the signer recorded it. The on-screen note is
    // informational — the cryptographic signature lives in the stored PDF.
    signed: cert.status === 'signed',
    signerCn: esc(cert.signer_cn || cert.signed_by || ''),
    periodo: esc(periodo),
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
    meetings: esc(meta.meetings),
    modules: (meta.modules || []).map(function (m) { return { n: esc(m.n), t: esc(m.t), d: esc(m.d) }; }),
  };
}

// ── FRONTS (pure HTML, brand logo + QR as placeholders) ───────────────────────
// Shared across the 3 models: one institutional lead + certifying sentence (EJUSE
// register), and one unified validation block (no self-referential "verificado/
// autêntico" badges). The code appears ONCE per side (in the validation block).

const CERT_LEAD = 'Certificamos, para os devidos fins, que';

// The single canonical certifying sentence. Clauses drop gracefully when a field
// is missing (period falls back to "realizado em <place>").
function certStatement(d) {
  return 'participou, com frequência e aproveitamento, do curso <b>' + d.course + '</b>'
    + (d.periodo ? ', realizado no período de <b>' + d.periodo + '</b>'
                 : (d.place ? ', realizado em ' + d.place : ''))
    + (d.hoursLabel ? ', com carga horária total de <b>' + d.hoursLabel + '</b>' : '')
    + (d.instructor ? ', ministrado por <b>' + d.instructor + '</b>' : '')
    + '.';
}

// One validation block for every model. variant: 'card' (bordered) | 'plain'.
function valBlock(d, variant) {
  const cls = variant === 'card' ? 'cert-val-card' : '';
  return '<div class="cert-valblock ' + cls + '">'
    + '<span class="cert-val-qr qr" data-qr></span>'
    + '<div class="cert-val-tx">'
      + '<div class="cert-val-label">Autenticidade verificável</div>'
      + '<div class="cert-val-url">' + d.validar + '</div>'
      + '<div class="cert-val-code">' + d.code + '</div>'
      + signedNote(d)
    + '</div></div>';
}

// "Certificado assinado digitalmente …" — only on a signed cert. Names the signer
// CN when the local signer recorded it; otherwise just the ICP-Brasil qualifier.
function signedNote(d) {
  if (!d.signed) return '';
  return '<div class="cert-signed-note">Certificado assinado digitalmente'
    + (d.signerCn ? ' por <b>' + d.signerCn + '</b>' : '')
    + ' · ICP-Brasil</div>';
}

function fVetor(d) {
  return '<div class="vt-grid"></div>'
    + '<div class="vt-slab"><div class="dots"></div></div>'
    + '<div class="vt-ghost" data-mk></div>'
    + '<div class="vt-content">'
      + '<div class="vt-top"><span class="bmark" data-logo="light"></span>'
        + '<div class="vt-tag">' + d.client + '<br>' + d.place + '</div></div>'
      + '<div class="vt-mid">'
        + '<div class="eyebrow">Certificado de Participação</div>'
        + '<div class="lead">' + CERT_LEAD + '</div>'
        + '<h1 class="name">' + d.holder + '</h1>'
        + '<div class="gbar"></div>'
        + '<p class="stmt">' + certStatement(d) + '</p>'
      + '</div>'
      + '<div class="vt-foot">'
        + '<div class="meta">Emissor · <b>' + d.issuerShort + '</b><br>Instrutor · <b>' + d.instructor + '</b><br>Emissão · <b>' + d.date + '</b></div>'
        + valBlock(d, 'card')
      + '</div>'
    + '</div>';
}

function fConsole(d) {
  return '<div class="cs-grid"></div><div class="cs-rail"></div>'
    + '<div class="cs-ghost" data-mk></div>'
    + '<div class="cs-wrap">'
      + '<div class="cs-top"><span class="bmark" data-logo="light"></span></div>'
      + '<div class="cs-mid">'
        + '<div class="kicker">Certificado de Participação · <b>' + d.client + '</b></div>'
        + '<div class="lead">' + CERT_LEAD + '</div>'
        + '<h1 class="name">' + d.holder + '</h1>'
        + '<div class="gbar"></div>'
        + '<p class="stmt">' + certStatement(d) + '</p>'
      + '</div>'
      + '<div class="cs-foot">'
        + '<div class="cs-fields">'
          + '<div class="fld"><div class="k">Emissor</div><div class="v">' + d.issuerShort + '</div></div>'
          + '<div class="fld"><div class="k">Carga horária</div><div class="v">' + d.hoursLabel + '</div></div>'
          + '<div class="fld"><div class="k">Formato</div><div class="v">' + d.format + '</div></div>'
          + '<div class="fld"><div class="k">Período</div><div class="v">' + (d.periodo || d.date) + '</div></div>'
          + '<div class="fld"><div class="k">Local</div><div class="v">' + d.place + '</div></div>'
          + '<div class="fld"><div class="k">Emissão</div><div class="v">' + d.date + '</div></div>'
        + '</div>'
        + valBlock(d, 'card')
      + '</div>'
    + '</div>';
}

function fMono(d) {
  return '<div class="frame"></div>'
    + '<span class="glyph-wm wm" data-wm="light"></span>'
    + '<div class="inner">'
      + '<div class="m-top"><span class="bmark" data-logo="light"></span>'
        + '<div class="ref"><span class="sc">Local</span><div class="no">' + d.place + '</div></div></div>'
      + '<div class="m-body">'
        + '<div class="m-eyebrow">Certificado de Participação</div>'
        + '<div class="m-orn"><span>' + CERT_LEAD + '</span></div>'
        + '<h1 class="m-name">' + d.holder + '</h1>'
        + '<p class="m-stmt">' + certStatement(d) + '</p>'
      + '</div>'
      + '<div class="m-foot">'
        + '<div class="ft"><span class="sc">Emissão</span><div class="vv">' + d.date + '</div></div>'
        + '<div class="sig"><div class="sg">Élder B. Filho</div><div class="ln"></div><div class="ft"><span class="sc" style="margin-bottom:3px">Instrutor responsável</span><div class="vv" style="font-size:13px">' + d.instructor + '</div></div></div>'
        + valBlock(d, 'plain')
      + '</div>'
    + '</div>';
}

const FRONTS = {
  vetor: fVetor, console: fConsole, mono: fMono,
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
        + '<div class="s"><div class="v">' + d.hoursNum + '</div><div class="l">Horas</div></div>'
        + '<div class="s"><div class="v">' + d.meetings + '</div><div class="l">Encontros</div></div>'
        // Formato reads label-first ("Formato / Presencial") since the value is a
        // word, not a metric like Horas/Encontros (which keep value-first).
        + '<div class="s cm"><div class="l">Formato</div><div class="v sm">' + d.format + '</div></div></div>'
        + '<div class="mblk"><div class="ml">Emissor</div><div class="mv">' + d.issuer + '<small>CNPJ ' + d.cnpj + '</small></div></div>'
        + '<div class="mblk"><div class="ml">Instrutor responsável</div><div class="mv">' + d.instructor + '</div></div>'
        + '<div class="mblk"><div class="ml">Data e local de emissão</div><div class="mv">' + d.date + '<small>' + d.place + '</small></div></div>'
        + '<div class="vcard"><span class="qr" data-qr></span><div class="tx"><div class="b">Autenticidade verificável</div>'
          + '<p>Código <span class="c">' + d.code + '</span> em ' + d.validar + '</p>'
          + signedNote(d)
        + '</div></div>'
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

// Shrink the recipient name so long Brazilian names stay within their column and
// never orphan a word. Browser-only (needs layout); call after hydrate() once the
// fonts are ready. Idempotent enough to re-run on resize.
export function autofitNames(rootEl) {
  if (!rootEl || typeof rootEl.querySelectorAll !== 'function' || typeof window === 'undefined') return;
  rootEl.querySelectorAll('.name, .m-name').forEach(function (el) {
    const cs = window.getComputedStyle(el);
    let size = parseFloat(cs.fontSize) || 60;
    const lh = parseFloat(cs.lineHeight) || size * 1.05;
    let guard = 60;
    while (guard-- > 0 && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > lh * 2 + 2)) {
      size -= 1.5;
      if (size < 24) break;
      el.style.fontSize = size + 'px';
    }
  });
}

// Scale curriculum font down so it fits inside .bcols without overflowing A4.
// Mirrors autofitNames: browser-only, idempotent, call after hydrate().
export function autofitCurriculum(rootEl) {
  if (!rootEl || typeof rootEl.querySelectorAll !== 'function' || typeof window === 'undefined') return;
  var IDEAL = { n: 22, h4: 14, p: 12.5 };
  var MIN_SCALE = 7 / 12.5; // p=7px minimum legible in print
  rootEl.querySelectorAll('.cdxc-sheet.back').forEach(function (sheet) {
    var curr  = sheet.querySelector('.curriculum');
    var bcols = sheet.querySelector('.bcols');
    if (!curr || !bcols || !bcols.clientHeight) return;
    var scale = 1;
    function apply(s) {
      curr.querySelectorAll('.n').forEach(function (el) { el.style.fontSize = (IDEAL.n  * s) + 'px'; });
      curr.querySelectorAll('h4').forEach(function (el) { el.style.fontSize = (IDEAL.h4 * s) + 'px'; });
      curr.querySelectorAll('p') .forEach(function (el) { el.style.fontSize = (IDEAL.p  * s) + 'px'; });
    }
    apply(1);
    var guard = 60;
    while (guard-- > 0 && curr.scrollHeight > bcols.clientHeight + 1) {
      scale -= 0.02;
      if (scale < MIN_SCALE) { scale = MIN_SCALE; apply(scale); break; }
      apply(scale);
    }
  });
}
