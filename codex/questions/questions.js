// questions/questions.js
// Codex Questions tab shell (host/admin plane). Mirrors content/content.js: owns
// the sub-tab registry, exposes it to the Codex topbar via subtabs(), and mounts
// the active NATIVE sub-module into the view. Each sub-tab is either NATIVE (a
// `module` with mount/unmount) or a LEGACY BRIDGE (an `href` to the not-yet
// migrated ClassPulse page). The bridge is a plain navigation link, never an
// iframe or embed, and is temporary: as each sub-tab migrates, swap its `href`
// for a `module`. End state is all-native, zero bridges.
import { t } from '../js/i18n.js';
import * as sessions from './sessions.js';
import * as bank from './bank.js';
import * as stats from './stats.js';

export const SUBTABS = [
  { key: 'sessions', labelKey: 'questions.sub_sessions', module: sessions },
  { key: 'bank',     labelKey: 'questions.sub_bank',     module: bank },
  { key: 'stats',    labelKey: 'questions.sub_stats',    module: stats },
];

function _native() { return SUBTABS.filter((s) => s.module); }
function _resolveSub(sub) {
  const native = _native();
  return (sub && native.some((s) => s.key === sub)) ? sub : native[0].key;
}

// Entries for the Codex topbar sub-row: { label, href, active }. Native sub-tabs
// route to /codex/?tab=questions&sub=<key>; legacy ones bridge to the ClassPulse
// page (marked with a trailing arrow). Topbar nav is URL-driven (links), so no
// cross-module callbacks: clicking a sub-tab reloads with ?sub= and mount()
// brings up the right module.
export function subtabs(activeSub) {
  const active = _resolveSub(activeSub);
  return SUBTABS.map((s) => ({
    label: s.module ? t(s.labelKey) : t(s.labelKey) + ' ↗',
    href: s.module ? ('/codex/?tab=questions&sub=' + s.key) : s.href,
    active: !!s.module && s.key === active,
  }));
}

let _viewEl = null;
let _activeModule = null;

export function mount(viewEl, ctx) {
  _viewEl = viewEl;
  ctx = ctx || {};
  const entry = _native().find((s) => s.key === _resolveSub(ctx.sub));
  viewEl.innerHTML = '<div class="cdx-subview" id="cdx-subview"></div>';
  _activeModule = entry ? entry.module : null;
  if (_activeModule && _activeModule.mount) _activeModule.mount(viewEl.querySelector('#cdx-subview'), ctx);
}

export function unmount() {
  if (_activeModule && _activeModule.unmount) {
    try { _activeModule.unmount(); } catch (_) { /* ignore */ }
  }
  _activeModule = null;
  if (_viewEl) _viewEl.innerHTML = '';
  _viewEl = null;
}
