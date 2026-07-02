// content/content.js
// Codex Content tab shell. The sub-tab BAR is rendered by the Codex topbar
// (the legacy `bs-topbar-subrow` chrome, reused as-is) and only appears for
// tabs that declare sub-tabs. This module owns the sub-tab registry, exposes
// it to the topbar via subtabs(), and mounts the active NATIVE sub-module into
// the view. Each sub-tab is either NATIVE (a `module` with mount/unmount) or a
// LEGACY BRIDGE (an `href` to the not-yet-migrated ClassTrail page). As each
// sub-tab migrates, swap its `href` entry for a `module` entry.
import { t } from '../js/i18n.js';
import * as items from './items.js';
import * as presets from './presets.js';
import * as apostila from './apostila.js';
import * as labs from './labs.js';
import * as drive from './drive.js';
import * as slides from './slides.js';
import * as tarefas from './tarefas.js';
import * as apps from './apps.js';

// Content is the authoring/library surface. The two turma-scoped management
// sub-tabs (Tarefas answers + Liberações) moved into the cohort dossier, where the
// turma is already in context; their modules (content/tarefas.js, content/releases.js)
// are mounted turma-bound from cohorts.js. Keeping the modules where they are avoids
// duplicating the composer, the dossier just mounts them with { turma }.
// The Tarefas sub-tab here is the BANK ONLY (create/edit/delete tarefas, with the
// release guard), mounted via mountCtx { bankOnly: true }. Releasing a tarefa to an
// aula happens inside the aula dossiê, not here, same tarefas.js module, no fork.
export const SUBTABS = [
  { key: 'items',    labelKey: 'content.sub_items',    module: items },
  { key: 'apostila', labelKey: 'content.sub_apostila', module: apostila },
  { key: 'tarefas',  labelKey: 'content.sub_tarefas',  module: tarefas, mountCtx: { bankOnly: true } },
  { key: 'drive',    labelKey: 'content.sub_drive',    module: drive },
  { key: 'slides',   labelKey: 'content.sub_slides',   module: slides },
  { key: 'labs',     labelKey: 'content.sub_labs',     module: labs },
  { key: 'presets',  labelKey: 'content.sub_presets',  module: presets },
  { key: 'apps',     labelKey: 'content.sub_apps',     module: apps },
];

function _native() { return SUBTABS.filter((s) => s.module); }
function _resolveSub(sub) {
  const native = _native();
  return (sub && native.some((s) => s.key === sub)) ? sub : native[0].key;
}

// Entries for the Codex topbar sub-row: { label, href, active }. Native sub-tabs
// route to /codex/?tab=content&sub=<key>; legacy ones bridge to their ClassTrail
// page (marked with a trailing arrow). Topbar nav is URL-driven (links), so no
// cross-module callbacks: clicking a sub-tab reloads with ?sub= and mount()
// brings up the right module.
export function subtabs(activeSub) {
  const active = _resolveSub(activeSub);
  return SUBTABS.map((s) => ({
    label: s.module ? t(s.labelKey) : t(s.labelKey) + ' ↗',
    href: s.module ? ('/codex/?tab=content&sub=' + s.key) : s.href,
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
  if (_activeModule && _activeModule.mount) _activeModule.mount(viewEl.querySelector('#cdx-subview'), (entry && entry.mountCtx) || {});
}

export function unmount() {
  if (_activeModule && _activeModule.unmount) {
    try { _activeModule.unmount(); } catch (_) { /* ignore */ }
  }
  _activeModule = null;
  if (_viewEl) _viewEl.innerHTML = '';
  _viewEl = null;
}
