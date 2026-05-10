'use strict';

(function() {

  // ── URL parsing ──────────────────────────────────────────────────────────
  var _params      = new URLSearchParams(window.location.search);
  var _clientSlug  = _params.get('c');
  var _turmaSlug   = _params.get('t');
  var _token       = _params.get('k');

  // Fallback: parse /trilha/<client>/<turma> from pathname
  if (!_clientSlug || !_turmaSlug) {
    var _parts = window.location.pathname.replace(/^\/trilha\/?/, '').replace(/\/$/, '').split('/');
    if (_parts.length >= 2 && _parts[0]) {
      _clientSlug = _parts[0];
      _turmaSlug  = _parts[1] || null;
    }
  }

  // ── State ────────────────────────────────────────────────────────────────
  var _data             = null; // full worker response
  var _outrosTypeFilter = null;

  // ── Entry ────────────────────────────────────────────────────────────────
  // Theme is initialized in <head> (initPublic) and the toggle is wired by
  // <pensoia-header> via ThemeManager.init() when the custom element upgrades.
  function init() {
    if (!_clientSlug || !_turmaSlug || !_token) { _showError('link_invalid'); return; }
    _loadTurma();
    window.addEventListener('hashchange', _onHashChange);
  }

  async function _loadTurma() {
    try {
      _data = await callWorker({
        action:      'ct_get_turma_view',
        client_slug: _clientSlug,
        turma_slug:  _turmaSlug,
        token:       _token,
        _silent: true
      });

      document.getElementById('tr-loading').hidden = true;
      document.getElementById('tr-main').hidden    = false;

      _renderHero();
      _renderActionBand();
      _renderTabs();
      _onHashChange(); // honour any initial hash (e.g. bookmark to #aula-2)

    } catch (err) {
      var code = (err.data && err.data.error) ? err.data.error : 'error';
      _showError(code === 'not_found' || code === 'unauthorized' ? 'link_invalid' : 'error');
    }
  }

  // ── Hero ─────────────────────────────────────────────────────────────────
  function _renderHero() {
    var client = _data.client || {};
    var turma  = _data.turma  || {};

    var nameEl   = document.getElementById('tr-client-name');
    var turmaEl  = document.getElementById('tr-turma-name');
    var avatarEl = document.getElementById('tr-client-avatar');
    var iconEl   = document.getElementById('tr-client-icon');

    if (nameEl)  nameEl.textContent  = client.display_name || '';
    if (turmaEl) turmaEl.textContent = turma.display_name  || turma.name || _turmaSlug;

    if (client.icon_path && avatarEl && iconEl) {
      var src = client.icon_path.match(/^https?:\/\//)
        ? client.icon_path
        : '/r2/' + client.icon_path;
      iconEl.src = src;
      iconEl.alt = client.display_name || '';
      avatarEl.hidden = false;
    }

    var titleBase = turma.display_name || turma.name;
    if (titleBase) document.title = titleBase + ' · PensoIA';
  }

  // ── Action band ──────────────────────────────────────────────────────────
  function _renderActionBand() {
    var turma = _data.turma || {};

    var waBtn = document.getElementById('tr-btn-whatsapp');
    if (waBtn && turma.whatsapp_url) {
      waBtn.href   = turma.whatsapp_url;
      waBtn.hidden = false;
    }

    var cpBtn = document.getElementById('tr-btn-classpulse');
    if (cpBtn && turma.classpulse_session_id) {
      // ClassPulse student join URL: /go/index.html?code=<session_code>
      // Auto-fills the code input and focuses name field.
      cpBtn.href   = 'https://pensoia.com/go/?code=' + encodeURIComponent(turma.classpulse_session_id);
      cpBtn.hidden = false;
    }

    // If neither button is visible, hide the whole band.
    var band = document.getElementById('tr-action-band');
    if (band && waBtn && cpBtn && waBtn.hidden && cpBtn.hidden) {
      band.hidden = true;
    }
  }

  // ── Tabs ─────────────────────────────────────────────────────────────────
  function _renderTabs() {
    // Count "Outros materiais" items (no aula, no set)
    var items   = _data.items || [];
    var outros  = items.filter(function(it) { return it.aula_number == null && it.set_id == null; });
    var tabOtros = document.getElementById('tr-tab-outros');
    if (tabOtros) tabOtros.textContent = 'Outros materiais (' + outros.length + ')';

    document.getElementById('tr-tabs').querySelectorAll('.tr-tab-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var tab = btn.dataset.tab;
        var hash = tab === 'aulas' ? '#aulas' : '#' + tab;
        window.location.hash = hash;
      });
    });
  }

  // ── Hash routing ─────────────────────────────────────────────────────────
  function _onHashChange() {
    var hash = window.location.hash || '#aulas';

    var lessonMatch = hash.match(/^#aula-(\d+)(?:@(.+))?$/);
    if (lessonMatch) {
      var aulaNum  = parseInt(lessonMatch[1], 10);
      var scrollTo = lessonMatch[2] || null;
      _showLesson(aulaNum, scrollTo);
      return;
    }

    if (hash === '#apostila') { _showTab('apostila'); _renderApostila(); return; }
    if (hash === '#outros')   { _showTab('outros');   _renderOutros();   return; }
    // default: #aulas
    _showTab('aulas');
    _renderAulas();
  }

  function _showTab(name) {
    // Hide lesson panel and all tab panels
    ['aulas', 'apostila', 'outros', 'lesson'].forEach(function(p) {
      var el = document.getElementById('tr-panel-' + p);
      if (el) el.hidden = true;
    });

    var panel = document.getElementById('tr-panel-' + (name === 'lesson' ? 'lesson' : name));
    if (panel) panel.hidden = false;

    document.querySelectorAll('.tr-tab-btn').forEach(function(btn) {
      var active = btn.dataset.tab === (name === 'lesson' ? 'aulas' : name);
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  // ── Date helpers ─────────────────────────────────────────────────────────
  function _fmtDate(iso) {
    if (!iso) return '';
    var parts = iso.split('-');
    if (parts.length < 3) return iso;
    return parts[2].replace(/^0/, '') + '/' + parts[1];
  }

  function _aulaDateText(aula) {
    var happened    = aula.happened_on;
    var scheduled   = aula.scheduled_for;
    var rescheduled = aula.rescheduled_from;

    if (happened) return 'ocorreu em ' + _fmtDate(happened);

    var today = new Date().toISOString().split('T')[0];

    if (rescheduled && scheduled && scheduled > today) {
      return 'remarcada (era ' + _fmtDate(rescheduled) + ', agora ' + _fmtDate(scheduled) + ')';
    }

    if (scheduled) {
      if (scheduled > today) return 'agendada para ' + _fmtDate(scheduled);
      // past scheduled but no happened_on: treat as occurred
      return _fmtDate(scheduled);
    }

    return 'a definir';
  }

  // Status for card left band: 'done' | 'rescheduled' | 'upcoming' | 'undefined'
  function _aulaStatus(aula) {
    if (aula.happened_on) return 'done';
    var today = new Date().toISOString().split('T')[0];
    if (aula.rescheduled_from && aula.scheduled_for && aula.scheduled_for > today) return 'rescheduled';
    if (aula.scheduled_for && aula.scheduled_for > today) return 'upcoming';
    return 'undefined';
  }

  // ── Topics parsing ────────────────────────────────────────────────────────
  function _parseTopics(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(function(t) { return String(t).trim(); }).filter(Boolean);
    try {
      var parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(function(t) { return String(t).trim(); }).filter(Boolean);
    } catch (_) {}
    return String(raw).split(',').map(function(t) { return t.trim(); }).filter(Boolean);
  }

  // ── Aulas tab ─────────────────────────────────────────────────────────────
  function _renderAulas() {
    var container = document.getElementById('tr-aulas-list');
    if (!container || container.dataset.rendered) return;
    container.dataset.rendered = '1';

    var aulas = (_data.aulas || []).slice().sort(function(a, b) { return a.aula_number - b.aula_number; });
    var items = _data.items || [];

    if (!aulas.length) {
      container.innerHTML = '<div class="tr-empty">Nenhuma aula disponível ainda.</div>';
      return;
    }

    container.innerHTML = '';
    aulas.forEach(function(aula) {
      container.appendChild(_buildAulaCard(aula, items));
    });
  }

  function _buildAulaCard(aula, items) {
    var status   = _aulaStatus(aula);
    var dateText = _aulaDateText(aula);
    var topics   = _parseTopics(aula.topics_json);

    // Tarefa item lookup
    var tarefaItem = aula.tarefa_item_id
      ? items.find(function(it) { return it.id === aula.tarefa_item_id; })
      : null;

    var topicsHtml = topics.length
      ? '<div class="tr-aula-topics">' + topics.map(function(t) {
          return '<span class="tr-aula-topic">' + _esc(t) + '</span>';
        }).join('') + '</div>'
      : '';

    var tarefaHtml = tarefaItem
      ? '<div class="tr-aula-tarefa" role="button" tabindex="0" data-aula="' + aula.aula_number + '" data-item="' + _esc(String(tarefaItem.id)) + '">' +
          '<span class="tr-tarefa-label">Tarefa</span> ' +
          _esc(tarefaItem.title) +
        '</div>'
      : '';

    var card = document.createElement('div');
    card.className = 'tr-aula-card tr-aula-card--' + status;
    card.dataset.aula = aula.aula_number;

    card.innerHTML =
      '<div class="tr-aula-band">' +
        '<span class="tr-band-num">Aula ' + aula.aula_number + '</span>' +
        '<span class="tr-band-date">' + _esc(dateText) + '</span>' +
      '</div>' +
      '<div class="tr-aula-body">' +
        '<div class="tr-aula-title">' + _esc(aula.title) + '</div>' +
        topicsHtml +
        tarefaHtml +
      '</div>';

    // Click on tarefa pot: drill in AND highlight tarefa
    if (tarefaItem) {
      var tarefaEl = card.querySelector('.tr-aula-tarefa');
      tarefaEl.addEventListener('click', function(e) {
        e.stopPropagation();
        window.location.hash = '#aula-' + aula.aula_number + '@tarefa-' + tarefaItem.id;
      });
      tarefaEl.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tarefaEl.click(); }
      });
    }

    // Click anywhere else: drill in
    card.addEventListener('click', function(e) {
      if (e.target.closest('.tr-aula-tarefa')) return;
      window.location.hash = '#aula-' + aula.aula_number;
    });

    return card;
  }

  // ── Lesson view ───────────────────────────────────────────────────────────
  function _showLesson(aulaNum, scrollTarget) {
    _showTab('lesson');

    var lessonPanel = document.getElementById('tr-panel-lesson');
    if (!lessonPanel) return;

    // Clear previous content so re-navigation rerenders
    lessonPanel.querySelector('#tr-lesson-title').textContent   = '';
    lessonPanel.querySelector('#tr-lesson-date').textContent    = '';
    lessonPanel.querySelector('#tr-apostila-desta-aula').hidden = true;
    lessonPanel.querySelector('#tr-apostila-desta-aula-items').innerHTML = '';
    lessonPanel.querySelector('#tr-lesson-items').innerHTML     = '';

    var aulas = _data.aulas || [];
    var aula  = aulas.find(function(a) { return a.aula_number === aulaNum; });
    if (!aula) {
      lessonPanel.querySelector('#tr-lesson-title').textContent = 'Aula ' + aulaNum;
      return;
    }

    lessonPanel.querySelector('#tr-lesson-title').textContent = 'Aula ' + aula.aula_number + ': ' + aula.title;
    lessonPanel.querySelector('#tr-lesson-date').textContent  = _aulaDateText(aula);

    var items       = _data.items || [];
    var apostilaSet = _data.apostila_set;

    // Apostila desta aula: items in the apostila set for this aula, sorted by set_position
    var apostilaItems = apostilaSet
      ? items.filter(function(it) {
          return it.set_id === apostilaSet.id && it.aula_number === aulaNum;
        }).sort(function(a, b) { return (a.set_position || 0) - (b.set_position || 0); })
      : [];

    if (apostilaItems.length) {
      var apostilaBlock = lessonPanel.querySelector('#tr-apostila-desta-aula');
      var apostilaList  = lessonPanel.querySelector('#tr-apostila-desta-aula-items');
      apostilaBlock.hidden = false;
      apostilaItems.forEach(function(item) {
        var row = _buildItemRow(item);
        row.dataset.itemId = item.id;
        apostilaList.appendChild(row);
      });
    }

    // Other lesson items: aula_number matches AND not in the apostila set
    var apostilaSetId = apostilaSet ? apostilaSet.id : null;
    var lessonItems = items.filter(function(it) {
      if (it.aula_number !== aulaNum) return false;
      if (apostilaSetId !== null && it.set_id === apostilaSetId) return false;
      return true;
    }).sort(function(a, b) { return (a.position || 0) - (b.position || 0); });

    var lessonList = lessonPanel.querySelector('#tr-lesson-items');
    if (lessonItems.length) {
      lessonItems.forEach(function(item) {
        var row = _buildItemRow(item);
        row.dataset.itemId = item.id;
        // Mark tarefa for highlight
        if (aula.tarefa_item_id && item.id === aula.tarefa_item_id) {
          row.dataset.isTarefa = '1';
        }
        lessonList.appendChild(row);
      });
    } else if (!apostilaItems.length) {
      lessonList.innerHTML = '<div class="tr-empty">Nenhum conteúdo disponível nesta aula ainda.</div>';
    }

    // Scroll / highlight target
    // Accepts "tarefa-<id>" (from aula card tarefa pot) or "apostila-<id>" (from apostila tab)
    if (scrollTarget) {
      var itemIdMatch = scrollTarget.match(/^(?:tarefa|apostila)-(.+)$/);
      if (itemIdMatch) {
        var scrollItemId = itemIdMatch[1];
        setTimeout(function() {
          var el = Array.from(document.querySelectorAll('[data-item-id]')).find(function(n) {
            return n.dataset.itemId === String(scrollItemId);
          });
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('tr-highlight');
            setTimeout(function() { el.classList.remove('tr-highlight'); }, 2500);
          }
        }, 80);
      }
    }
  }

  // ── Apostila do curso tab ─────────────────────────────────────────────────
  function _renderApostila() {
    var container = document.getElementById('tr-apostila-content');
    if (!container || container.dataset.rendered) return;
    container.dataset.rendered = '1';

    var apostilaSet = _data.apostila_set;
    if (!apostilaSet) {
      container.innerHTML = '<div class="tr-empty">Nenhuma apostila disponível ainda.</div>';
      return;
    }

    var items  = _data.items || [];
    var aulas  = (_data.aulas || []).slice().sort(function(a, b) { return a.aula_number - b.aula_number; });

    var setItems = items.filter(function(it) { return it.set_id === apostilaSet.id; });

    // Group by aula, only aulas with at least one section
    var rendered = false;
    aulas.forEach(function(aula) {
      var aulaItems = setItems.filter(function(it) { return it.aula_number === aula.aula_number; })
        .sort(function(a, b) { return (a.set_position || 0) - (b.set_position || 0); });
      if (!aulaItems.length) return;

      rendered = true;
      var group = document.createElement('div');
      group.className = 'tr-apostila-group';

      var header = document.createElement('div');
      header.className = 'tr-apostila-group-header';
      header.textContent = 'Aula ' + aula.aula_number + ': ' + aula.title + ', ' + _aulaDateText(aula);
      group.appendChild(header);

      aulaItems.forEach(function(item) {
        var row = document.createElement('div');
        row.className = 'tr-apostila-row';
        row.textContent = item.title;
        row.setAttribute('role', 'button');
        row.tabIndex = 0;
        row.dataset.aula   = aula.aula_number;
        row.dataset.itemId = item.id;
        row.addEventListener('click', function() {
          // Navigate to lesson view, scroll to this apostila item
          window.location.hash = '#aula-' + aula.aula_number + '@apostila-' + item.id;
        });
        row.addEventListener('keydown', function(e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); row.click(); }
        });
        group.appendChild(row);
      });

      container.appendChild(group);
    });

    if (!rendered) {
      container.innerHTML = '<div class="tr-empty">Nenhum conteúdo compilado disponível ainda.</div>';
    }
  }

  // ── Outros materiais tab ──────────────────────────────────────────────────
  function _renderOutros() {
    var filterEl = document.getElementById('tr-outros-filter');
    var listEl   = document.getElementById('tr-outros-list');
    if (!listEl || listEl.dataset.rendered) return;
    listEl.dataset.rendered = '1';

    var items  = (_data.items || []).filter(function(it) {
      return it.aula_number == null && it.set_id == null;
    });

    if (!items.length) {
      listEl.innerHTML = '<div class="tr-empty">Nenhum material avulso disponível ainda.</div>';
      return;
    }

    // Build types from items (same pattern as old trilha.js)
    var seen  = {};
    var types = [];
    items.forEach(function(it) {
      if (seen[it.type]) return;
      seen[it.type] = true;
      types.push({ slug: it.type, label: it.type_label || it.type, icon: it.type_icon || '' });
    });

    CT_TYPE_FILTER.render({
      container:    filterEl,
      types:        types,
      items:        items,
      selectedSlug: _outrosTypeFilter,
      onChange: function(slug) {
        _outrosTypeFilter = slug;
        _renderOutrosList(items, listEl, types);
      }
    });

    _renderOutrosList(items, listEl, types);
  }

  function _renderOutrosList(items, listEl, types) {
    var filtered = CT_TYPE_FILTER.apply(items, _outrosTypeFilter);
    listEl.innerHTML = '';
    if (!filtered.length) {
      listEl.innerHTML = '<div class="tr-empty">Nenhum item neste filtro.</div>';
      return;
    }
    filtered.forEach(function(item) {
      listEl.appendChild(_buildItemRow(item));
    });
    // Re-render filter to update active + counts
    var filterEl = document.getElementById('tr-outros-filter');
    var seen  = {};
    var typeArr = [];
    items.forEach(function(it) {
      if (seen[it.type]) return;
      seen[it.type] = true;
      typeArr.push({ slug: it.type, label: it.type_label || it.type, icon: it.type_icon || '' });
    });
    CT_TYPE_FILTER.render({
      container:    filterEl,
      types:        typeArr,
      items:        items,
      selectedSlug: _outrosTypeFilter,
      onChange: function(slug) {
        _outrosTypeFilter = slug;
        _renderOutrosList(items, listEl, typeArr);
      }
    });
  }

  // ── Item row (used in lesson + outros) ────────────────────────────────────
  function _buildItemRow(item) {
    var row = document.createElement('div');
    row.className = 'tr-item';
    row.dataset.itemId = item.id;

    var summary = item.summary
      ? '<div class="tr-item-summary">' + _esc(item.summary) + '</div>'
      : '';
    var tagsHtml = (item.tags && item.tags.length)
      ? '<div class="tr-item-tags">' + item.tags.map(function(label) {
          return '<span class="tr-tag-mini">' + _esc(label) + '</span>';
        }).join('') + '</div>'
      : '';

    row.innerHTML =
      '<div class="tr-item-header" role="button" tabindex="0" aria-expanded="false">' +
        '<div class="tr-item-zone">' +
          '<span class="tr-item-icon"></span>' +
          '<div class="tr-item-type-label"></div>' +
        '</div>' +
        '<div class="tr-item-meta">' +
          '<div class="tr-item-title">' + _esc(item.title) + '</div>' +
          summary +
          tagsHtml +
        '</div>' +
        '<div class="tr-item-actions">' +
          '<span class="tr-item-chevron">&#8250;</span>' +
        '</div>' +
      '</div>' +
      '<div class="tr-item-body" hidden></div>';

    row.querySelector('.tr-item-icon').textContent      = item.type_icon  || '📄';
    row.querySelector('.tr-item-type-label').textContent = item.type_label || item.type || '';

    var headerEl = row.querySelector('.tr-item-header');
    var bodyEl   = row.querySelector('.tr-item-body');

    headerEl.addEventListener('click', function() { _toggleItem(row, item, headerEl, bodyEl); });
    headerEl.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _toggleItem(row, item, headerEl, bodyEl); }
    });

    return row;
  }

  async function _toggleItem(row, item, headerEl, bodyEl) {
    var expanded = headerEl.getAttribute('aria-expanded') === 'true';
    if (expanded) {
      headerEl.setAttribute('aria-expanded', 'false');
      bodyEl.hidden = true;
      row.classList.remove('tr-item-open');
      return;
    }
    headerEl.setAttribute('aria-expanded', 'true');
    bodyEl.hidden = false;
    row.classList.add('tr-item-open');
    if (bodyEl.dataset.loaded) return;
    bodyEl.innerHTML = '<div class="tr-item-loading">Carregando...</div>';
    try {
      var data = await callWorker({
        action:      'ct_get_item_public',
        client_slug: _clientSlug,
        turma_slug:  _turmaSlug,
        token:       _token,
        item_id:     item.id,
        _silent: true
      });
      bodyEl.dataset.loaded = '1';
      CTRenderer.render(data.item, bodyEl, {});
    } catch (e) {
      bodyEl.innerHTML = '<div class="tr-item-error">Erro ao carregar conteúdo.</div>';
    }
  }

  // ── Error state ───────────────────────────────────────────────────────────
  function _showError(code) {
    document.getElementById('tr-loading').hidden = true;
    var errorEl = document.getElementById('tr-error');
    errorEl.hidden = false;
    var msgEl = errorEl.querySelector('.tr-error-msg');
    if (msgEl) {
      msgEl.textContent = code === 'link_invalid'
        ? 'Link inválido ou expirado. Verifique o endereço com seu professor(a).'
        : 'Erro ao carregar o conteúdo. Tente novamente em instantes.';
    }
  }

  // ── Utilities ─────────────────────────────────────────────────────────────
  function _esc(s) {
    if (!s) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  document.addEventListener('DOMContentLoaded', init);

})();
