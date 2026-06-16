// cert-redesign mock builder. Reuses the REAL cert hydrate (logo + ghost P + QR)
// and the real cert-render.css look; applies the agreed redesign: one institutional
// EJUSE-register sentence, one unified validation block, name auto-fit, the P kept
// as-is, only the 3 surviving light models (vetor / console / mono).
import { hydrate } from '/codex/certificates/cert-render.js';
import { generateQrSvg } from '/codex/certificates/vendor/qr.js';

const D = {
  holder: 'Élder Prudente Barbosa Filho',
  course: 'Formação de Formadores · Nível 1, Módulo 2',
  periodo: '23 de fevereiro a 27 de março de 2026',
  hours: '40 h/a',
  instructor: 'Gabriel Henrique Collaço e Simone Cuber Araujo Pinto',
  emissor: 'EPBF Soluções em Tecnologia',
  date: '27 de março de 2026',
  code: 'PENSO7K2M9X',
  place: 'Aracaju · SE',
  client: 'Escola Judicial de Sergipe',
  modality: 'Presencial',
  meetings: '6',
  validar: 'pensoia.com/validar',
  qrUrl: 'https://pensoia.com/validar/PENSO7K2M9X',
  modules: [
    { n: 'I',   t: 'Fundamentos da formação', d: 'Andragogia e desenho de aula.' },
    { n: 'II',  t: 'Práticas de facilitação',  d: 'Condução de turma e avaliação.' },
    { n: 'III', t: 'Avaliação de aprendizagem', d: 'Instrumentos e feedback.' },
    { n: 'IV',  t: 'Laboratório',              d: 'Microaulas com devolutiva.' },
  ],
};

// The one canonical certifying sentence (EJUSE institutional register).
function sentence(d) {
  return 'participou, com frequência e aproveitamento, do curso <b>' + d.course +
    '</b>, realizado no período de <b>' + d.periodo + '</b>, com carga horária total de <b>' +
    d.hours + '</b>, ministrado por <b>' + d.instructor + '</b>.';
}

// One unified validation block. variant: 'card' (bordered corner card) | 'strip'
// (full-width footer rule) | 'plain' (no card chrome).
function valblock(variant) {
  const cls = variant === 'card' ? 'cert-val-card' : variant === 'strip' ? 'cert-val-strip' : '';
  return '<div class="cert-valblock ' + cls + '">' +
    '<span class="cert-val-qr qr" data-qr></span>' +
    '<div class="cert-val-tx">' +
      '<div class="cert-val-label">Autenticidade verificável</div>' +
      '<div class="cert-val-url">' + D.validar + '</div>' +
      '<div class="cert-val-code">' + D.code + '</div>' +
    '</div></div>';
}

// ── Fronts (markup mirrors cert-render.js, with the sentence + valblock swapped) ──
function vetorFront(d, valVariant) {
  const foot = valVariant === 'strip'
    ? '<div class="vt-foot"><div class="meta">Emissor · <b>' + d.emissor + '</b><br>Instrutor · <b>' + d.instructor + '</b><br>Emissão · <b>' + d.date + '</b></div></div>'
      + valblock('strip')
    : '<div class="vt-foot"><div class="meta">Emissor · <b>' + d.emissor + '</b><br>Instrutor · <b>' + d.instructor + '</b><br>Emissão · <b>' + d.date + '</b></div>'
      + valblock('card') + '</div>';
  return '<div class="cdxc-sheet f-vetor">'
    + '<div class="vt-grid"></div><div class="vt-slab"><div class="dots"></div></div>'
    + '<div class="vt-ghost" data-mk></div>'
    + '<div class="vt-content">'
      // Code shown ONCE (in the validation block below); the top tag carries only
      // the issuing context, no second code.
      + '<div class="vt-top"><span class="bmark" data-logo="light"></span>'
        + '<div class="vt-tag">' + d.client + '<br>' + d.place + '</div></div>'
      + '<div class="vt-mid">'
        + '<div class="eyebrow">Certificado de Participação</div>'
        + '<div class="lead">Certificamos, para os devidos fins, que</div>'
        + '<h1 class="name">' + d.holder + '</h1>'
        + '<div class="gbar"></div>'
        + '<p class="stmt">' + sentence(d) + '</p>'
      + '</div>'
      + foot
    + '</div></div>';
}

function consoleFront(d) {
  return '<div class="cdxc-sheet f-console">'
    + '<div class="cs-grid"></div><div class="cs-rail"></div><div class="cs-ghost" data-mk></div>'
    + '<div class="cs-wrap">'
      + '<div class="cs-top"><span class="bmark" data-logo="light"></span></div>'  // removed the "verificado" badge
      + '<div class="cs-mid">'
        + '<div class="kicker">Certificado de Participação · <b>' + d.client + '</b></div>'
        + '<div class="lead">Certificamos, para os devidos fins, que</div>'
        + '<h1 class="name">' + d.holder + '</h1>'
        + '<div class="gbar"></div>'
        + '<p class="stmt">' + sentence(d) + '</p>'
      + '</div>'
      + '<div class="cs-foot">'
        + '<div class="cs-fields">'
          + '<div class="fld"><div class="k">Emissor</div><div class="v">' + d.emissor + '</div></div>'
          + '<div class="fld"><div class="k">Carga horária</div><div class="v">' + d.hours + '</div></div>'
          + '<div class="fld"><div class="k">Modalidade</div><div class="v">' + d.modality + '</div></div>'
          + '<div class="fld"><div class="k">Período</div><div class="v">' + d.periodo + '</div></div>'
          + '<div class="fld"><div class="k">Local</div><div class="v">' + d.place + '</div></div>'
          + '<div class="fld"><div class="k">Emissão</div><div class="v">' + d.date + '</div></div>'
        + '</div>'
        + valblock('card')
      + '</div>'
    + '</div></div>';
}

