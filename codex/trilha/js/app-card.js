// codex/trilha/js/app-card.js
// Shared renderer for an app's card on the student trilha, used in BOTH places the app
// surfaces: inside the lesson body (aulas.js) and the dedicated Aplicativos tab (apps.js).
// One builder so the two never drift. The card mirrors the app's own login screen (the copy
// is the single source in ct_apps.description): name + tagline + benefits + access note, plus
// the download. The app is a Windows PC program (Microsoft Store): on Windows we show the
// Store button; on any other OS we hide it and say it is Windows-only for now.
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
function parseDesc(raw) {
  if (!raw) return { tagline: '', access_note: '', benefits: [] };
  try {
    const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return {
      tagline: d.tagline || '',
      access_note: d.access_note || '',
      benefits: Array.isArray(d.benefits) ? d.benefits : [],
    };
  } catch (_) {
    return { tagline: '', access_note: '', benefits: [] };
  }
}

function glyphHtml(key, size) {
  const g = (typeof window !== 'undefined') ? window.CdxGlyphs : null;
  if (g && typeof g.hasGlyph === 'function' && key && g.hasGlyph(key)) {
    return g.glyphSvg(key, { size: size || 18 });
  }
  return '';
}

function iconHtml(app) {
  const icon = app && app.icon;
  if (icon) {
    const src = /^https?:\/\//.test(icon) ? icon : assetUrl('/r2/' + icon);
    return '<img class="cdx-tr-app-icon" src="' + esc(src) + '" alt="">';
  }
  return '<span class="cdx-tr-app-icon cdx-tr-app-icon--ph">' + glyphHtml('grid', 24) + '</span>';
}

// Build one app card element. `win` is injectable for tests (platform detection).
export function buildAppCard(app, opts = {}) {
  const d = parseDesc(app.description);
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

  const onWindows = isWindows(opts.window);
  const downloadHtml = (onWindows && app.store_url)
    ? '<a class="cdx-tr-app-download" href="' + esc(app.store_url) + '" target="_blank" rel="noopener">' +
        glyphHtml('download', 18) + '<span>' + esc(t('apps.download')) + '</span>' +
      '</a>'
    : '<div class="cdx-tr-app-winonly">' + esc(t('apps.windows_only')) + '</div>';

  card.innerHTML =
    '<div class="cdx-tr-app-head">' +
      iconHtml(app) +
      '<div class="cdx-tr-app-head-text">' +
        '<div class="cdx-tr-app-name">' + esc(app.name || app.app_key) + '</div>' +
        (d.tagline ? '<div class="cdx-tr-app-tagline">' + esc(d.tagline) + '</div>' : '') +
      '</div>' +
    '</div>' +
    (benefitsHtml ? '<ul class="cdx-tr-app-benefits">' + benefitsHtml + '</ul>' : '') +
    (d.access_note ? '<div class="cdx-tr-app-access">' + esc(d.access_note) + '</div>' : '') +
    '<div class="cdx-tr-app-actions">' + downloadHtml + '</div>';

  return card;
}
