'use strict';

// Trilha.Flat -- flat-card layout used by the Apostila and Outros tabs.
// Cards expand inline (no sub-card nesting). Body content comes from
// CTRenderer; the action row is appended below via Actions.appendFlatActionRow.

(function () {
  var Trilha = window.Trilha = window.Trilha || {};

  function renderApostilaTab() {
    var container = document.getElementById('tr-apostila-list');
    if (!container) return;

    var data = Trilha.State.data || {};
    var apostilaSet = data.apostila_set;
    if (!apostilaSet) {
      container.innerHTML = '<div class="tr-empty">Nenhum conteúdo disponível ainda.</div>';
      return;
    }
    var items = data.items || [];
    var aulas = data.aulas || [];
    var sections = items
      .filter(function (it) { return it.set_id === apostilaSet.id; })
      .sort(function (a, b) { return (a.set_position || 0) - (b.set_position || 0); });

    if (!sections.length) {
      container.innerHTML = '<div class="tr-empty">Nenhuma seção compilada ainda.</div>';
      return;
    }

    container.innerHTML = '';
    sections.forEach(function (item) {
      var aulaForItem = item.aula_number ? aulas.find(function (a) { return a.aula_number === item.aula_number; }) : null;
      var paddedAula = '';
      if (item.aula_number != null) {
        paddedAula = String(item.aula_number);
        if (paddedAula.length < 2) paddedAula = '0' + paddedAula;
      }
      var eyebrow = paddedAula
        ? 'Aula ' + paddedAula + (aulaForItem && aulaForItem.title ? ' · ' + aulaForItem.title : '')
        : '';
      container.appendChild(buildFlatCard(item, { eyebrow: eyebrow, isApostila: true }));
    });
  }

  function renderOutrosTab() {
    var filterEl = document.getElementById('tr-outros-filter');
    var listEl = document.getElementById('tr-outros-list');
    if (!listEl) return;

    var data = Trilha.State.data || {};
    var items = (data.items || []).filter(function (it) {
      return it.aula_number == null && it.set_id == null && it.type !== 'tarefa';
    });

    if (!items.length) {
      listEl.innerHTML = '<div class="tr-empty">Nenhum material avulso disponível ainda.</div>';
      return;
    }

    var seen = {};
    var types = [];
    items.forEach(function (it) {
      if (seen[it.type]) return;
      seen[it.type] = true;
      types.push({ slug: it.type, label: it.type_label || it.type, icon: it.type_icon || '' });
    });

    function renderList() {
      var filtered = window.CT_TYPE_FILTER ? window.CT_TYPE_FILTER.apply(items, Trilha.State.outrosTypeFilter) : items;
      listEl.innerHTML = '';
      if (!filtered.length) {
        listEl.innerHTML = '<div class="tr-empty">Nenhum item neste filtro.</div>';
        return;
      }
      filtered.forEach(function (item) { listEl.appendChild(buildFlatCard(item)); });
    }

    function rerenderFilter() {
      if (!window.CT_TYPE_FILTER) return;
      window.CT_TYPE_FILTER.render({
        container: filterEl,
        types: types,
        items: items,
        selectedSlug: Trilha.State.outrosTypeFilter,
        onChange: function (slug) {
          Trilha.State.outrosTypeFilter = slug;
          rerenderFilter();
          renderList();
        },
      });
    }

    rerenderFilter();
    renderList();
  }

  function buildFlatCard(item, opts) {
    opts = opts || {};
    var esc = Trilha.Utils.esc;

    var card = document.createElement('div');
    card.className = 'card';
    card.classList.add('card');
    card.dataset.itemId = item.id;

    // The icon comes from the item's type (item.type_icon: a "glyph:<key>"
    // resolved to an SVG by the Codex glyph library, or a legacy emoji), rendered
    // through the window.CdxGlyphs global. Falls back to escaped text.
    var iconHtml = (window.CdxGlyphs && typeof window.CdxGlyphs.iconHtml === 'function' && item.type_icon)
      ? window.CdxGlyphs.iconHtml(item.type_icon, { size: 20 })
      : esc(item.type_icon || '•');
    var typeLabel = item.type_label || item.type || '';
    var zoneClass = 'zone' + (opts.isApostila ? ' zone--apostila' : '');

    var eyebrowHtml = opts.eyebrow ? '<span class="meta-eyebrow">' + esc(opts.eyebrow) + '</span>' : '';
    var summaryHtml = item.summary ? '<div class="summary">' + esc(item.summary) + '</div>' : '';
    var tagsHtml = (item.tags && item.tags.length)
      ? '<div class="topics">' + item.tags.map(function (t) {
          return '<span class="topic-chip">' + esc(t) + '</span>';
        }).join('') + '</div>'
      : '';

    var isFresh = !!(Trilha.Freshness && Trilha.Freshness.isFresh(item));
    var novoPill = isFresh ? '<span class="novo-pill">NOVO</span>' : '';

    card.innerHTML =
      '<div class="card-header" role="button" tabindex="0" aria-expanded="false">' +
        '<div class="' + zoneClass + '">' +
          '<span class="zone-icon">' + iconHtml + '</span>' +
          '<span class="zone-label">' + esc(typeLabel) + '</span>' +
        '</div>' +
        '<div class="meta">' +
          eyebrowHtml +
          '<div class="title">' + esc(item.title) + novoPill + '</div>' +
          summaryHtml +
          tagsHtml +
        '</div>' +
        '<div class="actions"><span class="chevron">›</span></div>' +
      '</div>';

    var headerEl = card.querySelector('.card-header');
    if (headerEl) {
      headerEl.addEventListener('click', function () { toggleFlatCard(card, item); });
      headerEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { if (e.preventDefault) e.preventDefault(); toggleFlatCard(card, item); }
      });
    }
    return card;
  }

  async function toggleFlatCard(card, item) {
    var headerEl = card.querySelector('.card-header');
    var isOpen = card.classList.contains('open');
    var existing = card.querySelector('.body');

    if (isOpen) {
      card.classList.remove('open');
      if (headerEl) headerEl.setAttribute('aria-expanded', 'false');
      if (existing) existing.remove();
      return;
    }
    card.classList.add('open');
    if (headerEl) headerEl.setAttribute('aria-expanded', 'true');

    var body = document.createElement('div');
    body.className = 'body';
    body.classList.add('body');
    body.innerHTML = '<div class="ctr-loading">Carregando...</div>';
    card.appendChild(body);

    var S = Trilha.State;
    try {
      var data = await callWorker({
        action: 'ct_get_item_public',
        client_slug: S.clientSlug,
        turma_slug: S.turmaSlug,
        token: S.token,
        item_id: item.id,
        _silent: true,
      });
      body.innerHTML = '';
      var contentWrap = document.createElement('div');
      body.appendChild(contentWrap);
      window.CTRenderer.render(data.item, contentWrap, { preview: true });
      Trilha.Actions.appendFlatActionRow(body, data.item);
    } catch (e) {
      body.innerHTML = '<div class="tr-empty">Erro ao carregar conteúdo.</div>';
    }
  }

  Trilha.Flat = {
    renderApostilaTab: renderApostilaTab,
    renderOutrosTab: renderOutrosTab,
    buildFlatCard: buildFlatCard,
    toggleFlatCard: toggleFlatCard,
  };
})();