function monoFront(d) {
  return '<div class="cdxc-sheet f-mono">'
    + '<div class="frame"></div><span class="glyph-wm wm" data-wm="light"></span>'
    + '<div class="inner">'
      // Code shown ONCE (in the validation block below); the top ref carries the
      // place, not a second code.
      + '<div class="m-top"><span class="bmark" data-logo="light"></span>'
        + '<div class="ref"><span class="sc">Local</span><div class="no">' + d.place + '</div></div></div>'
      + '<div class="m-body">'
        + '<div class="m-eyebrow">Certificado de Participação</div>'
        + '<div class="m-orn"><span>certificamos, para os devidos fins, que</span></div>'
        + '<h1 class="m-name">' + d.holder + '</h1>'
        + '<p class="m-stmt">' + sentence(d) + '</p>'
      + '</div>'
      + '<div class="m-foot">'
        + '<div class="ft"><span class="sc">Emissão</span><div class="vv">' + d.date + '</div></div>'
        + '<div class="sig"><div class="sg">Élder B. Filho</div><div class="ln"></div><div class="ft"><span class="sc" style="margin-bottom:3px">Instrutor responsável</span><div class="vv" style="font-size:13px">' + d.instructor + '</div></div></div>'
        + valblock('plain')
      + '</div>'
    + '</div></div>';
}

// ── Shared back (current verso: single code, Modalidade label-first) ──
function back(d) {
  const mods = d.modules.map((m) => '<div class="ci"><div class="n">' + m.n + '</div><div><h4>' + m.t + '</h4><p>' + m.d + '</p></div></div>').join('');
  return '<div class="cdxc-sheet back">'
    + '<div class="bhead">'
      + '<div class="ht"><div class="kicker">Conteúdo Programático</div><h2 class="title">' + d.course + '.</h2></div>'
      + '<div class="hc"><span class="bmark" data-logo="light"></span></div>'
    + '</div><div class="rule"></div>'
    + '<div class="bcols"><div class="curriculum">' + mods + '</div>'
      + '<div class="side"><div class="cargo">'
        + '<div class="s"><div class="v">40</div><div class="l">Horas</div></div>'
        + '<div class="s"><div class="v">' + d.meetings + '</div><div class="l">Encontros</div></div>'
        + '<div class="s cm"><div class="l">Modalidade</div><div class="v sm">' + d.modality + '</div></div></div>'
        + '<div class="mblk"><div class="ml">Emissor</div><div class="mv">EPBF Soluções em Tecnologia Ltda<small>CNPJ 65.254.064/0001-64</small></div></div>'
        + '<div class="mblk"><div class="ml">Instrutor responsável</div><div class="mv">' + d.instructor + '</div></div>'
        + '<div class="mblk"><div class="ml">Data e local de emissão</div><div class="mv">' + d.date + '<small>' + d.place + '</small></div></div>'
        + '<div class="vcard"><span class="qr" data-qr></span><div class="tx"><div class="b">Autenticidade verificável</div>'
          + '<p>Código <span class="c">' + d.code + '</span> em ' + d.validar + '</p></div></div>'
      + '</div></div>'
    + '<div class="pfoot"><span>pensoIA · Certificado de Participação</span><span>' + d.client + '</span></div>';
}

// Name auto-fit: shrink the font until the name fits in <= maxLines lines and
// never overflows its width (long Brazilian names won't orphan a word).
function autofit(el, maxLines) {
  if (!el) return;
  let size = parseFloat(getComputedStyle(el).fontSize);
  const lh = parseFloat(getComputedStyle(el).lineHeight) || size * 1.05;
  let guard = 60;
  while (guard-- > 0 && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > lh * maxLines + 2)) {
    size -= 1.5;
    if (size < 24) break;
    el.style.fontSize = size + 'px';
  }
}

const FRONTS = {
  vetor:   (d, v) => vetorFront(d, v),
  console: (d) => consoleFront(d),
  mono:    (d) => monoFront(d),
};

export async function mountCert(stage, opts) {
  opts = opts || {};
  const tpl = opts.template || 'vetor';
  const front = FRONTS[tpl](D, opts.val || 'card');
  for (const sheetHtml of [front, back(D)]) {
    const wrap = document.createElement('div');
    wrap.className = 'cm-pagewrap';
    const page = document.createElement('div');
    page.className = 'cdx-cert-page';
    page.setAttribute('data-pal', 'duo');
    page.innerHTML = sheetHtml;
    wrap.appendChild(page);
    stage.appendChild(wrap);
    hydrate(page, { qr: generateQrSvg, qrUrl: D.qrUrl });
    // wait for fonts so autofit measures real glyph widths
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (_) {} }
    autofit(page.querySelector('.name, .m-name'), 2);
    // scale the natural-size sheet to fit the column width
    const SHEET_W = 297 * 96 / 25.4, SHEET_H = 210 * 96 / 25.4;
    const avail = Math.min(stage.clientWidth - 28, 1180);
    const scale = avail / SHEET_W;
    page.style.transformOrigin = 'top left';
    page.style.transform = 'scale(' + scale + ')';
    wrap.style.width = (SHEET_W * scale) + 'px';
    wrap.style.height = (SHEET_H * scale) + 'px';
  }
}
