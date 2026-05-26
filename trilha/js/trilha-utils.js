'use strict';

// Trilha.Utils -- pure helpers + a couple of DOM-side conveniences.
// No state lives here; functions read Trilha.State when they need a slug.

(function () {
  var Trilha = window.Trilha = window.Trilha || {};

  function esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtDate(iso) {
    if (!iso) return '';
    var p = String(iso).split('-');
    if (p.length < 3) return String(iso);
    return p[2].replace(/^0/, '') + '/' + p[1].replace(/^0/, '');
  }

  function aulaDateText(aula) {
    if (aula.happened_on) return 'ocorreu em ' + fmtDate(aula.happened_on);
    var today = new Date().toISOString().slice(0, 10);
    if (aula.rescheduled_from && aula.scheduled_for && aula.scheduled_for > today) {
      return 'remarcada (era ' + fmtDate(aula.rescheduled_from) + ', agora ' + fmtDate(aula.scheduled_for) + ')';
    }
    if (aula.scheduled_for) {
      if (aula.scheduled_for > today) return 'agendada para ' + fmtDate(aula.scheduled_for);
      return fmtDate(aula.scheduled_for);
    }
    return 'a definir';
  }

  function aulaStatus(aula) {
    if (aula.happened_on) return 'done';
    var today = new Date().toISOString().slice(0, 10);
    if (aula.scheduled_for && aula.scheduled_for > today) return 'upcoming';
    if (aula.scheduled_for && aula.scheduled_for <= today) return 'done';
    return 'und';
  }

  function parseTopics(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(function (t) { return String(t).trim(); }).filter(Boolean);
    try {
      var parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(function (t) { return String(t).trim(); }).filter(Boolean);
    } catch (_) {}
    return String(raw).split(',').map(function (t) { return t.trim(); }).filter(Boolean);
  }

  function tarefaSubmittedKey(itemId) {
    return 'ct_tarefa_submitted_' + itemId + '_' + Trilha.State.turmaSlug;
  }

  function hasSubmittedTarefa(itemId) {
    try { return localStorage.getItem(tarefaSubmittedKey(itemId)) != null; }
    catch (_) { return false; }
  }

  function copyToClipboard(text, btn) {
    var ICONS = Trilha.State.ICONS;
    function flash() {
      var orig = btn.innerHTML;
      btn.classList.add('is-done');
      btn.innerHTML = ICONS.check + '<span>Copiado</span>';
      setTimeout(function () {
        btn.classList.remove('is-done');
        btn.innerHTML = orig;
      }, 1800);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(flash).catch(function () { copyFallback(text); flash(); });
    } else {
      copyFallback(text);
      flash();
    }
  }

  function copyFallback(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (_) {}
    document.body.removeChild(ta);
  }

  function showError(code) {
    var loading = document.getElementById('tr-loading');
    if (loading) loading.hidden = true;
    var errorEl = document.getElementById('tr-error');
    if (!errorEl) return;
    errorEl.hidden = false;
    var msgEl = errorEl.querySelector('.tr-error-msg');
    if (msgEl) {
      msgEl.textContent = code === 'link_invalid'
        ? 'Link inválido ou expirado. Verifique o endereço com seu professor(a).'
        : 'Erro ao carregar o conteúdo. Tente novamente em instantes.';
    }
  }

  Trilha.Utils = {
    esc: esc,
    fmtDate: fmtDate,
    aulaDateText: aulaDateText,
    aulaStatus: aulaStatus,
    parseTopics: parseTopics,
    tarefaSubmittedKey: tarefaSubmittedKey,
    hasSubmittedTarefa: hasSubmittedTarefa,
    copyToClipboard: copyToClipboard,
    copyFallback: copyFallback,
    showError: showError,
  };
})();
