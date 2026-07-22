// content/turma-picker.js
// Shared Codex flat pill-bar turma picker. Native port of the legacy ClassTrail
// _renderTurmaPickerInto, used by BOTH the Releases and Tarefas sub-tabs, so it
// lives as its own reusable module (facade-only, cdx- styling, i18n). It fetches
// every non-archived client + their non-archived turmas, draws one alphabetical
// pill per (client, turma), persists the selection under caller-supplied
// localStorage keys, and calls onSelect(clientSlug, turmaSlug) on click.
//
//   mount(container, {
//     onSelect(clientSlug, turmaSlug),
//     storageKey: { client, turma },   // localStorage keys (optional)
//     autoRestore,                      // fire onSelect for the restored pill
//     exclude: { clientSlug, turmaSlug }, // omit this one turma from the pills (optional)
//   }) -> { destroy() }
import { cohorts as api } from '../js/codex-api.js';
import { t } from '../js/i18n.js';

import { esc as _esc } from '../js/dom.js';
function _ls(key) { try { return key ? localStorage.getItem(key) : null; } catch (_) { return null; } }
function _lsSet(key, val) { try { if (key) localStorage.setItem(key, val); } catch (_) { /* ignore */ } }

export function mount(container, opts) {
  if (!container) return { destroy() {} };
  opts = opts || {};
  const lsClient = opts.storageKey && opts.storageKey.client;
  const lsTurma = opts.storageKey && opts.storageKey.turma;
  let destroyed = false;

  container.innerHTML = '<div class="cdx-empty">' + t('picker.loading') + '</div>';

  api.listClients().then((data) => {
    if (destroyed) return null;
    const clients = ((data && data.clients) || []).filter((c) => c.status !== 'archived');
    if (!clients.length) {
      container.innerHTML = '<div class="cdx-empty">' + t('picker.no_clients') + '</div>';
      return null;
    }
    return Promise.all(clients.map((c) =>
      api.listTurmas({ client_slug: c.slug }).then((td) => ({
        client: c,
        turmas: ((td && td.turmas) || []).filter((tu) => tu.status !== 'archived'),
      }))
    ));
  }).then((groups) => {
    if (destroyed || !groups) return;
    const excl = opts.exclude;
    const entries = [];
    groups.forEach((g) => {
      g.turmas.forEach((tu) => {
        if (excl && excl.clientSlug === g.client.slug && excl.turmaSlug === tu.slug) return;
        entries.push({
          clientSlug: g.client.slug,
          clientName: g.client.display_name || g.client.name,
          turmaSlug: tu.slug,
          turmaName: tu.display_name || tu.name,
        });
      });
    });
    entries.sort((a, b) => {
      const cmp = a.clientName.localeCompare(b.clientName, 'pt-BR', { sensitivity: 'base' });
      return cmp !== 0 ? cmp : a.turmaName.localeCompare(b.turmaName, 'pt-BR', { sensitivity: 'base' });
    });
    if (!entries.length) {
      container.innerHTML = '<div class="cdx-empty">' + t('picker.no_turmas') + '</div>';
      return;
    }

    const savedClient = _ls(lsClient);
    const savedTurma = _ls(lsTurma);

    container.innerHTML = entries.map((e) => {
      const active = e.clientSlug === savedClient && e.turmaSlug === savedTurma;
      return '<button type="button" class="cdx-turma-pill' + (active ? ' is-active' : '') + '"' +
        ' data-client="' + _esc(e.clientSlug) + '" data-turma="' + _esc(e.turmaSlug) + '">' +
        '<span class="cdx-turma-pill-client">' + _esc(e.clientName) + '</span>' +
        '<span class="cdx-turma-pill-sep">·</span>' +
        '<span>' + _esc(e.turmaName) + '</span>' +
      '</button>';
    }).join('');

    const onClick = (ev) => {
      const btn = ev.target.closest('.cdx-turma-pill');
      if (!btn) return;
      const c = btn.dataset.client;
      const tu = btn.dataset.turma;
      container.querySelectorAll('.cdx-turma-pill').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      _lsSet(lsClient, c);
      _lsSet(lsTurma, tu);
      if (opts.onSelect) opts.onSelect(c, tu);
    };
    container.addEventListener('click', onClick);
    container._cdxPickerCleanup = () => container.removeEventListener('click', onClick);

    if (opts.autoRestore && container.querySelector('.cdx-turma-pill.is-active') && opts.onSelect) {
      opts.onSelect(savedClient, savedTurma);
    }
  }).catch(() => {
    if (!destroyed) container.innerHTML = '<div class="cdx-empty">' + t('picker.error') + '</div>';
  });

  return {
    destroy() {
      destroyed = true;
      if (container._cdxPickerCleanup) { container._cdxPickerCleanup(); container._cdxPickerCleanup = null; }
    },
  };
}
