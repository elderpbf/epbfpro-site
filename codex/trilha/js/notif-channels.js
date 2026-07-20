// codex/trilha/js/notif-channels.js
// track-44 — the student's DELIVERY preferences: one grid, categories × channels, telling the
// worker's router (codex-api src/lib/notify.js) which channels may carry which category to this
// person. Server-side, keyed by IDENTITY (ct_students.id), so it follows the person across turmas.
//
// NOT to be confused with its neighbour ./notif-prefs.js, and the confusion is called out by name
// in manifest/architecture/notifications.md §4: notif-prefs.js is the bell's DISPLAY filter
// (localStorage, per TURMA, fórum only — "which forum events raise the bell"); this file is
// DELIVERY ("do I want this in my e-mail / on my phone"). They are different axes and both stay.
//
// Two columns are deliberately not switches:
//   - Sino: the floor. It is how anything reaches the student inside the Trilha at all, and an
//     Acionável with its only surface turned off would be stranded. Élder's model is that the
//     student chooses the EXTRA channels, not whether to be reachable.
//   - Celular: shown but disabled until the push channel exists (track-44 Etapa B). A live switch
//     that silently delivers nothing is worse than one that says "em breve".
import { t } from '../i18n.js';
import { esc } from './utils.js';

// The axes. These MIRROR the worker's src/lib/notify.js (CATEGORIES/CHANNELS + DEFAULT_PREFS):
// a key that exists on one side only is a cell that silently never applies. Pinned in
// tests/trilha-notif-channels.test.mjs.
export const CATEGORIES = [
  { key: 'comunicado',      labelKey: 'nchan.cat_comunicado' },
  { key: 'tarefa_feedback', labelKey: 'nchan.cat_tarefa' },
  { key: 'forum',           labelKey: 'nchan.cat_forum' },
  { key: 'noticia',         labelKey: 'nchan.cat_noticia' },
];

export const CHANNELS = [
  { key: 'bell',  labelKey: 'nchan.ch_bell',  always: true },
  { key: 'email', labelKey: 'nchan.ch_email' },
  { key: 'push',  labelKey: 'nchan.ch_push' },
];

// The worker's defaults, restated so a category the server did not send still renders the value
// the router WILL apply, instead of a blank row. Comunicado reaches by every channel (that is its
// point); system categories start e-mail off (never suddenly spam); notícia is opt-in (LGPD).
export const DEFAULT_PREFS = {
  comunicado:      { bell: true, email: true,  push: true  },
  noticia:         { bell: true, email: false, push: false },
  tarefa_feedback: { bell: true, email: false, push: false },
  forum:           { bell: true, email: false, push: false },
};

function _defaults(category) {
  return { ...(DEFAULT_PREFS[category] || { bell: true, email: false, push: false }) };
}

// PURE. The grid to render: one row per category, one cell per channel, each carrying whether it
// is on and whether it can be touched. `opts.pushAvailable` is Etapa B's seam — flipping it true
// is all the push wiring needs from this module.
export function gridRows(prefs, opts) {
  const o = opts || {};
  const p = prefs || {};
  return CATEGORIES.map((cat) => {
    const row = { ...(_defaults(cat.key)), ...(p[cat.key] || {}) };
    return {
      key: cat.key,
      label: t(cat.labelKey),
      cells: CHANNELS.map((ch) => ({
        channel: ch.key,
        enabled: !!row[ch.key],
        // The bell is always the floor; push waits for Etapa B.
        disabled: !!ch.always || (ch.key === 'push' && !o.pushAvailable),
      })),
    };
  });
}

// PURE. One cell changed, as a NEW grid (never mutate what the caller still holds). A category
// touched for the first time is seeded from the defaults so its other cells keep their meaning.
export function mergePref(prefs, category, channel, enabled) {
  const p = prefs || {};
  const row = { ..._defaults(category), ...(p[category] || {}) };
  row[channel] = !!enabled;
  return { ...p, [category]: row };
}

function _headHtml(opts) {
  const o = opts || {};
  return '<div class="tr-nc-head">' +
      '<div class="tr-nc-hcat"></div>' +
      CHANNELS.map((ch) =>
        '<div class="tr-nc-hch">' + esc(t(ch.labelKey)) +
          (ch.key === 'push' && !o.pushAvailable
            ? '<span class="tr-nc-soon">' + esc(t('nchan.soon')) + '</span>'
            : '') +
        '</div>').join('') +
    '</div>';
}

