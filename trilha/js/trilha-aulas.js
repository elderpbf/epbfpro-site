'use strict';

// Trilha.Aulas -- the Aulas tab timeline + inline-expand body. On mobile the
// focus-mode rule (single-open accordion) is enforced here in JS to match the
// CSS state under @media (max-width: 700px).

(function () {
  var Trilha = window.Trilha = window.Trilha || {};

  function closeAulaRow(row) {
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

  function wireBackPill() {
    var btn = document.getElementById('tr-back-pill');
    if (!btn) return;
    btn.addEventListener('click', function () {
      document.querySelectorAll('.tl-row.is-open').forEach(closeAulaRow);
    });
  }

  // If the viewport crosses into mobile while several aulas are open, collapse
  // all but the first so the single-open invariant matches the CSS state.
  function wireMqMobile() {
    var mq = Trilha.State.mqMobile;
    if (!mq || !mq.addEventListener) return;
    mq.addEventListener('change', function (e) {
      if (!e.matches) return;
      var openRows = document.querySelectorAll('.tl-row.is-open');
      for (var i = 1; i < openRows.length; i++) closeAulaRow(openRows[i]);
    });
  }

  function renderAulas() {
    var container = document.getElementById('tr-aulas-timeline');
    if (!container) return;

    var data = Trilha.State.data || {};
    var aulas = (data.aulas || []).slice().sort(function (a, b) { return a.aula_number - b.aula_number; });
    if (!aulas.length) {
      container.innerHTML = '<div class="tr-empty">Nenhuma aula disponível ainda.</div>';
      return;
    }
    container.innerHTML = '';
    aulas.forEach(function (aula) { container.appendChild(buildAulaRow(aula)); });
  }

  function buildAulaRow(aula) {
    var U = Trilha.Utils;
    var data = Trilha.State.data || {};

    var status = U.aulaStatus(aula);
    var dateText = U.aulaDateText(aula);
    var topics = U.parseTopics(aula.topics_json);
    var items = data.items || [];
    var aulaItems = items.filter(function (it) { return it.aula_number === aula.aula_number; });
    var tarefaCount = aulaItems.filter(function (it) { return it.type === 'tarefa'; }).length;
    var freshCount = (Trilha.Freshness ? Trilha.Freshness.countFreshIn(aulaItems) : 0);
    var statusBadge = status === 'done' ? '✓' : (status === 'upcoming' ? String(aula.aula_number) : '·');

    var row = document.createElement('div');
    row.className = 'tl-row';
    row.classList.add('tl-row');
    row.dataset.aula = aula.aula_number;

    var topicsHtml = topics.length
      ? '<div class="topics">' + topics.map(function (t) {
          return '<span class="topic-chip">' + U.esc(t) + '</span>';
        }).join('') + '</div>'
      : '';

    var tarefaGlyph = window.BSTypeIcon ? window.BSTypeIcon('tarefa', '✓') : '✓';
    var tarefaPill = '';
    if (tarefaCount === 1)      tarefaPill = '<span class="tarefa-pill">' + U.esc(tarefaGlyph) + ' Tarefa</span>';
    else if (tarefaCount >= 2)  tarefaPill = '<span class="tarefa-pill">' + U.esc(tarefaGlyph) + ' Tarefas (' + tarefaCount + ')</span>';

    var paddedNum = String(aula.aula_number);
    if (paddedNum.length < 2) paddedNum = '0' + paddedNum;

    var novoBannerHtml = freshCount
      ? '<div class="aula-novo-banner" role="button" tabindex="0" aria-label="Abrir aula com material novo">' +
          '<span class="aula-novo-text">Novo material adicionado</span>' +
          '<span class="aula-novo-count">' + freshCount + '</span>' +
        '</div>'
      : '';

    row.innerHTML =
      '<div class="tl-dot tl-dot--' + status + '">' + U.esc(statusBadge) + '</div>' +
      '<div class="card' + (freshCount ? ' card--has-novo' : '') + '" data-aula="' + aula.aula_number + '">' +
        novoBannerHtml +
        '<div class="card-header" role="button" tabindex="0" aria-expanded="false">' +
          '<div class="zone zone--' + status + '">' +
            '<span class="zone-num">' + paddedNum + '</span>' +
            '<span class="zone-label">Aula</span>' +
          '</div>' +
          '<div class="meta">' +
            '<div class="meta-row">' +
              '<span class="date-pill">' + U.esc(dateText) + '</span>' +
              tarefaPill +
            '</div>' +
            '<div class="title">' + U.esc(aula.title || ('Aula ' + aula.aula_number)) + '</div>' +
            topicsHtml +
          '</div>' +
          '<div class="actions"><span class="chevron">›</span></div>' +
        '</div>' +
      '</div>';

    var headerEl = row.querySelector('.card-header');
    if (headerEl) {
      headerEl.addEventListener('click', function () { toggleAula(row, aula); });
      headerEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { if (e.preventDefault) e.preventDefault(); toggleAula(row, aula); }
      });
    }
    var bannerEl = row.querySelector('.aula-novo-banner');
    if (bannerEl) {
      var openAndScroll = function () {
        if (!row.classList.contains('is-open')) toggleAula(row, aula);
        // After the body is appended, scroll the first NOVO item into view.
        requestAnimationFrame(function () {
          var firstFresh = row.querySelector('.sub .novo-pill');
          if (firstFresh && firstFresh.closest) {
            var subEl = firstFresh.closest('.sub');
            if (subEl && subEl.scrollIntoView) subEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        });
      };
      bannerEl.addEventListener('click', function (e) {
        if (e.stopPropagation) e.stopPropagation();
        openAndScroll();
      });
      bannerEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { if (e.preventDefault) e.preventDefault(); openAndScroll(); }
      });
    }
    return row;
  }

  function toggleAula(row, aula) {
    var card = row.querySelector('.card');
    var headerEl = row.querySelector('.card-header');
    var isOpen = card.classList.contains('open');

    if (isOpen) { closeAulaRow(row); return; }

    var mobile = Trilha.State.isFocusMode();
    if (mobile) {
      document.querySelectorAll('.tl-row.is-open').forEach(function (other) {
        if (other !== row) closeAulaRow(other);
      });
    }

    card.classList.add('open');
    row.classList.add('is-open');
    if (headerEl) headerEl.setAttribute('aria-expanded', 'true');
    card.appendChild(buildAulaBody(aula));

    if (mobile && typeof window.scrollTo === 'function') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function buildAulaBody(aula) {
    var data = Trilha.State.data || {};
    var items = data.items || [];
    var apostilaSet = data.apostila_set;
    var apostilaSetId = apostilaSet ? apostilaSet.id : null;

    var aulaItems = items.filter(function (it) { return it.aula_number === aula.aula_number; });

    var tarefaItems = aulaItems
      .filter(function (it) { return it.type === 'tarefa'; })
      .sort(function (a, b) { return (a.position || 0) - (b.position || 0); });

    var apostilaItems = aulaItems
      .filter(function (it) {
        return apostilaSetId !== null && it.set_id === apostilaSetId && it.type !== 'tarefa';
      })
      .sort(function (a, b) { return (a.set_position || 0) - (b.set_position || 0); });

    var outrosItems = aulaItems
      .filter(function (it) {
        if (apostilaSetId !== null && it.set_id === apostilaSetId) return false;
        if (it.type === 'tarefa') return false;
        return true;
      })
      .sort(function (a, b) { return (a.position || 0) - (b.position || 0); });

    var body = document.createElement('div');
    body.className = 'body';
    body.classList.add('body');

    if (tarefaItems.length) {
      body.appendChild(buildSection(tarefaItems.length === 1 ? 'Tarefa' : 'Tarefas', tarefaItems, { isTarefa: true }));
    }
    if (apostilaItems.length) {
      body.appendChild(buildSection('Conteúdo da aula', apostilaItems, { isApostila: true }));
    }
    if (outrosItems.length) {
      body.appendChild(buildOutrosSection(outrosItems));
    }
    if (!tarefaItems.length && !apostilaItems.length && !outrosItems.length) {
      body.innerHTML = '<div class="tr-empty">Nenhum conteúdo disponível nesta aula ainda.</div>';
    }
    return body;
  }

  function buildSection(label, items, opts) {
    opts = opts || {};
    var esc = Trilha.Utils.esc;
    var section = document.createElement('div');
    section.className = 'section';
    section.classList.add('section');
    section.innerHTML = '<div class="section-label">' + esc(label) + '</div>';
    var list = document.createElement('div');
    list.className = 'sub-list';
    list.classList.add('sub-list');
    items.forEach(function (item) { list.appendChild(Trilha.Sub.buildSub(item, opts)); });
    section.appendChild(list);
    return section;
  }

  // Outros materiais within an aula: same shape as a section, but with a
  // type-filter chip strip mirroring the standalone Outros tab. Filter state
  // is per-section (closure-scoped); collapsing and reopening the aula resets it.
  function buildOutrosSection(items) {
    var section = document.createElement('div');
    section.className = 'section';
    section.classList.add('section');
    section.innerHTML = '<div class="section-label">Outros materiais</div>';

    var filterEl = document.createElement('div');
    filterEl.className = 'tr-type-filter';
    filterEl.classList.add('tr-type-filter');
    section.appendChild(filterEl);

    var list = document.createElement('div');
    list.className = 'sub-list';
    list.classList.add('sub-list');
    section.appendChild(list);

    var seen = {};
    var types = [];
    items.forEach(function (it) {
      if (seen[it.type]) return;
      seen[it.type] = true;
      types.push({ slug: it.type, label: it.type_label || it.type, icon: it.type_icon || '' });
    });

    var selectedSlug = null;

    function renderList() {
      var filtered = window.CT_TYPE_FILTER ? window.CT_TYPE_FILTER.apply(items, selectedSlug) : items;
      list.innerHTML = '';
      filtered.forEach(function (item) { list.appendChild(Trilha.Sub.buildSub(item)); });
    }

    function rerenderFilter() {
      if (!window.CT_TYPE_FILTER) return;
      window.CT_TYPE_FILTER.render({
        container: filterEl,
        types: types,
        items: items,
        selectedSlug: selectedSlug,
        onChange: function (slug) {
          selectedSlug = slug;
          rerenderFilter();
          renderList();
        },
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

  Trilha.Aulas = {
    closeAulaRow: closeAulaRow,
    wireBackPill: wireBackPill,
    wireMqMobile: wireMqMobile,
    renderAulas: renderAulas,
    buildAulaRow: buildAulaRow,
    toggleAula: toggleAula,
    buildAulaBody: buildAulaBody,
    buildSection: buildSection,
    buildOutrosSection: buildOutrosSection,
  };
})();
