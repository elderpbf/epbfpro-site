'use strict';

// CTLabsPanel — renders the Conteúdo > Labs subtab.
// Lists every lab from CVLabs.LABS with an on/off toggle + Preview button.
// On/off state lives in localStorage 'cv_labs_enabled' (a map keyed by lab
// key, missing/true = enabled, false = hidden everywhere). Filtering is
// done at READ-time by every consumer (ClassVault Aula list, future Trilha
// renderer, etc.) so disabling is instant and reversible.
//
// Self-mounts on DOMContentLoaded when #panel-labs exists.
window.CTLabsPanel = (function () {

  var LS_KEY = 'cv_labs_enabled';
  var _mounted = false;

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function _readMap() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return {};
      var obj = JSON.parse(raw);
      return obj && typeof obj === 'object' ? obj : {};
    } catch (e) { return {}; }
  }

  function _writeMap(map) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(map)); } catch (e) {}
  }

  function isEnabled(key) {
    var map = _readMap();
    return map[key] !== false;
  }

  function setEnabled(key, on) {
    var map = _readMap();
    if (on) {
      // Default-on state is "key absent", so clear instead of writing true.
      delete map[key];
    } else {
      map[key] = false;
    }
    _writeMap(map);
  }

  function _injectStylesOnce() {
    if (document.getElementById('ct-labs-panel-styles')) return;
    var css =
      '#panel-labs{padding:1rem 1.4rem 2rem;}' +
      '.ct-labs-head{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:1rem;flex-wrap:wrap;}' +
      '.ct-labs-head h2{margin:0;font-size:1.4rem;color:var(--text-primary);}' +
      '.ct-labs-head-hint{color:var(--text-secondary);font-size:0.95rem;max-width:560px;}' +
      '.ct-labs-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:0.9rem;}' +
      '.ct-lab-card{background:var(--surface);border:1.5px solid var(--border);border-radius:12px;padding:0.9rem 1rem;display:flex;flex-direction:column;gap:0.5rem;transition:opacity 200ms;}' +
      '.ct-lab-card.is-off{opacity:0.55;}' +
      '.ct-lab-row{display:flex;align-items:center;justify-content:space-between;gap:0.6rem;}' +
      '.ct-lab-key{font-family:var(--font-mono,ui-monospace,monospace);font-size:0.8rem;color:var(--text-secondary);letter-spacing:0.06em;text-transform:uppercase;}' +
      '.ct-lab-title{font-size:1.1rem;font-weight:700;color:var(--text-primary);margin:0;line-height:1.2;}' +
      '.ct-lab-summary{font-size:0.9rem;color:var(--text-secondary);margin:0;line-height:1.35;}' +
      '.ct-lab-actions{display:flex;align-items:center;justify-content:space-between;gap:0.5rem;margin-top:0.3rem;}' +
      '.ct-lab-preview{font:inherit;font-size:0.85rem;font-weight:600;padding:0.4rem 0.9rem;border-radius:999px;background:rgba(20,184,166,0.16);border:1.5px solid var(--primary,#14b8a6);color:var(--primary,#14b8a6);cursor:pointer;transition:background 160ms;}' +
      '.ct-lab-preview:hover{background:rgba(20,184,166,0.28);}' +
      '.ct-lab-switch{position:relative;width:44px;height:24px;display:inline-block;flex-shrink:0;cursor:pointer;}' +
      '.ct-lab-switch input{opacity:0;width:0;height:0;}' +
      '.ct-lab-switch-track{position:absolute;inset:0;border-radius:999px;background:color-mix(in srgb,var(--text-primary) 18%,transparent);transition:background 160ms;}' +
      '.ct-lab-switch-thumb{position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:left 160ms,background 160ms;box-shadow:0 1px 3px rgba(0,0,0,0.25);}' +
      '.ct-lab-switch input:checked + .ct-lab-switch-track{background:var(--primary,#14b8a6);}' +
      '.ct-lab-switch input:checked + .ct-lab-switch-track .ct-lab-switch-thumb{left:23px;}';
    var style = document.createElement('style');
    style.id = 'ct-labs-panel-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function _renderCard(lab) {
    var on = isEnabled(lab.key);
    return (
      '<div class="ct-lab-card' + (on ? '' : ' is-off') + '" data-lab-key="' + _esc(lab.key) + '">' +
        '<div class="ct-lab-row">' +
          '<span class="ct-lab-key">Lab · ' + _esc(lab.key.toUpperCase()) + '</span>' +
          '<label class="ct-lab-switch" title="Ativar / desativar">' +
            '<input type="checkbox" class="ct-lab-switch-input"' + (on ? ' checked' : '') + ' />' +
            '<span class="ct-lab-switch-track"><span class="ct-lab-switch-thumb"></span></span>' +
          '</label>' +
        '</div>' +
        '<h3 class="ct-lab-title">' + _esc(lab.title) + '</h3>' +
        (lab.summary ? '<p class="ct-lab-summary">' + _esc(lab.summary) + '</p>' : '') +
        '<div class="ct-lab-actions">' +
          '<button type="button" class="ct-lab-preview" data-action="preview">Pré-visualizar</button>' +
        '</div>' +
      '</div>'
    );
  }

  function render(panel) {
    if (!window.CVLabs || !CVLabs.LABS) {
      panel.innerHTML = '<div class="ct-empty">Registry CVLabs indisponível.</div>';
      return;
    }
    var labs = CVLabs.LABS;
    var cardsHtml = labs.map(_renderCard).join('');
    panel.innerHTML =
      '<div class="ct-labs-head">' +
        '<div>' +
          '<h2>Labs</h2>' +
          '<div class="ct-labs-head-hint">' +
            'Ative ou desative cada lab. Desativados ficam invisíveis em Aula e Trilha (mesmo se já liberados). Clique em "Pré-visualizar" para abrir em tela cheia.' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="ct-labs-grid">' + cardsHtml + '</div>';
  }

  function _onPanelClick(e) {
    var card = e.target.closest('.ct-lab-card');
    if (!card) return;
    var key = card.getAttribute('data-lab-key');
    if (!key) return;

    var previewBtn = e.target.closest('[data-action="preview"]');
    if (previewBtn) {
      e.preventDefault();
      var lab = CVLabs.LABS.find(function (l) { return l.key === key; });
      if (window.CVLabViewer && typeof CVLabViewer.openModal === 'function') {
        CVLabViewer.openModal({ key: key, title: lab && lab.title });
      } else {
        window.open('/backstage/labs/' + encodeURIComponent(key) + '/', '_blank');
      }
      return;
    }
  }

  function _onPanelChange(e) {
    var input = e.target.closest('.ct-lab-switch-input');
    if (!input) return;
    var card = input.closest('.ct-lab-card');
    if (!card) return;
    var key = card.getAttribute('data-lab-key');
    if (!key) return;
    setEnabled(key, input.checked);
    card.classList.toggle('is-off', !input.checked);
  }

  function mount() {
    if (_mounted) return;
    var panel = document.getElementById('panel-labs');
    if (!panel) return;
    _mounted = true;
    _injectStylesOnce();
    render(panel);
    panel.addEventListener('click', _onPanelClick);
    panel.addEventListener('change', _onPanelChange);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }

  return {
    mount: mount,
    isEnabled: isEnabled,
    setEnabled: setEnabled
  };
})();
