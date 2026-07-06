// content/apps.js
// Codex Content tab, Aplicativos sub-tab: manage the external-app CATALOG (ct_apps),
// the relying-party apps that integrate via the /ext/ identity contract (1st: the PDF
// Extractor). This is the single home for an app's CARD content (name + store link + icon
// + the tagline/benefits/access-note shown BOTH on the trilha card and the app's own login
// screen), so it never drifts. Replaces the earlier idea of a separate Backstage project;
// if it ever grows into a real product surface it can be ported out.
//
// Master-detail layout, same shell as Items/Presets (cdx-items-split / cdx-items-list /
// cdx-item-row / cdx-item-preview), so there is one layout, not a per-tab copy. The left
// list is the catalog; the right pane is the inline edit form for the selected app.
//
// Scope note: only EDIT of existing apps here (ct_update_app). Creating a new app mints an
// app_key + APP_API_KEY (Doppler) and is a rarer, heavier flow kept manual for now; delete
// would cascade /ext/ entitlements. Both are deferred until a real second app appears.
import { apps as api } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import { glyphSvg } from '../js/glyphs.js';
import { assetUrl } from '../js/codex-api.js';
import { mountRail } from '../js/list-rail.js';
import * as notice from '../js/notice.js';
import * as toast from '../js/toast.js';
import { esc as _esc } from '../js/dom.js';
import { errMsg as _err } from '../js/content-err.js';

// ── Module state ────────────────────────────────────────────────────────────
let _viewEl = null;
let _apps = [];
let _selectedKey = null;
let _benefits = [];   // working benefits list for the selected app's editor
let _rail = null;     // the left app list is the shared list-rail (js/list-rail.js)

function _q(id) { return _viewEl ? _viewEl.querySelector('#' + id) : null; }

// The card copy lives in ct_apps.description as JSON. Parse defensively (a bad/empty
// value yields a blank form, never a throw). Shape: { tagline, access_note, benefits:[
// { glyph, title, desc } ] }.
export function parseDescription(raw) {
  const blank = { tagline: '', access_note: '', benefits: [], screenshots: { light: '', dark: '' } };
  if (!raw) return blank;
  try {
    const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const s = d.screenshots || {};
    return {
      tagline: d.tagline || '',
      access_note: d.access_note || '',
      benefits: Array.isArray(d.benefits) ? d.benefits.map((b) => ({ glyph: b.glyph || '', title: b.title || '', desc: b.desc || '' })) : [],
      screenshots: { light: s.light || '', dark: s.dark || '' },
    };
  } catch (_) {
    return blank;
  }
}

// An app's icon is an image (R2 path or absolute URL); fall back to a neutral glyph.
function _appIconHtml(app) {
  const icon = app && app.icon;
  if (icon) {
    const src = /^https?:\/\//.test(icon) ? icon : assetUrl('/r2/' + icon);
    return '<img class="cdx-app-icon-img" src="' + _esc(src) + '" alt="">';
  }
  return '<span class="cdx-app-icon-ph">' + glyphSvg('grid', { size: 18 }) + '</span>';
}

// ── Left list (shared list-rail, track-21) ───────────────────────────────────
// Select-only (apps are a fixed registry: no add, no drag). The rail owns the row shell
// + selection; renderRow returns the icon + name/off-badge + app_key.
function _appRowMain(a) {
  const off = !a.enabled;
  return '<span class="cdx-item-type-icon">' + _appIconHtml(a) + '</span>' +
    '<div class="cdx-item-info">' +
      '<div class="cdx-item-title">' + _esc(a.name || a.app_key) +
        (off ? ' <span class="cdx-app-off-badge">' + t('apps.disabled_badge') + '</span>' : '') + '</div>' +
      '<div class="cdx-item-sub">' + _esc(a.app_key) + '</div>' +
    '</div>';
}

function _buildRail() {
  const el = _q('cdx-apps-list');
  if (!el) return;
  _rail = mountRail(el, {
    title: '',
    items: () => _apps,
    getId: (a) => a.app_key,
    renderRow: (a) => ({ main: _appRowMain(a) }),
    selectedId: () => _selectedKey,
    onSelect: (key) => { _selectedKey = key; _rail.render(); _renderDetail(); },
    emptyText: t('apps.empty'),
  });
}

function _renderList() {
  if (_rail) _rail.render();
}

// ── Right pane: the edit form ─────────────────────────────────────────────────
function _fieldRow(label, inputHtml, hint) {
  return '<div class="cdx-field cdx-app-field">' +
    '<label class="cdx-field-label">' + _esc(label) + '</label>' +
    inputHtml +
    (hint ? '<div class="cdx-field-hint">' + _esc(hint) + '</div>' : '') +
  '</div>';
}

