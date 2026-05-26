'use strict';

// Trilha.Page -- orchestrator. Boots State, fetches the turma view, mounts
// the hero/tabs, and routes hash changes between the three panels.
// Auto-init on DOMContentLoaded; tests call Trilha.Page.init() directly.

(function () {
  var Trilha = window.Trilha = window.Trilha || {};

  function init() {
    Trilha.State.init();
    var S = Trilha.State;
    if (!S.clientSlug || !S.turmaSlug || !S.token) { Trilha.Utils.showError('link_invalid'); return; }
    loadTurma();
    Trilha.Aulas.wireMqMobile();
    window.addEventListener('hashchange', onHashChange);
  }

  async function loadTurma() {
    var S = Trilha.State;
    try {
      var data = await callWorker({
        action: 'ct_get_turma_view',
        client_slug: S.clientSlug,
        turma_slug: S.turmaSlug,
        token: S.token,
        _admin: S.isAdmin,
        _silent: true,
      });
      S.data = data;
      var loading = document.getElementById('tr-loading');
      var main = document.getElementById('tr-main');
      if (loading) loading.hidden = true;
      if (main) main.hidden = false;
      renderHero();
      renderHeaderActions();
      renderTabs();
      Trilha.Aulas.wireBackPill();
      onHashChange();
    } catch (err) {
      var code = (err && err.data && err.data.error) ? err.data.error : 'error';
      Trilha.Utils.showError(code === 'not_found' || code === 'forbidden' || code === 'unauthorized' ? 'link_invalid' : 'error');
    }
  }

  function renderHero() {
    var S = Trilha.State;
    var esc = Trilha.Utils.esc;
    var data = S.data || {};
    var client = data.client || {};
    var turma = data.turma || {};

    var nameEl = document.getElementById('tr-client-name');
    var turmaEl = document.getElementById('tr-turma-name');
    var avatarEl = document.getElementById('tr-client-avatar');
    var iconEl = document.getElementById('tr-client-icon');

    if (nameEl) nameEl.textContent = client.display_name || '';
    if (turmaEl) turmaEl.textContent = turma.display_name || turma.name || S.turmaSlug;

    if (client.icon_path && avatarEl && iconEl) {
      var src = client.icon_path.match(/^https?:\/\//)
        ? client.icon_path
        : (typeof WORKER_URL !== 'undefined' ? WORKER_URL : window.WORKER_URL) + '/r2/' + client.icon_path;
      iconEl.src = src;
      iconEl.alt = client.display_name || '';
      iconEl.hidden = false;
      avatarEl.style.background = 'var(--background)';
    } else if (avatarEl) {
      var name = client.display_name || '';
      var initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase();
      avatarEl.innerHTML = initials
        ? '<span style="color:#fff;font-weight:800;font-size:1.6rem;">' + esc(initials) + '</span>'
        : '';
    }

    var titleBase = turma.display_name || turma.name;
    if (titleBase) document.title = titleBase + ' · PensoIA';
  }

  // Inject the WhatsApp group pill into pensoia-header .ph-right when the
  // turma has whatsapp_url. The classpulse session-code pill is gone since
  // Bundle H; the answer experience lives in /trilha via trilha-nexo.
  function renderHeaderActions() {
    var data = Trilha.State.data || {};
    var turma = data.turma || {};
    if (!turma.whatsapp_url) return;

    function tryInject(attempt) {
      attempt = attempt || 0;
      var header = document.querySelector('pensoia-header');
      var phRight = header && header.querySelector('.ph-right');
      if (!phRight) {
        if (attempt < 20) setTimeout(function () { tryInject(attempt + 1); }, 100);
        return;
      }
      if (header.dataset.trActionsInjected) return;
      header.dataset.trActionsInjected = '1';

      var wa = document.createElement('a');
      wa.className = 'ph-action-btn';
      wa.classList.add('ph-action-btn');
      wa.href = turma.whatsapp_url;
      wa.target = '_blank';
      wa.rel = 'noopener';
      wa.title = 'Grupo no WhatsApp';
      wa.innerHTML = Trilha.State.WA_ICON + '<span>Grupo no WhatsApp</span>';
      if (phRight.insertBefore) phRight.insertBefore(wa, phRight.children && phRight.children[0] || null);
      else phRight.appendChild(wa);
    }
    tryInject();
  }

  function renderTabs() {
    var data = Trilha.State.data || {};
    var items = data.items || [];
    var outros = items.filter(function (it) {
      return it.aula_number == null && it.set_id == null && it.type !== 'tarefa';
    });
    var apostilaSet = data.apostila_set;
    var apostilaCount = apostilaSet ? items.filter(function (it) { return it.set_id === apostilaSet.id; }).length : 0;

    var outrosBtn = document.getElementById('tr-tab-outros');
    var apostilaBtn = document.getElementById('tr-tab-apostila');

    if (outrosBtn) {
      if (outros.length) outrosBtn.textContent = 'Outros materiais (' + outros.length + ')';
      outrosBtn.hidden = !outros.length;
    }
    if (apostilaBtn) {
      apostilaBtn.hidden = !apostilaCount;
    }

    var tabsContainer = document.getElementById('tr-tabs');
    if (!tabsContainer) return;
    tabsContainer.querySelectorAll('.tr-tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tab = btn.dataset.tab;
        window.location.hash = '#' + tab;
        // matchMedia is reactive in the browser; in node tests we don't dispatch hashchange
        // automatically, so call onHashChange explicitly when the hash assignment is a no-op.
        if (typeof window.dispatchEvent === 'function' && window.dispatchEvent.length === 0) {
          // best-effort, ignored if not wired
        }
      });
    });
  }

  function onHashChange() {
    var hash = (window.location.hash || '#aulas').replace(/^#/, '');
    if (hash !== 'aulas' && hash !== 'apostila' && hash !== 'outros') hash = 'aulas';
    showTab(hash);
  }

  function showTab(name) {
    ['aulas', 'apostila', 'outros'].forEach(function (p) {
      var el = document.getElementById('tr-panel-' + p);
      if (el) el.hidden = (p !== name);
    });
    document.querySelectorAll('.tr-tab-btn').forEach(function (btn) {
      var active = btn.dataset.tab === name;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    var S = Trilha.State;
    if (name === 'aulas' && !S.rendered.aulas) { Trilha.Aulas.renderAulas(); S.rendered.aulas = true; }
    if (name === 'apostila' && !S.rendered.apostila) { Trilha.Flat.renderApostilaTab(); S.rendered.apostila = true; }
    if (name === 'outros' && !S.rendered.outros) { Trilha.Flat.renderOutrosTab(); S.rendered.outros = true; }
  }

  Trilha.Page = {
    init: init,
    loadTurma: loadTurma,
    renderHero: renderHero,
    renderHeaderActions: renderHeaderActions,
    renderTabs: renderTabs,
    onHashChange: onHashChange,
    showTab: showTab,
  };

  document.addEventListener('DOMContentLoaded', init);
})();
