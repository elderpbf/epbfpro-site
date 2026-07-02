// cohorts/app-release.js
// The "Aplicativos" section of an aula's Liberações pane (aula hub, Layout A). An app is
// released to a lesson exactly like content: checking it here binds the app to THIS aula, so
// its card surfaces on the student trilha (in the lesson body + the Aplicativos tab) once the
// lesson is marked occurred. The grant is turma-wide for entitlement (/ext/ login), aula-bound
// for placement, so re-checking from another aula MOVES the card (single-aula, like pre-#23
// content). Mounted BELOW the releases composer by cohorts.js; a module singleton like the
// releases/tarefas embeds. Backend via the codex-api facade only.
import { apps as api } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import { esc } from '../js/dom.js';
import { glyphSvg } from '../js/glyphs.js';
import * as notice from '../js/notice.js';
import * as toast from '../js/toast.js';

let _host = null;
let _turmaId = null;
let _aulaNumber = null;
let _apps = [];       // ct_list_apps catalog (only enabled apps are offered)
let _grants = {};     // app_key -> { enabled, aula_number }

function _err(e) { return (e && e.message) || e; }

// The checkbox for THIS aula reflects: granted + enabled + bound to this exact aula.
function _isOn(appKey) {
  const g = _grants[appKey];
  return !!(g && g.enabled && Number(g.aula_number) === Number(_aulaNumber));
}
// If the app is enabled but bound to a DIFFERENT aula, surface where (a "borrow" marker).
function _boundElsewhere(appKey) {
  const g = _grants[appKey];
  if (!g || !g.enabled) return null;
  if (g.aula_number == null) return null;
  return Number(g.aula_number) === Number(_aulaNumber) ? null : g.aula_number;
}

function _render() {
  if (!_host) return;
  const offered = _apps.filter((a) => a.enabled);
  const rowsHtml = offered.length
    ? offered.map((a) => {
        const on = _isOn(a.app_key);
        const elsewhere = _boundElsewhere(a.app_key);
        const marker = elsewhere != null
          ? ' <span class="cdx-aula-app-elsewhere">' + esc(t('apps.rel_other_aula').replace('{n}', String(elsewhere))) + '</span>'
          : '';
        return '<label class="cdx-aula-app-row' + (elsewhere != null ? ' is-elsewhere' : '') + '">' +
          '<input type="checkbox" class="cdx-aula-app-cb" data-app="' + esc(a.app_key) + '"' + (on ? ' checked' : '') + '>' +
          '<span class="cdx-aula-app-name">' + glyphSvg('grid', { size: 15 }) + ' ' + esc(a.name || a.app_key) + marker + '</span>' +
        '</label>';
      }).join('')
    : '<div class="cdx-comp-empty">' + t('apps.rel_none') + '</div>';

  _host.innerHTML =
    '<div class="cdx-aula-apps">' +
      '<div class="cdx-aula-apps-head">' + esc(t('apps.rel_section')) + '</div>' +
      '<div class="cdx-aula-apps-hint">' + esc(t('apps.rel_hint')) + '</div>' +
      '<div class="cdx-aula-apps-list">' + rowsHtml + '</div>' +
    '</div>';
}

function _onChange(e) {
  const cb = e.target.closest('.cdx-aula-app-cb');
  if (!cb) return;
  const appKey = cb.getAttribute('data-app');
  const enabled = cb.checked ? 1 : 0;
  cb.disabled = true;
  // Checking binds to THIS aula; unchecking disables the grant.
  api.setTurmaApp({ turma_id: _turmaId, app_key: appKey, enabled, aula_number: enabled ? _aulaNumber : _aulaNumber })
    .then((res) => {
      if (res && res.error) throw new Error(res.error);
      _grants[appKey] = { enabled, aula_number: _aulaNumber };
      toast.ok(t('apps.saved'));
      _render(); // repaint markers (e.g. a moved binding)
    })
    .catch((err) => {
      cb.checked = !cb.checked;
      cb.disabled = false;
      notice.internal(t('apps.rel_error') + ': ' + _err(err));
    });
}

export function mount(host, ctx = {}) {
  _host = host;
  _turmaId = ctx.turmaId != null ? ctx.turmaId : null;
  _aulaNumber = ctx.aulaNumber != null ? ctx.aulaNumber : null;
  _apps = [];
  _grants = {};
  if (!_host) return;
  _host.innerHTML = '<div class="cdx-aula-apps"><div class="cdx-aula-apps-head">' + esc(t('apps.rel_section')) + '</div><div class="cdx-empty">' + t('content.loading') + '</div></div>';
  _host.addEventListener('change', _onChange);
  if (_turmaId == null) { _render(); return; }
  Promise.all([
    api.list().then((d) => { _apps = (d && d.apps) || []; }),
    api.getTurmaApps({ turma_id: _turmaId }).then((d) => {
      _grants = {};
      ((d && d.apps) || []).forEach((g) => { _grants[g.app_key] = { enabled: g.enabled, aula_number: g.aula_number }; });
    }),
  ]).then(() => _render()).catch((err) => {
    if (_host) _host.innerHTML = '<div class="cdx-aula-apps"><div class="cdx-empty">' + t('apps.error_loading') + '</div></div>';
    notice.internal(_err(err));
  });
}

export function unmount() {
  if (_host) { _host.removeEventListener('change', _onChange); _host.innerHTML = ''; }
  _host = null;
  _turmaId = null;
  _aulaNumber = null;
  _apps = [];
  _grants = {};
}