function _benefitRowHtml(b, i) {
  return '<div class="cdx-app-benefit" data-bi="' + i + '">' +
    '<span class="cdx-app-benefit-glyph" data-glyph-preview>' + (b.glyph ? glyphSvg(b.glyph, { size: 18 }) : '') + '</span>' +
    '<input type="text" class="cdx-app-b-glyph" data-bf="glyph" value="' + _esc(b.glyph) + '" placeholder="' + _esc(t('apps.benefit_glyph_ph')) + '" spellcheck="false">' +
    '<input type="text" class="cdx-app-b-title" data-bf="title" value="' + _esc(b.title) + '" placeholder="' + _esc(t('apps.benefit_title_ph')) + '">' +
    '<input type="text" class="cdx-app-b-desc" data-bf="desc" value="' + _esc(b.desc) + '" placeholder="' + _esc(t('apps.benefit_desc_ph')) + '">' +
    '<button type="button" class="cdx-btn cdx-btn-sm cdx-btn-danger cdx-app-b-del" data-bdel="' + i + '" title="' + _esc(t('apps.benefit_remove')) + '">&times;</button>' +
  '</div>';
}

function _benefitsHtml() {
  const rows = _benefits.map((b, i) => _benefitRowHtml(b, i)).join('');
  return '<div class="cdx-app-benefits" id="cdx-app-benefits">' + rows + '</div>' +
    '<button type="button" class="cdx-btn cdx-btn-sm cdx-btn-vazado" id="cdx-app-b-add">+ ' + t('apps.benefit_add') + '</button>';
}

function _renderDetail() {
  const pane = _q('cdx-apps-detail');
  if (!pane) return;
  const app = _apps.find((a) => a.app_key === _selectedKey);
  if (!app) {
    pane.innerHTML = '<div class="cdx-preview-empty">' + t('apps.select') + '</div>';
    return;
  }
  const d = parseDescription(app.description);
  _benefits = d.benefits;

  pane.innerHTML =
    '<div class="cdx-preview-body cdx-app-form">' +
      '<div class="cdx-app-form-head">' + _appIconHtml(app) + '<h3 class="cdx-app-form-title">' + _esc(app.name || app.app_key) + '</h3>' +
        '<label class="cdx-app-enabled"><input type="checkbox" id="cdx-app-enabled"' + (app.enabled ? ' checked' : '') + '> <span>' + _esc(t('apps.enabled')) + '</span></label>' +
      '</div>' +
      _fieldRow(t('apps.f_name'), '<input type="text" id="cdx-app-name" value="' + _esc(app.name || '') + '">') +
      _fieldRow(t('apps.f_store_url'), '<input type="text" id="cdx-app-store" value="' + _esc(app.store_url || '') + '" spellcheck="false" placeholder="https://apps.microsoft.com/detail/...">', t('apps.f_store_hint')) +
      _fieldRow(t('apps.f_icon'), '<input type="text" id="cdx-app-icon" value="' + _esc(app.icon || '') + '" spellcheck="false">', t('apps.f_icon_hint')) +
      '<div class="cdx-app-sep" role="separator"></div>' +
      '<div class="cdx-app-copy-head">' + _esc(t('apps.card_copy')) + '</div>' +
      _fieldRow(t('apps.f_tagline'), '<input type="text" id="cdx-app-tagline" value="' + _esc(d.tagline) + '">') +
      _fieldRow(t('apps.f_access_note'), '<input type="text" id="cdx-app-access" value="' + _esc(d.access_note) + '">') +
      _fieldRow(t('apps.f_benefits'), _benefitsHtml(), t('apps.f_benefits_hint')) +
      _fieldRow(t('apps.f_shot_light'), '<input type="text" id="cdx-app-shot-light" value="' + _esc(d.screenshots.light) + '" spellcheck="false" placeholder="apps/pdf/shot-light.png">', t('apps.f_shot_hint')) +
      _fieldRow(t('apps.f_shot_dark'), '<input type="text" id="cdx-app-shot-dark" value="' + _esc(d.screenshots.dark) + '" spellcheck="false" placeholder="apps/pdf/shot-dark.png">') +
    '</div>' +
    '<div class="cdx-app-form-actions">' +
      '<span class="cdx-app-msg" aria-live="polite"></span>' +
      '<button type="button" class="cdx-btn cdx-btn-primary" id="cdx-app-save">' + t('content.save') + '</button>' +
    '</div>';
}

// ── Benefits repeater wiring (delegated on the detail pane) ───────────────────
function _readBenefitsFromDom() {
  const wrap = _q('cdx-app-benefits');
  if (!wrap) return;
  _benefits = Array.from(wrap.querySelectorAll('.cdx-app-benefit')).map((row) => ({
    glyph: (row.querySelector('[data-bf="glyph"]') || {}).value || '',
    title: (row.querySelector('[data-bf="title"]') || {}).value || '',
    desc: (row.querySelector('[data-bf="desc"]') || {}).value || '',
  }));
}

