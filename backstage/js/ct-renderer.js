'use strict';

// Type-dispatched item renderer for ClassTrail.
// Used by admin (live preview) and public student page.
window.CTRenderer = (function() {

  var _markedLoading = false;
  var _markedCallbacks = [];

  function _loadMarked(cb) {
    if (window.marked) { cb(); return; }
    _markedCallbacks.push(cb);
    if (_markedLoading) return;
    _markedLoading = true;
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
    s.onload = function() {
      _markedCallbacks.forEach(function(fn) { fn(); });
      _markedCallbacks = [];
    };
    document.head.appendChild(s);
  }

  function _esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // Prompt items must NEVER be parsed as Markdown — every character is
  // part of the instruction the student will copy-paste into an AI.
  function renderPrompt(item, container, opts) {
    opts = opts || {};
    var isPreview = !!opts.preview;
    var md = item.body_md || '';
    var copyBtn = isPreview ? '' : '<button class="ctr-copy-btn">Copiar</button>';
    container.innerHTML =
      '<div class="ctr-prompt-verbatim">' + _esc(md) + '</div>' +
      copyBtn;
    if (!isPreview) {
      var btn = container.querySelector('.ctr-copy-btn');
      if (btn) btn.addEventListener('click', function() { _copyText(md, btn); });
    }
  }

  // Other types render with marked.js (markdown → HTML).
  function renderMarkdown(item, container, opts) {
    opts = opts || {};
    var isPreview = !!opts.preview;
    var md = item.body_md || '';
    container.innerHTML = '<div class="ctr-loading">Carregando...</div>';
    _loadMarked(function() {
      var html = window.marked.parse(md);
      var copyBtn = isPreview ? '' : '<button class="ctr-copy-btn">Copiar</button>';
      container.innerHTML =
        '<div class="ctr-prompt-body">' + html + '</div>' +
        copyBtn;
      if (!isPreview) {
        var btn = container.querySelector('.ctr-copy-btn');
        if (btn) btn.addEventListener('click', function() { _copyText(md, btn); });
      }
    });
  }

  function _copyText(text, btn) {
    function flash() {
      btn.textContent = 'Copiado!';
      setTimeout(function() { btn.textContent = 'Copiar'; }, 2000);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(flash).catch(function() { _copyFallback(text); flash(); });
    } else {
      _copyFallback(text);
      flash();
    }
  }

  function _copyFallback(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (_) {}
    document.body.removeChild(ta);
  }

  function render(item, container, opts) {
    if (!item || !container) return;
    if (item.type === 'prompt') return renderPrompt(item, container, opts);
    return renderMarkdown(item, container, opts);
  }

  return { render: render };
})();
