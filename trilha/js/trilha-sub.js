'use strict';

// Trilha.Sub -- compact sub-card used inside an aula body (Tarefa /
// Apostila desta aula / Outros materiais). Clicking expands inline below
// with the rendered item content + a right-side action button.

(function () {
  var Trilha = window.Trilha = window.Trilha || {};

  function buildSub(item, opts) {
    opts = opts || {};
    var esc = Trilha.Utils.esc;

    var sub = document.createElement('div');
    sub.className = 'sub' + (opts.isTarefa ? ' sub--tarefa' : '');
    sub.classList.add('sub');
    if (opts.isTarefa) sub.classList.add('sub--tarefa');
    sub.dataset.itemId = item.id;

    var zoneClass = 'sub-zone';
    if (opts.isTarefa) zoneClass += ' sub-zone--tarefa';
    else if (opts.isApostila) zoneClass += ' sub-zone--apostila';

    var icon = opts.isTarefa
      ? (window.BSTypeIcon ? window.BSTypeIcon('tarefa', '✓') : '✓')
      : (window.BSTypeIcon ? window.BSTypeIcon(item.type, item.type_icon || '•') : (item.type_icon || '•'));
    var typeLabel = opts.isTarefa ? 'Tarefa' : (item.type_label || item.type || '');

    sub.innerHTML =
      '<div class="' + zoneClass + '">' + esc(icon) + '</div>' +
      '<div class="sub-meta">' +
        '<span class="sub-type">' + esc(typeLabel) + '</span>' +
        '<span class="sub-title">' + esc(item.title) + '</span>' +
        (item.summary ? '<span class="sub-summary">' + esc(item.summary) + '</span>' : '') +
      '</div>' +
      '<div class="sub-actions"></div>';

    sub.addEventListener('click', function (e) {
      if (e.target && e.target.closest && e.target.closest('.item-action')) return;
      // When open, clicks on the action-area padding (not the button) are dead space.
      if (sub.classList.contains('is-expanded') && e.target && e.target.closest && e.target.closest('.sub-actions')) return;
      toggleSub(sub, item, opts);
    });
    return sub;
  }

  async function toggleSub(sub, item, opts) {
    opts = opts || {};
    var S = Trilha.State;

    var alreadyExpanded = sub.classList.contains('is-expanded');

    var list = sub.parentNode;
    list.querySelectorAll('.sub-expanded').forEach(function (el) { el.remove(); });
    list.querySelectorAll('.sub.is-expanded').forEach(function (el) {
      el.classList.remove('is-expanded');
      var a = el.querySelector('.sub-actions');
      if (a) a.innerHTML = '';
    });

    if (alreadyExpanded) return;

    sub.classList.add('is-expanded');
    var exp = document.createElement('div');
    exp.className = 'sub-expanded';
    exp.classList.add('sub-expanded');
    exp.innerHTML = '<div class="ctr-loading">Carregando...</div>';
    sub.parentNode.insertBefore(exp, sub.nextSibling);

    try {
      var data = await callWorker({
        action: 'ct_get_item_public',
        client_slug: S.clientSlug,
        turma_slug: S.turmaSlug,
        token: S.token,
        item_id: item.id,
        _silent: true,
      });
      exp.innerHTML = '';
      window.CTRenderer.render(data.item, exp, { preview: true });
      Trilha.Actions.injectActionButton(sub, data.item, opts);
    } catch (e) {
      exp.innerHTML = '<div class="tr-empty">Erro ao carregar conteúdo.</div>';
    }
  }

  Trilha.Sub = {
    buildSub: buildSub,
    toggleSub: toggleSub,
  };
})();