function _onDetailClick(e) {
  const del = e.target.closest('[data-bdel]');
  if (del) {
    _readBenefitsFromDom();
    _benefits.splice(Number(del.getAttribute('data-bdel')), 1);
    const wrap = _q('cdx-app-benefits');
    if (wrap) wrap.innerHTML = _benefits.map((b, i) => _benefitRowHtml(b, i)).join('');
    return;
  }
  if (e.target.closest('#cdx-app-b-add')) {
    _readBenefitsFromDom();
    _benefits.push({ glyph: '', title: '', desc: '' });
    const wrap = _q('cdx-app-benefits');
    if (wrap) wrap.innerHTML = _benefits.map((b, i) => _benefitRowHtml(b, i)).join('');
    return;
  }
  if (e.target.closest('#cdx-app-save')) { _save(); return; }
}

// Live glyph preview as the admin types a glyph key.
function _onDetailInput(e) {
  const glyphInput = e.target.closest('[data-bf="glyph"]');
  if (!glyphInput) return;
  const row = glyphInput.closest('.cdx-app-benefit');
  const prev = row && row.querySelector('[data-glyph-preview]');
  if (prev) prev.innerHTML = glyphInput.value ? glyphSvg(glyphInput.value, { size: 18 }) : '';
}

function _save() {
  const app = _apps.find((a) => a.app_key === _selectedKey);
  if (!app) return;
  _readBenefitsFromDom();
  const btn = _q('cdx-app-save');
  const msg = _viewEl.querySelector('.cdx-app-msg');
  const name = (_q('cdx-app-name') || {}).value || '';
  const store_url = (_q('cdx-app-store') || {}).value || '';
  const icon = (_q('cdx-app-icon') || {}).value || '';
  const enabled = !!(_q('cdx-app-enabled') || {}).checked;
  const tagline = (_q('cdx-app-tagline') || {}).value || '';
  const access_note = (_q('cdx-app-access') || {}).value || '';
  const shotLight = (_q('cdx-app-shot-light') || {}).value || '';
  const shotDark = (_q('cdx-app-shot-dark') || {}).value || '';
  const benefits = _benefits
    .filter((b) => b.glyph || b.title || b.desc)
    .map((b) => ({ glyph: b.glyph.trim(), title: b.title.trim(), desc: b.desc.trim() }));
  const description = JSON.stringify({
    tagline: tagline.trim(), access_note: access_note.trim(), benefits,
    screenshots: { light: shotLight.trim(), dark: shotDark.trim() },
  });
  if (btn) btn.disabled = true;
  if (msg) msg.textContent = '';
  api.updateApp({ app_key: app.app_key, name: name.trim(), store_url: store_url.trim(), icon: icon.trim(), enabled: enabled ? 1 : 0, description })
    .then((res) => {
      if (res && res.error) throw new Error(res.error);
      // Reflect locally so the list + form stay in sync without a full refetch.
      app.name = name.trim(); app.store_url = store_url.trim(); app.icon = icon.trim();
      app.enabled = enabled ? 1 : 0; app.description = description;
      toast.ok(t('apps.saved'));
      _renderList();
      _renderDetail();
    })
    .catch((err) => {
      if (btn) btn.disabled = false;
      if (msg) msg.textContent = t('apps.save_error');
      notice.internal(_err(err));
    });
}

// ── Load ──────────────────────────────────────────────────────────────────────
function _reload() {
  return api.list().then((d) => {
    _apps = (d && d.apps) || [];
    // Auto-select the only app so the single-app case opens straight into its editor.
    if (!_selectedKey && _apps.length === 1) _selectedKey = _apps[0].app_key;
    _renderList();
    _renderDetail();
  }).catch((err) => {
    const el = _q('cdx-apps-list');
    if (el) el.innerHTML = '<div class="cdx-empty">' + t('apps.error_loading') + '</div>';
    notice.internal(_err(err));
  });
}

function _renderShell() {
  _viewEl.innerHTML =
    '<div class="cdx-apps-admin">' +
      '<div class="cdx-presets-toolbar">' +
        '<h2 class="cdx-presets-title">' + t('apps.title') + '</h2>' +
      '</div>' +
      '<div class="cdx-items-split" id="cdx-apps-split">' +
        '<div class="cdx-items-list" id="cdx-apps-list"></div>' +
        '<div class="cdx-item-preview" id="cdx-apps-detail">' +
          '<div class="cdx-preview-empty">' + t('apps.select') + '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  if (_rail) { _rail.destroy(); _rail = null; }
  _buildRail();
  const detail = _q('cdx-apps-detail');
  detail.addEventListener('click', _onDetailClick);
  detail.addEventListener('input', _onDetailInput);
}

// ── Tab contract ─────────────────────────────────────────────────────────────
export function mount(viewEl) {
  _viewEl = viewEl;
  _apps = [];
  _selectedKey = null;
  _benefits = [];
  _renderShell();
  _reload();
}

export function unmount() {
  if (_rail) { _rail.destroy(); _rail = null; }
  _apps = [];
  _selectedKey = null;
  _benefits = [];
  if (_viewEl) _viewEl.innerHTML = '';
  _viewEl = null;
}
