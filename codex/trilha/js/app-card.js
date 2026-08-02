// codex/trilha/js/app-card.js
// Shared renderers for an app on the student trilha, used in BOTH places it surfaces:
//   - buildAppSub(): a COLLAPSED sub-card (like a tarefa/conteúdo row) shown at the TOP of
//     the lesson body; its icon is the app logo and it expands to the full card.
//   - buildAppCard(): the full card (Aplicativos tab, and inside an expanded sub-card).
// One card builder so the two never drift. The card mirrors the app's own login screen (the
// copy is the single source in ct_apps.description): logo + tagline + benefits + a theme-aware
// screenshot + access note + the action.
//
// HOW THE APP IS HANDED OVER is `delivery` (track-59), read from the same description JSON:
//   'store' (default) — a Windows PC program on the Microsoft Store. Button on Windows only;
//                       elsewhere the card says so. This is the original behaviour, unchanged.
//   'web'             — the app IS a site. It opens on every platform and the Windows notice
//                       must never appear, because it would be a lie.
// Delivery had been baked in rather than modelled: the second app is a site, so it rendered a
// card with no action at all, and announced "Windows only" on a Mac.
import { esc } from './utils.js';
import { assetUrl } from '../../js/codex-api.js';
import { t } from '../i18n.js';

// True on Windows desktop. Defaults to true only when the platform is genuinely
// undetectable (rare); a recognizable non-Windows UA (Mac/iOS/Android/Linux) returns false.
export function isWindows(win) {
  const nav = (win && win.navigator) || (typeof navigator !== 'undefined' ? navigator : null);
  if (!nav) return true;
  const uaData = nav.userAgentData;
  if (uaData && uaData.platform) return /win/i.test(uaData.platform);
  const ua = (nav.userAgent || '') + ' ' + (nav.platform || '');
  if (/windows|win32|win64|wow64/i.test(ua)) return true;
  if (/mac|iphone|ipad|ipod|android|linux|cros/i.test(ua)) return false;
  return true; // undetectable -> show (audience is Windows PCs)
}

// The card copy lives in ct_apps.description as JSON. Parse defensively; a bad/empty value
// yields a blank card (name + download still render), never a throw.
const BLANK_DESC = { tagline: '', access_note: '', benefits: [], screenshots: null, delivery: 'store' };

// Anything that is not the word 'web' means the Store, so a typo or an older row (every row
// predates this field) keeps the behaviour it already had.
export function deliveryOf(value) {
  return value === 'web' ? 'web' : 'store';
}

export function parseDesc(raw) {
  if (!raw) return { ...BLANK_DESC };
  try {
    const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return {
      tagline: d.tagline || '',
      access_note: d.access_note || '',
      benefits: Array.isArray(d.benefits) ? d.benefits : [],
      screenshots: (d.screenshots && (d.screenshots.light || d.screenshots.dark)) ? d.screenshots : null,
      delivery: deliveryOf(d.delivery),
    };
  } catch (_) {
    return { ...BLANK_DESC };
  }
}

// PURE. What the card offers for this app, decided in one place so the full card and the
// collapsed row can never disagree:
//   { kind: 'store', href }  the Store download (Windows)
//   { kind: 'web',   href }  open the site (any platform)
//   { kind: 'windows_only' } a Store app seen from a non-Windows device
//   { kind: 'none' }         no URL registered yet: stay silent rather than invent a reason
export function appAction(app, delivery, onWindows) {
  const href = (app && app.store_url) || '';
  if (deliveryOf(delivery) === 'web') return href ? { kind: 'web', href } : { kind: 'none' };
  if (!onWindows) return { kind: 'windows_only' };
  return href ? { kind: 'store', href } : { kind: 'none' };
}

function glyphHtml(key, size) {
  const g = (typeof window !== 'undefined') ? window.CdxGlyphs : null;
  if (g && typeof g.hasGlyph === 'function' && key && g.hasGlyph(key)) {
    return g.glyphSvg(key, { size: size || 18 });
  }
  return '';
}

// Resolve an R2 path (or absolute URL) to a servable src.
function srcOf(path) {
  if (!path) return '';
  return /^https?:\/\//.test(path) ? path : assetUrl('/r2/' + path);
}

function iconHtml(app, cls) {
  const c = cls || 'cdx-tr-app-icon';
  if (app && app.icon) return '<img class="' + c + '" src="' + esc(srcOf(app.icon)) + '" alt="">';
  return '<span class="' + c + ' ' + c + '--ph">' + glyphHtml('grid', 24) + '</span>';
}

// The action link for a resolved appAction. `cls` is the COMPLETE class list (the card's button
// and the row's inline action are styled differently), `size` the glyph. Returns '' for the
// kinds that are not a link.
function actionHtml(action, cls, size) {
  if (action.kind !== 'store' && action.kind !== 'web') return '';
  const web = action.kind === 'web';
  return '<a class="' + cls + '" href="' + esc(action.href) + '" target="_blank" rel="noopener">' +
    glyphHtml(web ? 'external-link' : 'download', size || 18) +
    '<span>' + esc(t(web ? 'apps.open' : 'apps.download')) + '</span></a>';
}

// Light + dark screenshots; CSS shows the one matching the active [data-theme] so it swaps
// live on theme toggle. Missing one variant falls back to the other.
function shotsHtml(screenshots) {
  if (!screenshots) return '';
  const light = srcOf(screenshots.light || screenshots.dark);
  const dark = srcOf(screenshots.dark || screenshots.light);
  return '<div class="cdx-tr-app-shots">' +
    '<img class="cdx-tr-app-shot cdx-tr-app-shot--light" src="' + esc(light) + '" alt="" loading="lazy">' +
    '<img class="cdx-tr-app-shot cdx-tr-app-shot--dark" src="' + esc(dark) + '" alt="" loading="lazy">' +
  '</div>';
}

