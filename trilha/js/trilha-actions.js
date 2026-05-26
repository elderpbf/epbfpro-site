'use strict';

// Trilha.Actions -- item-action dispatch + button injection.
// getItemAction() maps item -> { kind, label, icon, ... }; injectActionButton
// mounts it on a .sub-actions slot; appendFlatActionRow mounts it under a
// flat-card body. Tarefa-submit modal opens via window.CTTarefaSubmitModal.

(function () {
  var Trilha = window.Trilha = window.Trilha || {};

  function getMeta(item) {
    if (!item || !item.meta_json) return {};
    if (typeof item.meta_json === 'string') {
      try { return JSON.parse(item.meta_json) || {}; } catch (_) { return {}; }
    }
    return item.meta_json || {};
  }

  function getItemAction(item) {
    var meta = getMeta(item);
    if (item.type === 'tarefa') {
      if (Trilha.Utils.hasSubmittedTarefa(item.id)) {
        return { kind: 'submitted', label: 'Resposta enviada', shortLabel: 'Enviada', icon: 'check' };
      }
      return { kind: 'submit', label: 'Enviar resposta', shortLabel: 'Enviar', icon: 'send', item: item };
    }
    if (meta.pdf_url) return { kind: 'open', label: 'Baixar PDF', url: meta.pdf_url, icon: 'download' };
    if (meta.attachment_url) {
      var isImg = /\.(png|jpe?g|webp|gif)$/i.test(meta.attachment_url);
      return {
        kind: 'open',
        label: isImg ? 'Ver imagem' : 'Baixar',
        url: meta.attachment_url,
        icon: isImg ? 'external' : 'download',
      };
    }
    if (meta.doc_url) return { kind: 'open', label: 'Documentação', url: meta.doc_url, icon: 'external' };
    if (item.body_md) return { kind: 'copy', label: 'Copiar', text: item.body_md, icon: 'copy' };
    return null;
  }

  function injectActionButton(sub, item, opts) {
    var actionsEl = sub.querySelector('.sub-actions');
    if (!actionsEl) return;
    actionsEl.innerHTML = '';
    var action = getItemAction(item);
    if (!action) return;

    var ICONS = Trilha.State.ICONS;
    var esc = Trilha.Utils.esc;

    var btn;
    if (action.kind === 'open') {
      btn = document.createElement('a');
      btn.href = action.url;
      btn.target = '_blank';
      btn.rel = 'noopener';
      btn.setAttribute('target', '_blank');
    } else {
      btn = document.createElement('button');
      btn.type = 'button';
    }
    var cls = 'item-action' + (opts && opts.isTarefa ? ' item-action--task' : '');
    if (action.kind === 'submitted') cls += ' item-action--submitted is-done';
    btn.className = cls;
    cls.split(/\s+/).forEach(function (c) { if (c) btn.classList.add(c); });

    var labelHtml = '<span class="ia-label-full">' + esc(action.label) + '</span>';
    if (action.shortLabel) {
      labelHtml += '<span class="ia-label-short">' + esc(action.shortLabel) + '</span>';
    }
    btn.innerHTML = (ICONS[action.icon] || ICONS.copy) + labelHtml;
    if (action.kind === 'submitted') btn.disabled = true;

    btn.addEventListener('click', function (e) {
      if (e && e.stopPropagation) e.stopPropagation();
      if (action.kind === 'copy') {
        if (e && e.preventDefault) e.preventDefault();
        Trilha.Utils.copyToClipboard(action.text, btn);
      } else if (action.kind === 'submit') {
        if (e && e.preventDefault) e.preventDefault();
        openTarefaSubmit(action.item, sub, opts);
      }
    });
    actionsEl.appendChild(btn);
  }

  function openTarefaSubmit(item, sub, opts) {
    if (!window.CTTarefaSubmitModal) {
      console.error('CTTarefaSubmitModal not loaded');
      return;
    }
    var S = Trilha.State;
    window.CTTarefaSubmitModal.open({
      item: item,
      clientSlug: S.clientSlug,
      turmaSlug: S.turmaSlug,
      token: S.token,
      onSubmitted: function () {
        // Refresh the action button to show the submitted state.
        injectActionButton(sub, item, opts || {});
      },
    });
  }

  function appendFlatActionRow(body, item) {
    var action = getItemAction(item);
    if (!action) return;

    var ICONS = Trilha.State.ICONS;
    var esc = Trilha.Utils.esc;

    var row = document.createElement('div');
    row.style.marginTop = '1.1rem';
    row.style.textAlign = 'right';

    var btn;
    if (action.kind === 'open') {
      btn = document.createElement('a');
      btn.href = action.url;
      btn.target = '_blank';
      btn.rel = 'noopener';
      btn.setAttribute('target', '_blank');
    } else {
      btn = document.createElement('button');
      btn.type = 'button';
    }
    btn.className = 'item-action';
    btn.classList.add('item-action');

    var labelHtml = '<span class="ia-label-full">' + esc(action.label) + '</span>';
    if (action.shortLabel) {
      labelHtml += '<span class="ia-label-short">' + esc(action.shortLabel) + '</span>';
    }
    btn.innerHTML = (ICONS[action.icon] || ICONS.copy) + labelHtml;

    btn.addEventListener('click', function (e) {
      if (e && e.stopPropagation) e.stopPropagation();
      if (action.kind === 'copy') {
        if (e && e.preventDefault) e.preventDefault();
        Trilha.Utils.copyToClipboard(action.text, btn);
      }
    });
    row.appendChild(btn);
    body.appendChild(row);
  }

  Trilha.Actions = {
    getMeta: getMeta,
    getItemAction: getItemAction,
    injectActionButton: injectActionButton,
    openTarefaSubmit: openTarefaSubmit,
    appendFlatActionRow: appendFlatActionRow,
  };
})();
