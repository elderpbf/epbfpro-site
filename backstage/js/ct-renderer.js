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

  function renderPrompt(item, container, opts) {
    opts = opts || {};
    var isPreview = !!opts.preview;
    var md = item.body_md || '';
    container.innerHTML = '<div class="ctr-loading">Carregando...</div>';
    _loadMarked(function() {
      var html = window.marked.parse(md);
      var copyBtn = isPreview ? '' :
        '<button class="ctr-copy-btn">Copiar</button>';
      container.innerHTML =
        '<div class="ctr-prompt-body">' + html + '</div>' +
        copyBtn;
      if (!isPreview) {
        var btn = container.querySelector('.ctr-copy-btn');
        if (btn) btn.addEventListener('click', function() {
          navigator.clipboard.writeText(md).then(function() {
            btn.textContent = 'Copiado!';
            setTimeout(function() { btn.textContent = 'Copiar'; }, 2000);
          }).catch(function() {
            var ta = document.createElement('textarea');
            ta.value = md;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            btn.textContent = 'Copiado!';
            setTimeout(function() { btn.textContent = 'Copiar'; }, 2000);
          });
        });
      }
    });
  }

  function render(item, container, opts) {
    if (!item || !container) return;
    if (item.type === 'prompt') return renderPrompt(item, container, opts);
    container.innerHTML = '<div class="ctr-unsupported">Tipo de item não suportado: ' + _esc(item.type) + '</div>';
  }

  return { render: render };
})();