// Build the full app card. `win` is injectable for tests (platform detection).
export function buildAppCard(app, opts = {}) {
  const d = parseDesc(app.description);
  const onWindows = isWindows(opts.window);
  const card = document.createElement('div');
  card.className = 'cdx-tr-app-card';
  card.dataset.app = app.app_key;

  const benefitsHtml = (d.benefits || []).map((b) =>
    '<li class="cdx-tr-app-benefit">' +
      '<span class="cdx-tr-app-benefit-glyph">' + glyphHtml(b.glyph, 18) + '</span>' +
      '<span class="cdx-tr-app-benefit-text">' +
        '<span class="cdx-tr-app-benefit-title">' + esc(b.title || '') + '</span>' +
        (b.desc ? '<span class="cdx-tr-app-benefit-desc">' + esc(b.desc) + '</span>' : '') +
      '</span>' +
    '</li>'
  ).join('');

  const shots = shotsHtml(d.screenshots);
  const action = appAction(app, d.delivery, onWindows);
  const topDl = actionHtml(action, 'cdx-tr-app-download cdx-tr-app-download--top');
  const footDl = action.kind === 'windows_only'
    ? '<div class="cdx-tr-app-winonly">' + esc(t('apps.windows_only')) + '</div>'
    : actionHtml(action, 'cdx-tr-app-download cdx-tr-app-download--foot');

  // Header: logo + name/tagline on the left, the top download aligned to the right.
  // Body: two columns on wide screens (benefits left, the print right), vertically
  // centered; on mobile they stack with the print FIRST (col-right order flips in CSS).
  const rightCol = shots ? '<div class="cdx-tr-app-col-right">' + shots + '</div>' : '';

  card.innerHTML =
    '<div class="cdx-tr-app-head">' +
      iconHtml(app) +
      '<div class="cdx-tr-app-head-text">' +
        '<div class="cdx-tr-app-name">' + esc(app.name || app.app_key) + '</div>' +
        (d.tagline ? '<div class="cdx-tr-app-tagline">' + esc(d.tagline) + '</div>' : '') +
      '</div>' +
      (topDl ? '<div class="cdx-tr-app-head-dl">' + topDl + '</div>' : '') +
    '</div>' +
    '<div class="cdx-tr-app-cols' + (shots ? '' : ' cdx-tr-app-cols--nofig') + '">' +
      '<div class="cdx-tr-app-col-left">' +
        (benefitsHtml ? '<ul class="cdx-tr-app-benefits">' + benefitsHtml + '</ul>' : '') +
      '</div>' +
      rightCol +
    '</div>' +
    '<div class="cdx-tr-app-foot">' +
      (d.access_note ? '<div class="cdx-tr-app-access">' + esc(d.access_note) + '</div>' : '') +
      footDl +
    '</div>';

  return card;
}

// A collapsed sub-card for the lesson body: same shape as the tarefa/conteúdo rows, but the
// app logo replaces the type glyph and a Store button is the row action (Windows). Clicking
// expands the full card inline below it. Single-open within its own (app-only) list.
export function buildAppSub(app, opts = {}) {
  const sub = document.createElement('div');
  sub.className = 'cdx-tr-sub cdx-tr-sub--app';
  sub.dataset.app = app.app_key;
  sub.setAttribute('role', 'button');
  sub.setAttribute('tabindex', '0');

  const onWindows = isWindows(opts.window);
  // The row carries the action or nothing; the Windows notice is card-only (a one-line row is
  // not the place to explain a platform).
  const rowDl = actionHtml(appAction(app, parseDesc(app.description).delivery, onWindows),
    'cdx-tr-item-action cdx-tr-app-row-dl', 16);

  sub.innerHTML =
    '<div class="cdx-tr-sub-zone cdx-tr-sub-zone--app">' + iconHtml(app, 'cdx-tr-app-sub-logo') + '</div>' +
    '<div class="cdx-tr-sub-meta">' +
      '<span class="cdx-tr-sub-type">' + esc(t('apps.aula_section')) + '</span>' +
      '<span class="cdx-tr-sub-title">' + esc(app.name || app.app_key) + '</span>' +
    '</div>' +
    '<div class="cdx-tr-sub-actions">' + rowDl + '</div>';

  sub.addEventListener('click', (e) => {
    if (e.target && e.target.closest && e.target.closest('.cdx-tr-item-action')) return;
    toggleAppSub(sub, app, opts);
  });
  sub.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (e.target && e.target.closest && e.target.closest('.cdx-tr-item-action')) return;
    e.preventDefault();
    toggleAppSub(sub, app, opts);
  });
  return sub;
}

function toggleAppSub(sub, app, opts) {
  const already = sub.classList.contains('is-expanded');
  const list = sub.parentNode;
  if (list) {
    list.querySelectorAll('.cdx-tr-sub-expanded').forEach((el) => el.remove());
    list.querySelectorAll('.cdx-tr-sub.is-expanded').forEach((el) => el.classList.remove('is-expanded'));
  }
  if (already) return;
  sub.classList.add('is-expanded');
  const exp = document.createElement('div');
  exp.className = 'cdx-tr-sub-expanded cdx-tr-sub-expanded--app';
  exp.appendChild(buildAppCard(app, opts));
  if (sub.parentNode) sub.parentNode.insertBefore(exp, sub.nextSibling);
}