// PURE. The card markup, on the SAME tr-modal shell as "Meus dados" and the comunicado card, so
// it looks like every other Trail modal. `opts.loading` / `opts.error` render instead of the grid
// — an error must be STATED, never shown as an empty grid that reads as "you have no preferences".
export function channelsHtml(prefs, opts) {
  const o = opts || {};
  let body;
  if (o.error) {
    body = '<div class="tr-nc-error">' + esc(t('nchan.error')) + '</div>';
  } else if (o.loading) {
    body = '<div class="tr-nc-loading">' + esc(t('nchan.loading')) + '</div>';
  } else {
    body = _headHtml(o) + gridRows(prefs, o).map((r) =>
      '<div class="tr-nc-row" data-nc-row="' + esc(r.key) + '">' +
        '<div class="tr-nc-cat">' + esc(r.label) + '</div>' +
        r.cells.map((c) =>
          '<div class="tr-nc-cell">' +
            '<input type="checkbox" data-nc="' + esc(r.key) + ':' + esc(c.channel) + '"' +
              (c.enabled ? ' checked' : '') + (c.disabled ? ' disabled' : '') +
              ' aria-label="' + esc(r.label) + '">' +
          '</div>').join('') +
      '</div>').join('');
  }
  return '<div class="tr-modal tr-nc-modal">' +
      '<button class="tr-modal-close" type="button" aria-label="' + esc(t('mydata.close')) + '">×</button>' +
      '<div class="tr-nc-title">' + esc(t('nchan.title')) + '</div>' +
      '<div class="tr-nc-sub">' + esc(t('nchan.subtitle')) + '</div>' +
      '<div class="tr-nc-grid">' + body + '</div>' +
      '<p class="tr-nc-note">' + esc(t('nchan.note')) + '</p>' +
    '</div>';
}

// Open the card. It paints LOADING first and fetches after, because the grid is server state and
// showing stale-or-invented values would be showing the student a promise we are not keeping.
// A toggle saves that ONE cell immediately (no Salvar button, matching the settings popover next
// to it); a save that fails reverts the checkbox and says so, so the screen never claims a
// preference the worker does not hold.
//   fetchPrefs()                        -> Promise<{ ok, prefs }>
//   savePref(category, channel, bool)   -> Promise<{ ok }>
//   pushAvailable                       -> Etapa B seam (see gridRows)
export function openNotifChannels(o) {
  const opts = o || {};
  const doc = opts.doc || (typeof document !== 'undefined' ? document : null);
  if (!doc) return null;

  let prefs = null;
  const bd = doc.createElement('div');
  bd.className = 'tr-modal-backdrop tr-nc-backdrop';
  bd.innerHTML = channelsHtml(null, { loading: true, pushAvailable: !!opts.pushAvailable });

  const close = () => {
    if (bd.parentNode) bd.parentNode.removeChild(bd);
    doc.removeEventListener('keydown', onEsc);
  };
  const onEsc = (e) => { if (e.key === 'Escape') close(); };
  bd.addEventListener('click', (e) => {
    if (e.target === bd || (e.target.closest && e.target.closest('.tr-modal-close'))) close();
  });
  doc.addEventListener('keydown', onEsc);
  (opts.root || doc.body).appendChild(bd);

  function paint(state) {
    bd.innerHTML = channelsHtml(prefs, { ...state, pushAvailable: !!opts.pushAvailable });
    bind();
  }

  function bind() {
    bd.querySelectorAll('input[data-nc]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const [category, channel] = String(cb.getAttribute('data-nc')).split(':');
        const enabled = cb.checked;
        prefs = mergePref(prefs, category, channel, enabled);
        cb.disabled = true;
        Promise.resolve(opts.savePref && opts.savePref(category, channel, enabled))
          .then((res) => {
            cb.disabled = false;
            if (res && res.ok === false) throw new Error(res.error || 'save_failed');
          })
          .catch((err) => {
            // Revert to what the worker actually holds and say it out loud (the debug pill gets
            // the real detail per the project rule; the student gets a plain sentence).
            prefs = mergePref(prefs, category, channel, !enabled);
            cb.checked = !enabled;
            cb.disabled = false;
            const note = bd.querySelector('.tr-nc-note');
            if (note) { note.textContent = t('nchan.save_failed'); note.classList.add('tr-nc-note--err'); }
            try {
              if (typeof window !== 'undefined' && window.bsLog) {
                window.bsLog('notif prefs save failed: ' + (err && err.message), 'error');
              }
            } catch (_) { /* the pill is best-effort; never let logging break the UI */ }
          });
      });
    });
  }

  Promise.resolve(opts.fetchPrefs && opts.fetchPrefs())
    .then((res) => {
      if (!res || res.ok === false || !res.prefs) throw new Error((res && res.error) || 'load_failed');
      prefs = res.prefs;
      paint({});
    })
    .catch((err) => {
      paint({ error: true });
      try {
        if (typeof window !== 'undefined' && window.bsLog) {
          window.bsLog('notif prefs load failed: ' + (err && err.message), 'error');
        }
      } catch (_) { /* best effort */ }
    });

  return { el: bd, close };
}
