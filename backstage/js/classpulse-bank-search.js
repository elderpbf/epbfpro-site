(function () {
  var _cfg = null;
  var searchQuery = '';
  var searchDebounceTimer = null;

  function clearSearch() {
    searchQuery = '';
    clearTimeout(searchDebounceTimer);
    document.getElementById('bank-search-input').value = '';
    document.getElementById('bank-search-clear').style.display = 'none';
    document.getElementById('search-results-wrap').hidden = true;
    _cfg.onClearSearch();
  }

  async function doSearch(query) {
    searchQuery = query;
    document.getElementById('bank-empty-state').hidden = true;
    document.getElementById('question-list-wrap').hidden = true;
    var wrap = document.getElementById('search-results-wrap');
    wrap.hidden = false;
    var list = document.getElementById('search-results-list');
    list.innerHTML = '<div class="cp-empty"><p>Buscando...</p></div>';
    try {
      var data = await _cfg.callWorker({ action: 'search_questions', auth_token: _cfg.getAuthToken(), q: query });
      renderSearchResults(data.questions || [], query);
    } catch (e) {
      list.innerHTML = '<div class="cp-empty"><p>Erro: ' + _cfg.escHtml(e.message) + '</p></div>';
    }
  }

  function renderSearchResults(results, query) {
    document.getElementById('search-results-count').textContent =
      results.length + ' resultado' + (results.length === 1 ? '' : 's') + ' para "' + _cfg.escHtml(query) + '"';
    var list = document.getElementById('search-results-list');
    list.innerHTML = '';
    if (results.length === 0) {
      list.innerHTML = '<div class="cp-empty"><div class="cp-empty-icon">🔍</div><p>Nenhuma questão encontrada.</p></div>';
      return;
    }
    results.forEach(function (q) {
      var card = document.createElement('div');
      card.className = 'cp-question-card cp-search-result';

      var setBadge = document.createElement('div');
      setBadge.className = 'cp-search-result-set';
      setBadge.textContent = q.list_name;
      card.appendChild(setBadge);

      var qText = document.createElement('div');
      qText.className = 'cp-question-text'; qText.textContent = q.question;
      card.appendChild(qText);

      var footer = document.createElement('div');
      footer.className = 'cp-question-footer';
      var typeBadge = document.createElement('span');
      typeBadge.className = 'cp-question-set-tag';
      typeBadge.style.cssText = 'margin-right:auto;background:rgba(20,184,166,.1);color:var(--primary)';
      typeBadge.textContent = q.type || 'mc';
      var gotoBtn = document.createElement('button');
      gotoBtn.className = 'cp-btn-ghost';
      gotoBtn.style.cssText = 'font-size:0.75rem;padding:0.3rem 0.7rem';
      gotoBtn.textContent = 'Ir ao conjunto';
      gotoBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        clearSearch();
        _cfg.onNavigate(q.list_name);
      });
      footer.appendChild(typeBadge); footer.appendChild(gotoBtn);
      card.appendChild(footer);

      card.addEventListener('click', function () { clearSearch(); _cfg.onNavigate(q.list_name); });
      list.appendChild(card);
    });
  }

  function init(cfg) {
    _cfg = cfg;

    document.getElementById('bank-search-input').addEventListener('input', function () {
      var val = this.value;
      document.getElementById('bank-search-clear').style.display = val.length > 0 ? '' : 'none';
      clearTimeout(searchDebounceTimer);
      if (val.trim().length < 2) { if (searchQuery) clearSearch(); return; }
      searchDebounceTimer = setTimeout(function () { doSearch(val.trim()); }, 300);
    });

    document.getElementById('bank-search-clear').addEventListener('click', clearSearch);
  }

  window.BankSearch = {
    init: init,
    clear: clearSearch
  };
})();
