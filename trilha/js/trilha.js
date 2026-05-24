'use strict';

(function() {

  // ── URL parsing ─────────────────────────────────────────────────────
  var _params = new URLSearchParams(window.location.search);
  var _clientSlug = _params.get('c');
  var _turmaSlug = _params.get('t');
  var _token = _params.get('k');

  if (!_clientSlug || !_turmaSlug) {
    var _parts = window.location.pathname.replace(/^\/trilha\/?/, '').replace(/\/$/, '').split('/');
    if (_parts.length >= 2 && _parts[0]) {
      _clientSlug = _parts[0];
      _turmaSlug = _parts[1] || null;
    }
  }

  // Admin flag: visiting with ?admin=1 sets a localStorage marker so future
  // page loads on this device pass _admin: true to the Worker and are
  // excluded from ct_access_log. ?admin=0 clears it.
  if (_params.has('admin')) {
    try {
      if (_params.get('admin') === '1') localStorage.setItem('ct_is_admin', '1');
      else                              localStorage.removeItem('ct_is_admin');
    } catch (_) {}
  }
  var _isAdmin = false;
  try { _isAdmin = localStorage.getItem('ct_is_admin') === '1'; } catch (_) {}

  // ── State ────────────────────────────────────────────────────────────
  var _data = null;
  var _outrosTypeFilter = null;
  var _rendered = { aulas: false, apostila: false, outros: false };

  // Focus mode: mobile only. Single-open accordion + collapsed rail/siblings,
  // styled in trilha.css under `@media (max-width: 700px)`. Desktop keeps the
  // original multi-open behaviour.
  var _mqMobile = window.matchMedia('(max-width: 700px)');

  function _isFocusMode() { return _mqMobile.matches; }

  function _wireBackPill() {
    var btn = document.getElementById('tr-back-pill');
    if (!btn) return;
    btn.addEventListener('click', function () {
      document.querySelectorAll('.tl-row.is-open').forEach(_closeAulaRow);
    });
  }

  function _closeAulaRow(row) {
    if (!row) return;
    var card = row.querySelector('.card');
    if (!card) return;
    var headerEl = row.querySelector('.card-header');
    card.classList.remove('open');
    row.classList.remove('is-open');
    if (headerEl) headerEl.setAttribute('aria-expanded', 'false');
    var body = card.querySelector('.body');
    if (body) body.remove();
  }

  // If the viewport crosses into mobile while several aulas are open, collapse
  // all but the first so the single-open invariant matches the CSS state.
  _mqMobile.addEventListener('change', function (e) {
    if (!e.matches) return;
    var openRows = document.querySelectorAll('.tl-row.is-open');
    for (var i = 1; i < openRows.length; i++) _closeAulaRow(openRows[i]);
  });

  // ── Icons (lucide-style) ─────────────────────────────────────────────
  var ICONS = {
    copy:
      '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/>' +
      '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    external:
      '<svg viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>' +
      '<polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
    download:
      '<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
      '<polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    check:
      '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
    send:
      '<svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/>' +
      '<polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>'
  };

  function _tarefaSubmittedKey(itemId) {
    return 'ct_tarefa_submitted_' + itemId + '_' + _turmaSlug;
  }

  function _hasSubmittedTarefa(itemId) {
    try { return localStorage.getItem(_tarefaSubmittedKey(itemId)) != null; }
    catch (_) { return false; }
  }

  var WA_ICON =
    '<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';

  // ── Entry ────────────────────────────────────────────────────────────
  function init() {
    if (!_clientSlug || !_turmaSlug || !_token) { _showError('link_invalid'); return; }
    _loadTurma();
    window.addEventListener('hashchange', _onHashChange);
  }

  async function _loadTurma() {
    try {
      _data = await callWorker({
        action: 'ct_get_turma_view',
        client_slug: _clientSlug,
        turma_slug: _turmaSlug,
        token: _token,
        _admin: _isAdmin,
        _silent: true
      });
      document.getElementById('tr-loading').hidden = true;
      document.getElementById('tr-main').hidden = false;
      _renderHero();
      _renderHeaderActions();
      _renderTabs();
      _wireBackPill();
      _onHashChange();
    } catch (err) {
      var code = (err && err.data && err.data.error) ? err.data.error : 'error';
      _showError(code === 'not_found' || code === 'forbidden' || code === 'unauthorized' ? 'link_invalid' : 'error');
    }
  }

  // ── Hero ─────────────────────────────────────────────────────────────
  function _renderHero() {
    var client = _data.client || {};
    var turma = _data.turma || {};

    var nameEl = document.getElementById('tr-client-name');
    var turmaEl = document.getElementById('tr-turma-name');
    var avatarEl = document.getElementById('tr-client-avatar');
    var iconEl = document.getElementById('tr-client-icon');

    if (nameEl) nameEl.textContent = client.display_name || '';
    if (turmaEl) turmaEl.textContent = turma.display_name || turma.name || _turmaSlug;

    if (client.icon_path && avatarEl && iconEl) {
      var src = client.icon_path.match(/^https?:\/\//)
        ? client.icon_path
        : WORKER_URL + '/r2/' + client.icon_path;
      iconEl.src = src;
      iconEl.alt = client.display_name || '';
      iconEl.hidden = false;
      avatarEl.style.background = 'var(--background)';
    } else if (avatarEl) {
      var name = client.display_name || '';
      var initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(function(w) { return w[0]; }).join('').toUpperCase();
      avatarEl.innerHTML = initials
        ? '<span style="color:#fff;font-weight:800;font-size:1.6rem;">' + _esc(initials) + '</span>'
        : '';
    }

    var titleBase = turma.display_name || turma.name;
    if (titleBase) document.title = titleBase + ' · PensoIA';
  }

  // ── Header action buttons (injected into pensoia-header .ph-right) ──
  // After Bundle H the ClassPulse live-question pill is gone; the answer
  // experience appears in place via trilha-nexo. Only the WhatsApp group
  // pill remains; the session code is no longer surfaced anywhere.
  function _renderHeaderActions() {
    var turma = _data.turma || {};
    var hasWa = !!turma.whatsapp_url;
    if (!hasWa) return;

    function tryInject(attempt) {
      attempt = attempt || 0;
      var header = document.querySelector('pensoia-header');
      var phRight = header && header.querySelector('.ph-right');
      if (!phRight) {
        if (attempt < 20) setTimeout(function() { tryInject(attempt + 1); }, 100);
        return;
      }
      if (header.dataset.trActionsInjected) return;
      header.dataset.trActionsInjected = '1';

      var wa = document.createElement('a');
      wa.className = 'ph-action-btn';
      wa.href = turma.whatsapp_url;
      wa.target = '_blank';
      wa.rel = 'noopener';
      wa.title = 'Grupo no WhatsApp';
      wa.innerHTML = WA_ICON + '<span>Grupo no WhatsApp</span>';
      phRight.insertBefore(wa, phRight.firstChild);
    }
    tryInject();
  }

  // ── Tabs ─────────────────────────────────────────────────────────────
  function _renderTabs() {
    var items = _data.items || [];
    var outros = items.filter(function(it) {
      return it.aula_number == null && it.set_id == null && it.type !== 'tarefa';
    });
    var apostilaSet = _data.apostila_set;
    var apostilaCount = apostilaSet ? items.filter(function(it) { return it.set_id === apostilaSet.id; }).length : 0;

    var outrosBtn = document.getElementById('tr-tab-outros');
    var apostilaBtn = document.getElementById('tr-tab-apostila');

    if (outrosBtn) {
      if (outros.length) outrosBtn.textContent = 'Outros materiais (' + outros.length + ')';
      outrosBtn.hidden = !outros.length;
    }
    if (apostilaBtn) {
      apostilaBtn.hidden = !apostilaCount;
    }

    document.getElementById('tr-tabs').querySelectorAll('.tr-tab-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var tab = btn.dataset.tab;
        window.location.hash = '#' + tab;
      });
    });
  }

  // ── Hash routing ─────────────────────────────────────────────────────
  function _onHashChange() {
    var hash = (window.location.hash || '#aulas').replace(/^#/, '');
    if (hash !== 'aulas' && hash !== 'apostila' && hash !== 'outros') hash = 'aulas';
    _showTab(hash);
  }

  function _showTab(name) {
    ['aulas', 'apostila', 'outros'].forEach(function(p) {
      var el = document.getElementById('tr-panel-' + p);
      if (el) el.hidden = (p !== name);
    });
    document.querySelectorAll('.tr-tab-btn').forEach(function(btn) {
      var active = btn.dataset.tab === name;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    if (name === 'aulas' && !_rendered.aulas) { _renderAulas(); _rendered.aulas = true; }
    if (name === 'apostila' && !_rendered.apostila) { _renderApostilaTab(); _rendered.apostila = true; }
    if (name === 'outros' && !_rendered.outros) { _renderOutrosTab(); _rendered.outros = true; }
  }

  // ── Date / status helpers ────────────────────────────────────────────
  function _fmtDate(iso) {
    if (!iso) return '';
    var p = iso.split('-');
    if (p.length < 3) return iso;
    return p[2].replace(/^0/, '') + '/' + p[1].replace(/^0/, '');
  }

  function _aulaDateText(aula) {
    if (aula.happened_on) return 'ocorreu em ' + _fmtDate(aula.happened_on);
    var today = new Date().toISOString().slice(0, 10);
    if (aula.rescheduled_from && aula.scheduled_for && aula.scheduled_for > today) {
      return 'remarcada (era ' + _fmtDate(aula.rescheduled_from) + ', agora ' + _fmtDate(aula.scheduled_for) + ')';
    }
    if (aula.scheduled_for) {
      if (aula.scheduled_for > today) return 'agendada para ' + _fmtDate(aula.scheduled_for);
      return _fmtDate(aula.scheduled_for);
    }
    return 'a definir';
  }

  function _aulaStatus(aula) {
    if (aula.happened_on) return 'done';
    var today = new Date().toISOString().slice(0, 10);
    if (aula.scheduled_for && aula.scheduled_for > today) return 'upcoming';
    if (aula.scheduled_for && aula.scheduled_for <= today) return 'done';
    return 'und';
  }

  function _parseTopics(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(function(t) { return String(t).trim(); }).filter(Boolean);
    try {
      var parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(function(t) { return String(t).trim(); }).filter(Boolean);
    } catch (_) {}
    return String(raw).split(',').map(function(t) { return t.trim(); }).filter(Boolean);
  }

  // ── Aulas tab (timeline) ─────────────────────────────────────────────
  function _renderAulas() {
    var container = document.getElementById('tr-aulas-timeline');
    if (!container) return;

    var aulas = (_data.aulas || []).slice().sort(function(a, b) { return a.aula_number - b.aula_number; });
    if (!aulas.length) {
      container.innerHTML = '<div class="tr-empty">Nenhuma aula disponível ainda.</div>';
      return;
    }
    container.innerHTML = '';
    aulas.forEach(function(aula) { container.appendChild(_buildAulaRow(aula)); });
  }

  function _buildAulaRow(aula) {
    var status = _aulaStatus(aula);
    var dateText = _aulaDateText(aula);
    var topics = _parseTopics(aula.topics_json);
    var items = _data.items || [];
    var tarefaCount = items.filter(function(it) {
      return it.aula_number === aula.aula_number && it.type === 'tarefa';
    }).length;
    var statusBadge = status === 'done' ? '✓' : (status === 'upcoming' ? String(aula.aula_number) : '·');

    var row = document.createElement('div');
    row.className = 'tl-row';
    row.dataset.aula = aula.aula_number;

    var topicsHtml = topics.length
      ? '<div class="topics">' + topics.map(function(t) {
          return '<span class="topic-chip">' + _esc(t) + '</span>';
        }).join('') + '</div>'
      : '';

    var tarefaPill = '';
    if (tarefaCount === 1)      tarefaPill = '<span class="tarefa-pill">⚑ Tarefa</span>';
    else if (tarefaCount >= 2)  tarefaPill = '<span class="tarefa-pill">⚑ Tarefas (' + tarefaCount + ')</span>';
    var paddedNum = String(aula.aula_number);
    if (paddedNum.length < 2) paddedNum = '0' + paddedNum;

    row.innerHTML =
      '<div class="tl-dot tl-dot--' + status + '">' + _esc(statusBadge) + '</div>' +
      '<div class="card" data-aula="' + aula.aula_number + '">' +
        '<div class="card-header" role="button" tabindex="0" aria-expanded="false">' +
          '<div class="zone zone--' + status + '">' +
            '<span class="zone-num">' + paddedNum + '</span>' +
            '<span class="zone-label">Aula</span>' +
          '</div>' +
          '<div class="meta">' +
            '<div class="meta-row">' +
              '<span class="date-pill">' + _esc(dateText) + '</span>' +
              tarefaPill +
            '</div>' +
            '<div class="title">' + _esc(aula.title || ('Aula ' + aula.aula_number)) + '</div>' +
            topicsHtml +
          '</div>' +
          '<div class="actions"><span class="chevron">›</span></div>' +
        '</div>' +
      '</div>';

    var headerEl = row.querySelector('.card-header');
    headerEl.addEventListener('click', function() { _toggleAula(row, aula); });
    headerEl.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _toggleAula(row, aula); }
    });
    return row;
  }

  function _toggleAula(row, aula) {
    var card = row.querySelector('.card');
    var headerEl = row.querySelector('.card-header');
    var isOpen = card.classList.contains('open');

    if (isOpen) {
      _closeAulaRow(row);
      return;
    }

    // On mobile, focus mode is the default: single-open accordion.
    var mobile = _isFocusMode();
    if (mobile) {
      document.querySelectorAll('.tl-row.is-open').forEach(function (other) {
        if (other !== row) _closeAulaRow(other);
      });
    }

    card.classList.add('open');
    row.classList.add('is-open');
    headerEl.setAttribute('aria-expanded', 'true');
    card.appendChild(_buildAulaBody(aula));

    if (mobile) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function _buildAulaBody(aula) {
    var items = _data.items || [];
    var apostilaSet = _data.apostila_set;
    var apostilaSetId = apostilaSet ? apostilaSet.id : null;

    var aulaItems = items.filter(function(it) { return it.aula_number === aula.aula_number; });

    var tarefaItems = aulaItems
      .filter(function(it) { return it.type === 'tarefa'; })
      .sort(function(a, b) { return (a.position || 0) - (b.position || 0); });

    var apostilaItems = aulaItems
      .filter(function(it) {
        return apostilaSetId !== null && it.set_id === apostilaSetId && it.type !== 'tarefa';
      })
      .sort(function(a, b) { return (a.set_position || 0) - (b.set_position || 0); });

    var outrosItems = aulaItems
      .filter(function(it) {
        if (apostilaSetId !== null && it.set_id === apostilaSetId) return false;
        if (it.type === 'tarefa') return false;
        return true;
      })
      .sort(function(a, b) { return (a.position || 0) - (b.position || 0); });

    var body = document.createElement('div');
    body.className = 'body';

    if (tarefaItems.length) {
      body.appendChild(_buildSection(tarefaItems.length === 1 ? 'Tarefa' : 'Tarefas', tarefaItems, { isTarefa: true }));
    }
    if (apostilaItems.length) {
      body.appendChild(_buildSection('Conteúdo da aula', apostilaItems, { isApostila: true }));
    }
    if (outrosItems.length) {
      body.appendChild(_buildOutrosSection(outrosItems));
    }
    if (!tarefaItems.length && !apostilaItems.length && !outrosItems.length) {
      body.innerHTML = '<div class="tr-empty">Nenhum conteúdo disponível nesta aula ainda.</div>';
    }
    return body;
  }

  function _buildSection(label, items, opts) {
    opts = opts || {};
    var section = document.createElement('div');
    section.className = 'section';
    section.innerHTML = '<div class="section-label">' + _esc(label) + '</div>';
    var list = document.createElement('div');
    list.className = 'sub-list';
    items.forEach(function(item) { list.appendChild(_buildSub(item, opts)); });
    section.appendChild(list);
    return section;
  }

  // Outros materiais within an aula: same shape as a section, but with a
  // type-filter chip strip mirroring the standalone Outros tab. Filter state
  // is per-section (closure-scoped); collapsing and reopening the aula resets it.
  function _buildOutrosSection(items) {
    var section = document.createElement('div');
    section.className = 'section';
    section.innerHTML = '<div class="section-label">Outros materiais</div>';

    var filterEl = document.createElement('div');
    filterEl.className = 'tr-type-filter';
    section.appendChild(filterEl);

    var list = document.createElement('div');
    list.className = 'sub-list';
    section.appendChild(list);

    var seen = {};
    var types = [];
    items.forEach(function(it) {
      if (seen[it.type]) return;
      seen[it.type] = true;
      types.push({ slug: it.type, label: it.type_label || it.type, icon: it.type_icon || '' });
    });

    var selectedSlug = null;

    function renderList() {
      var filtered = window.CT_TYPE_FILTER ? CT_TYPE_FILTER.apply(items, selectedSlug) : items;
      list.innerHTML = '';
      filtered.forEach(function(item) { list.appendChild(_buildSub(item)); });
    }

    function rerenderFilter() {
      if (!window.CT_TYPE_FILTER) return;
      CT_TYPE_FILTER.render({
        container: filterEl,
        types: types,
        items: items,
        selectedSlug: selectedSlug,
        onChange: function(slug) {
          selectedSlug = slug;
          rerenderFilter();
          renderList();
        }
      });
    }

    if (types.length > 1 && window.CT_TYPE_FILTER) {
      rerenderFilter();
    } else {
      filterEl.style.display = 'none';
    }
    renderList();
    return section;
  }

  function _buildSub(item, opts) {
    opts = opts || {};
    var sub = document.createElement('div');
    sub.className = 'sub' + (opts.isTarefa ? ' sub--tarefa' : '');
    sub.dataset.itemId = item.id;

    var zoneClass = 'sub-zone';
    if (opts.isTarefa) zoneClass += ' sub-zone--tarefa';
    else if (opts.isApostila) zoneClass += ' sub-zone--apostila';

    var icon = opts.isTarefa ? '⚑' : (item.type_icon || '📄');
    var typeLabel = opts.isTarefa ? 'Tarefa' : (item.type_label || item.type || '');

    sub.innerHTML =
      '<div class="' + zoneClass + '">' + _esc(icon) + '</div>' +
      '<div class="sub-meta">' +
        '<span class="sub-type">' + _esc(typeLabel) + '</span>' +
        '<span class="sub-title">' + _esc(item.title) + '</span>' +
        (item.summary ? '<span class="sub-summary">' + _esc(item.summary) + '</span>' : '') +
      '</div>' +
      '<div class="sub-actions"></div>';

    sub.addEventListener('click', function(e) {
      if (e.target.closest('.item-action')) return;
      // When open, clicks on the action-area padding (not the button) are dead space
      if (sub.classList.contains('is-expanded') && e.target.closest('.sub-actions')) return;
      _toggleSub(sub, item, opts);
    });
    return sub;
  }

  async function _toggleSub(sub, item, opts) {
    opts = opts || {};
    var alreadyExpanded = sub.classList.contains('is-expanded');

    var list = sub.parentNode;
    list.querySelectorAll('.sub-expanded').forEach(function(el) { el.remove(); });
    list.querySelectorAll('.sub.is-expanded').forEach(function(el) {
      el.classList.remove('is-expanded');
      var a = el.querySelector('.sub-actions');
      if (a) a.innerHTML = '';
    });

    if (alreadyExpanded) return;

    sub.classList.add('is-expanded');
    var exp = document.createElement('div');
    exp.className = 'sub-expanded';
    exp.innerHTML = '<div class="ctr-loading">Carregando...</div>';
    sub.parentNode.insertBefore(exp, sub.nextSibling);

    try {
      var data = await callWorker({
        action: 'ct_get_item_public',
        client_slug: _clientSlug,
        turma_slug: _turmaSlug,
        token: _token,
        item_id: item.id,
        _silent: true
      });
      exp.innerHTML = '';
      CTRenderer.render(data.item, exp, { preview: true });
      _injectActionButton(sub, data.item, opts);
    } catch (e) {
      exp.innerHTML = '<div class="tr-empty">Erro ao carregar conteúdo.</div>';
    }
  }

  // ── Item action dispatch ─────────────────────────────────────────────
  function _getMeta(item) {
    if (!item || !item.meta_json) return {};
    if (typeof item.meta_json === 'string') {
      try { return JSON.parse(item.meta_json) || {}; } catch (_) { return {}; }
    }
    return item.meta_json || {};
  }

  function _getItemAction(item) {
    var meta = _getMeta(item);
    if (item.type === 'tarefa') {
      if (_hasSubmittedTarefa(item.id)) {
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
        icon: isImg ? 'external' : 'download'
      };
    }
    if (meta.doc_url) return { kind: 'open', label: 'Documentação', url: meta.doc_url, icon: 'external' };
    if (item.body_md) return { kind: 'copy', label: 'Copiar', text: item.body_md, icon: 'copy' };
    return null;
  }

  function _injectActionButton(sub, item, opts) {
    var actionsEl = sub.querySelector('.sub-actions');
    if (!actionsEl) return;
    actionsEl.innerHTML = '';
    var action = _getItemAction(item);
    if (!action) return;

    var btn;
    if (action.kind === 'open') {
      btn = document.createElement('a');
      btn.href = action.url;
      btn.target = '_blank';
      btn.rel = 'noopener';
    } else {
      btn = document.createElement('button');
      btn.type = 'button';
    }
    var cls = 'item-action' + (opts && opts.isTarefa ? ' item-action--task' : '');
    if (action.kind === 'submitted') cls += ' item-action--submitted is-done';
    btn.className = cls;
    var labelHtml = '<span class="ia-label-full">' + _esc(action.label) + '</span>';
    if (action.shortLabel) {
      labelHtml += '<span class="ia-label-short">' + _esc(action.shortLabel) + '</span>';
    }
    btn.innerHTML = (ICONS[action.icon] || ICONS.copy) + labelHtml;
    if (action.kind === 'submitted') btn.disabled = true;

    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (action.kind === 'copy') {
        e.preventDefault();
        _copyToClipboard(action.text, btn);
      } else if (action.kind === 'submit') {
        e.preventDefault();
        _openTarefaSubmit(action.item, sub, opts);
      }
    });
    actionsEl.appendChild(btn);
  }

  function _openTarefaSubmit(item, sub, opts) {
    if (!window.CTTarefaSubmitModal) {
      console.error('CTTarefaSubmitModal not loaded');
      return;
    }
    CTTarefaSubmitModal.open({
      item: item,
      clientSlug: _clientSlug,
      turmaSlug: _turmaSlug,
      token: _token,
      onSubmitted: function() {
        // Refresh the action button to show the submitted state
        _injectActionButton(sub, item, opts || {});
      }
    });
  }

  function _copyToClipboard(text, btn) {
    function flash() {
      var orig = btn.innerHTML;
      btn.classList.add('is-done');
      btn.innerHTML = ICONS.check + '<span>Copiado</span>';
      setTimeout(function() {
        btn.classList.remove('is-done');
        btn.innerHTML = orig;
      }, 1800);
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

  // ── Apostila do curso tab ─────────────────────────────────────────────
  function _renderApostilaTab() {
    var container = document.getElementById('tr-apostila-list');
    if (!container) return;

    var apostilaSet = _data.apostila_set;
    if (!apostilaSet) {
      container.innerHTML = '<div class="tr-empty">Nenhum conteúdo disponível ainda.</div>';
      return;
    }
    var items = _data.items || [];
    var aulas = _data.aulas || [];
    var sections = items
      .filter(function(it) { return it.set_id === apostilaSet.id; })
      .sort(function(a, b) { return (a.set_position || 0) - (b.set_position || 0); });

    if (!sections.length) {
      container.innerHTML = '<div class="tr-empty">Nenhuma seção compilada ainda.</div>';
      return;
    }

    container.innerHTML = '';
    sections.forEach(function(item) {
      var aulaForItem = item.aula_number ? aulas.find(function(a) { return a.aula_number === item.aula_number; }) : null;
      var paddedAula = '';
      if (item.aula_number != null) {
        paddedAula = String(item.aula_number);
        if (paddedAula.length < 2) paddedAula = '0' + paddedAula;
      }
      var eyebrow = paddedAula
        ? 'Aula ' + paddedAula + (aulaForItem && aulaForItem.title ? ' · ' + aulaForItem.title : '')
        : '';
      container.appendChild(_buildFlatCard(item, { eyebrow: eyebrow, isApostila: true }));
    });
  }

  // ── Outros materiais tab ──────────────────────────────────────────────
  function _renderOutrosTab() {
    var filterEl = document.getElementById('tr-outros-filter');
    var listEl = document.getElementById('tr-outros-list');
    if (!listEl) return;

    var items = (_data.items || []).filter(function(it) {
      return it.aula_number == null && it.set_id == null && it.type !== 'tarefa';
    });

    if (!items.length) {
      listEl.innerHTML = '<div class="tr-empty">Nenhum material avulso disponível ainda.</div>';
      return;
    }

    var seen = {};
    var types = [];
    items.forEach(function(it) {
      if (seen[it.type]) return;
      seen[it.type] = true;
      types.push({ slug: it.type, label: it.type_label || it.type, icon: it.type_icon || '' });
    });

    function renderList() {
      var filtered = window.CT_TYPE_FILTER ? CT_TYPE_FILTER.apply(items, _outrosTypeFilter) : items;
      listEl.innerHTML = '';
      if (!filtered.length) {
        listEl.innerHTML = '<div class="tr-empty">Nenhum item neste filtro.</div>';
        return;
      }
      filtered.forEach(function(item) { listEl.appendChild(_buildFlatCard(item)); });
    }

    function rerenderFilter() {
      if (!window.CT_TYPE_FILTER) return;
      CT_TYPE_FILTER.render({
        container: filterEl,
        types: types,
        items: items,
        selectedSlug: _outrosTypeFilter,
        onChange: function(slug) {
          _outrosTypeFilter = slug;
          rerenderFilter();
          renderList();
        }
      });
    }

    rerenderFilter();
    renderList();
  }

  // ── Flat card (Apostila tab + Outros tab) ────────────────────────────
  function _buildFlatCard(item, opts) {
    opts = opts || {};
    var card = document.createElement('div');
    card.className = 'card';
    card.dataset.itemId = item.id;

    var icon = item.type_icon || '📄';
    var typeLabel = item.type_label || item.type || '';
    var zoneClass = 'zone' + (opts.isApostila ? ' zone--apostila' : '');

    var eyebrowHtml = opts.eyebrow ? '<span class="meta-eyebrow">' + _esc(opts.eyebrow) + '</span>' : '';
    var summaryHtml = item.summary ? '<div class="summary">' + _esc(item.summary) + '</div>' : '';
    var tagsHtml = (item.tags && item.tags.length)
      ? '<div class="topics">' + item.tags.map(function(t) {
          return '<span class="topic-chip">' + _esc(t) + '</span>';
        }).join('') + '</div>'
      : '';

    card.innerHTML =
      '<div class="card-header" role="button" tabindex="0" aria-expanded="false">' +
        '<div class="' + zoneClass + '">' +
          '<span class="zone-icon">' + _esc(icon) + '</span>' +
          '<span class="zone-label">' + _esc(typeLabel) + '</span>' +
        '</div>' +
        '<div class="meta">' +
          eyebrowHtml +
          '<div class="title">' + _esc(item.title) + '</div>' +
          summaryHtml +
          tagsHtml +
        '</div>' +
        '<div class="actions"><span class="chevron">›</span></div>' +
      '</div>';

    var headerEl = card.querySelector('.card-header');
    headerEl.addEventListener('click', function() { _toggleFlatCard(card, item); });
    headerEl.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _toggleFlatCard(card, item); }
    });
    return card;
  }

  async function _toggleFlatCard(card, item) {
    var headerEl = card.querySelector('.card-header');
    var isOpen = card.classList.contains('open');
    var existing = card.querySelector('.body');

    if (isOpen) {
      card.classList.remove('open');
      headerEl.setAttribute('aria-expanded', 'false');
      if (existing) existing.remove();
      return;
    }
    card.classList.add('open');
    headerEl.setAttribute('aria-expanded', 'true');

    var body = document.createElement('div');
    body.className = 'body';
    body.innerHTML = '<div class="ctr-loading">Carregando...</div>';
    card.appendChild(body);

    try {
      var data = await callWorker({
        action: 'ct_get_item_public',
        client_slug: _clientSlug,
        turma_slug: _turmaSlug,
        token: _token,
        item_id: item.id,
        _silent: true
      });
      body.innerHTML = '';
      var contentWrap = document.createElement('div');
      body.appendChild(contentWrap);
      CTRenderer.render(data.item, contentWrap, { preview: true });
      _appendFlatActionRow(body, data.item);
    } catch (e) {
      body.innerHTML = '<div class="tr-empty">Erro ao carregar conteúdo.</div>';
    }
  }

  function _appendFlatActionRow(body, item) {
    var action = _getItemAction(item);
    if (!action) return;

    var row = document.createElement('div');
    row.style.marginTop = '1.1rem';
    row.style.textAlign = 'right';

    var btn;
    if (action.kind === 'open') {
      btn = document.createElement('a');
      btn.href = action.url;
      btn.target = '_blank';
      btn.rel = 'noopener';
    } else {
      btn = document.createElement('button');
      btn.type = 'button';
    }
    btn.className = 'item-action';
    var labelHtml = '<span class="ia-label-full">' + _esc(action.label) + '</span>';
    if (action.shortLabel) {
      labelHtml += '<span class="ia-label-short">' + _esc(action.shortLabel) + '</span>';
    }
    btn.innerHTML = (ICONS[action.icon] || ICONS.copy) + labelHtml;
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (action.kind === 'copy') {
        e.preventDefault();
        _copyToClipboard(action.text, btn);
      }
    });
    row.appendChild(btn);
    body.appendChild(row);
  }

  // ── Error state ───────────────────────────────────────────────────────
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

  // ── Utilities ─────────────────────────────────────────────────────────
  function _esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  document.addEventListener('DOMContentLoaded', init);

})();
