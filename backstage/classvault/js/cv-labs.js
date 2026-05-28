'use strict';

// ClassVault — Labs section.
// PensoLabs demos are shipped artifacts (not user-authored), so the registry
// lives in code, not the DB. Each lab is rendered as a synthetic item with a
// 'lab:<key>' id so the existing click handler + iframe renderer pick it up
// without schema changes. Items are wired through ClassVault.renderers.lab.
window.CVLabs = (function() {

  const LABS = [
    {
      key: 'k1',
      title: 'Atenção!',
      summary: 'Contexto reescreve significado'
    },
    {
      key: 'k2',
      title: 'Temperatura',
      summary: 'Distribuição, amostragem, sobreajuste'
    },
    {
      key: 'k3',
      title: 'Janela de contexto',
      summary: 'Orçamento de tokens e compactação'
    },
    {
      key: 'k4',
      title: 'Perdido no meio',
      summary: 'Acurácia cai onde a atenção afrouxa'
    }
  ];

  function _esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // Reads the on/off map written by the Conteúdo > Labs subtab (CTLabsPanel).
  // Default-on: a missing key = enabled. Disabled labs are filtered from the
  // Aula index and from getAllItems so the Presets picker can't reach them.
  function isLabEnabled(key) {
    try {
      var raw = localStorage.getItem('cv_labs_enabled');
      if (!raw) return true;
      var map = JSON.parse(raw);
      return !map || map[key] !== false;
    } catch (e) { return true; }
  }
  function _enabledLabs() {
    return LABS.filter(function (l) { return isLabEnabled(l.key); });
  }

  // Build the synthetic item shape ClassVault renderers expect.
  function labToItem(lab) {
    return {
      id: 'lab:' + lab.key,
      type: 'lab',
      type_label: 'Lab',
      title: lab.title,
      summary: lab.summary,
      meta_json: { url: '/backstage/labs/' + lab.key + '/' }
    };
  }

  function findItem(idStr) {
    if (!idStr || String(idStr).indexOf('lab:') !== 0) return null;
    const key = String(idStr).slice(4);
    const lab = LABS.find(l => l.key === key);
    return lab ? labToItem(lab) : null;
  }

  // Render the full Labs section (header + body) as a string. The header uses
  // the same cv-sm-section markup as Hoje/Vault/Trilha so the existing
  // collapse-on-click handler in _wireItemClicks works without changes.
  // Glyph kept inline; classvault.css sets the section color via .cv-sm-section--labs.
  const LABS_GLYPH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3v6.5L4 18a3 3 0 002.6 4.5h10.8A3 3 0 0020 18l-5-8.5V3"/><path d="M8 3h8"/></svg>';

  function renderSection(collapsedSet) {
    const key = 'labs';
    const isCollapsed = collapsedSet && collapsedSet.has(key);
    // Only render enabled labs. Disabled ones are hidden from Aula entirely.
    const visible = _enabledLabs();
    const headerHtml =
      '<button type="button" class="cv-sm-section cv-sm-section--labs' + (isCollapsed ? ' is-collapsed' : '') + '" ' +
        'data-section="' + _esc(key) + '" aria-expanded="' + (!isCollapsed) + '">' +
        '<span class="cv-sm-section-glyph">' + LABS_GLYPH + '</span>' +
        '<span class="cv-sm-section-label">Labs</span>' +
        '<span class="cv-sm-section-count">' + visible.length + '</span>' +
        '<span class="cv-sm-section-chev">▾</span>' +
      '</button>';
    const bodyHtml = isCollapsed ? '' : visible.map(_renderLabCard).join('');
    return headerHtml + bodyHtml;
  }

  // .sub markup matches the standard item card so _wireItemClicks picks it
  // up and routes to _selectItem → ClassVault.renderers.lab. A dedicated
  // sub-zone--lab class lets CSS color the icon zone distinctively without
  // touching the BSTypeIcon registry.
  function _renderLabCard(lab) {
    return (
      '<div class="sub" data-item-id="lab:' + _esc(lab.key) + '">' +
        '<div class="sub-zone sub-zone--lab">◈</div>' +
        '<div class="sub-meta">' +
          '<span class="sub-type">Lab · ' + _esc(lab.key.toUpperCase()) + '</span>' +
          '<span class="sub-title">' + _esc(lab.title) + '</span>' +
          (lab.summary ? '<span class="sub-sub">' + _esc(lab.summary) + '</span>' : '') +
        '</div>' +
      '</div>'
    );
  }

  // Returns every lab in picker-compatible item shape. Used by the Presets
  // editor (cv-presets-ui.js mountPresetEditor) so labs can be added to
  // presets alongside ct_items rows. Cheap synchronous accessor (no I/O).
  function getAllItems() {
    return _enabledLabs().map(labToItem);
  }

  return {
    LABS: LABS,
    findItem: findItem,
    renderSection: renderSection,
    getAllItems: getAllItems,
    isLabEnabled: isLabEnabled
  };
})();
