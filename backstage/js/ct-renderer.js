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

  // --- 'guide' ---
  // Renders body_md as markdown. If meta_json.platform_tabs has more than one
  // platform, a tab switcher is rendered above the body to swap content.
  // platform_tabs shape: { windows: "...", mac: "...", linux: "..." }
  // All keys are optional; omitted keys are not shown as tabs.
  function renderGuide(item, container, opts) {
    opts = opts || {};
    var isPreview = !!opts.preview;
    var meta = item.meta_json || {};
    var tabs = meta.platform_tabs || null;
    var tabKeys = tabs ? Object.keys(tabs).filter(function(k) { return tabs[k]; }) : [];
    var hasMultipleTabs = tabKeys.length > 1;

    container.innerHTML = '<div class="ctr-loading">Carregando...</div>';
    _loadMarked(function() {
      var tabLabels = { windows: 'Windows', mac: 'Mac', linux: 'Linux' };

      if (hasMultipleTabs) {
        var tabNav = tabKeys.map(function(k, i) {
          return '<button class="ctr-tab-btn' + (i === 0 ? ' ctr-tab-active' : '') + '" data-tab="' + _esc(k) + '">' + _esc(tabLabels[k] || k) + '</button>';
        }).join('');

        var tabPanels = tabKeys.map(function(k, i) {
          var html = window.marked.parse(tabs[k] || '');
          return '<div class="ctr-tab-panel' + (i === 0 ? '' : ' ctr-hidden') + '" data-panel="' + _esc(k) + '">' +
            '<div class="ctr-prompt-body">' + html + '</div>' +
            '</div>';
        }).join('');

        container.innerHTML =
          '<div class="ctr-tab-nav">' + tabNav + '</div>' +
          tabPanels;

        var btns = container.querySelectorAll('.ctr-tab-btn');
        btns.forEach(function(btn) {
          btn.addEventListener('click', function() {
            btns.forEach(function(b) { b.classList.remove('ctr-tab-active'); });
            btn.classList.add('ctr-tab-active');
            var key = btn.getAttribute('data-tab');
            container.querySelectorAll('.ctr-tab-panel').forEach(function(p) {
              if (p.getAttribute('data-panel') === key) {
                p.classList.remove('ctr-hidden');
              } else {
                p.classList.add('ctr-hidden');
              }
            });
          });
        });
      } else {
        var md = (hasMultipleTabs ? tabs[tabKeys[0]] : item.body_md) || '';
        var html = window.marked.parse(md);
        container.innerHTML = '<div class="ctr-prompt-body">' + html + '</div>';
      }
    });
  }

  // --- 'material' ---
  // Renders body_md as markdown. If meta_json.attachment_url is set:
  //   - image extensions: renders <img> below the body.
  //   - other: renders a "Baixar arquivo" link below the body.
  // Affordance: "Baixar arquivo" button top-right (only when attachment_url set).
  function renderMaterial(item, container, opts) {
    opts = opts || {};
    var isPreview = !!opts.preview;
    var meta = item.meta_json || {};
    var url = meta.attachment_url || '';
    var isImage = url && /\.(png|jpg|jpeg|webp)$/i.test(url);

    container.innerHTML = '<div class="ctr-loading">Carregando...</div>';
    _loadMarked(function() {
      var md = item.body_md || '';
      var bodyHtml = window.marked.parse(md);

      var attachmentHtml = '';
      if (url) {
        if (isImage) {
          attachmentHtml = '<div class="ctr-attachment-img"><img src="' + _esc(url) + '" alt="Anexo"></div>';
        } else {
          attachmentHtml = '<div class="ctr-attachment-link"><a href="' + _esc(url) + '" target="_blank" rel="noopener" class="ctr-dl-link">Baixar arquivo</a></div>';
        }
      }

      var affordanceBtn = (!isPreview && url)
        ? '<a href="' + _esc(url) + '" target="_blank" rel="noopener" class="ctr-affordance-btn">Baixar arquivo</a>'
        : '';

      container.innerHTML =
        '<div class="ctr-affordance-row">' + affordanceBtn + '</div>' +
        '<div class="ctr-prompt-body">' + bodyHtml + '</div>' +
        attachmentHtml;
    });
  }

  // --- 'paper' ---
  // Structured layout for academic/reference papers.
  // meta_json fields: authors (string), year (number), abstract (string), pdf_url (string).
  // body_md is optional supplementary content rendered after the PDF embed.
  // Affordance: "Baixar PDF" button top-right (when pdf_url set).
  function renderPaper(item, container, opts) {
    opts = opts || {};
    var isPreview = !!opts.preview;
    var meta = item.meta_json || {};
    var authors = meta.authors || '';
    var year = meta.year || '';
    var abstract = meta.abstract || '';
    var pdfUrl = meta.pdf_url || '';
    var md = item.body_md || '';

    var affordanceBtn = (!isPreview && pdfUrl)
      ? '<a href="' + _esc(pdfUrl) + '" target="_blank" rel="noopener" class="ctr-affordance-btn">Baixar PDF</a>'
      : '';

    var metaLine = (authors || year)
      ? '<p class="ctr-paper-meta">' + _esc(authors) + (authors && year ? ', ' : '') + _esc(String(year)) + '</p>'
      : '';

    var abstractHtml = abstract
      ? '<p class="ctr-paper-abstract">' + _esc(abstract) + '</p>'
      : '';

    var embedHtml = pdfUrl
      ? '<div class="ctr-pdf-embed">' +
          '<object data="' + _esc(pdfUrl) + '" type="application/pdf" class="ctr-pdf-object">' +
            '<a href="' + _esc(pdfUrl) + '" target="_blank" rel="noopener" class="ctr-dl-link">Baixar PDF</a>' +
          '</object>' +
        '</div>'
      : '';

    if (md) {
      container.innerHTML = '<div class="ctr-loading">Carregando...</div>';
      _loadMarked(function() {
        var suppHtml = window.marked.parse(md);
        container.innerHTML =
          '<div class="ctr-affordance-row">' + affordanceBtn + '</div>' +
          metaLine +
          abstractHtml +
          embedHtml +
          '<div class="ctr-paper-supplement ctr-prompt-body">' + suppHtml + '</div>';
      });
    } else {
      container.innerHTML =
        '<div class="ctr-affordance-row">' + affordanceBtn + '</div>' +
        metaLine +
        abstractHtml +
        embedHtml;
    }
  }

  // --- 'model_info' ---
  // Structured card for AI model reference entries.
  // meta_json fields: provider (string), model_id (string),
  //   context_window (number or string), strengths (array of strings), doc_url (string).
  // No body_md.
  // Affordance: "Documentação" button top-right (when doc_url set).
  function renderModelInfo(item, container, opts) {
    opts = opts || {};
    var isPreview = !!opts.preview;
    var meta = item.meta_json || {};
    var provider = meta.provider || '';
    var modelId = meta.model_id || '';
    var contextWindow = meta.context_window != null ? String(meta.context_window) : '';
    var strengths = Array.isArray(meta.strengths) ? meta.strengths : [];
    var docUrl = meta.doc_url || '';

    var affordanceBtn = (!isPreview && docUrl)
      ? '<a href="' + _esc(docUrl) + '" target="_blank" rel="noopener" class="ctr-affordance-btn">Documentação</a>'
      : '';

    var badgesHtml =
      (provider ? '<span class="ctr-badge ctr-badge-provider">' + _esc(provider) + '</span>' : '') +
      (modelId ? '<span class="ctr-badge ctr-badge-model">' + _esc(modelId) + '</span>' : '');

    var contextHtml = contextWindow
      ? '<span class="ctr-pill ctr-pill-context">Contexto: ' + _esc(contextWindow) + '</span>'
      : '';

    var strengthsHtml = strengths.length
      ? '<ul class="ctr-strengths-list">' +
          strengths.map(function(s) { return '<li>' + _esc(s) + '</li>'; }).join('') +
        '</ul>'
      : '';

    var docLinkHtml = docUrl
      ? '<a href="' + _esc(docUrl) + '" target="_blank" rel="noopener" class="ctr-doc-link-btn">Documentação oficial</a>'
      : '';

    container.innerHTML =
      '<div class="ctr-affordance-row">' + affordanceBtn + '</div>' +
      '<div class="ctr-model-badges">' + badgesHtml + '</div>' +
      (contextHtml ? '<div class="ctr-model-context">' + contextHtml + '</div>' : '') +
      (strengthsHtml ? '<div class="ctr-model-strengths">' + strengthsHtml + '</div>' : '') +
      (docLinkHtml ? '<div class="ctr-model-doc">' + docLinkHtml + '</div>' : '');
  }

  // --- 'google_doc' (legacy fallback) ---
  // Items that were created under the old iframe plan now carry ingested markdown
  // in body_md. Render exactly like 'material' but without attachment logic,
  // since google_doc items have no attachment_url by convention.
  // NO iframe is rendered.
  function renderGoogleDoc(item, container, opts) {
    var materialItem = {
      body_md: item.body_md,
      meta_json: {}          // no attachment_url, no affordance btn
    };
    renderMaterial(materialItem, container, opts);
  }

  function render(item, container, opts) {
    if (!item || !container) return;
    if (item.type === 'prompt')      return renderPrompt(item, container, opts);
    if (item.type === 'guide')       return renderGuide(item, container, opts);
    if (item.type === 'material')    return renderMaterial(item, container, opts);
    if (item.type === 'paper')       return renderPaper(item, container, opts);
    if (item.type === 'model_info')  return renderModelInfo(item, container, opts);
    if (item.type === 'google_doc')  return renderGoogleDoc(item, container, opts);
    return renderMarkdown(item, container, opts);
  }

  return { render: render };
})();
