(function () {
  var _cfg = null;
  var editingBank = false;
  var selectedIds = new Set();
  var dragSrcId = null;

  function exitEditMode() {
    editingBank = false;
    selectedIds.clear();
    dragSrcId = null;
    var list = document.getElementById('question-list');
    if (list) list.classList.remove('is-editing');
    var btn = document.getElementById('edit-bank-btn');
    if (btn) btn.textContent = 'Editar banco';
    var bar = document.getElementById('cp-move-bar');
    if (bar) bar.style.display = 'none';
  }

  function renderMoveBar() {
    var bar = document.getElementById('cp-move-bar');
    if (!bar) return;
    var count = selectedIds.size;
    if (count === 0 || !editingBank) { bar.style.display = 'none'; return; }
    bar.style.display = 'flex';
    document.getElementById('cp-move-count').textContent =
      'Mover ' + count + ' selecionada' + (count === 1 ? '' : 's') + ':';
    var dest = document.getElementById('cp-move-dest');
    dest.innerHTML = '';
    _cfg.getSets().filter(function (s) {
      return !s._inputRow && !s._ephemeral && s.list_name !== _cfg.getActiveSet();
    }).forEach(function (s) {
      var opt = document.createElement('option');
      opt.value = s.list_name; opt.textContent = s.list_name;
      dest.appendChild(opt);
    });
  }

  function syncListClass(listEl) {
    if (editingBank) listEl.classList.add('is-editing');
    else listEl.classList.remove('is-editing');
  }

  function decorateCard(card, q, listEl) {
    var handle = document.createElement('span');
    handle.className = 'cp-drag-handle';
    handle.title = 'Arrastar para reordenar';
    handle.textContent = '⠇';

    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'cp-select-cb';
    cb.checked = selectedIds.has(q.id);
    cb.addEventListener('change', function () {
      if (cb.checked) selectedIds.add(q.id);
      else selectedIds.delete(q.id);
      renderMoveBar();
    });

    card.appendChild(handle);
    card.appendChild(cb);

    card.addEventListener('dragstart', function (e) {
      if (!editingBank) { e.preventDefault(); return; }
      dragSrcId = q.id;
      setTimeout(function () { card.classList.add('is-dragging'); }, 0);
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', function () {
      card.classList.remove('is-dragging');
      listEl.querySelectorAll('.drag-over').forEach(function (el) { el.classList.remove('drag-over'); });
    });
    card.addEventListener('dragover', function (e) {
      if (!editingBank || dragSrcId === q.id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      listEl.querySelectorAll('.drag-over').forEach(function (el) { el.classList.remove('drag-over'); });
      card.classList.add('drag-over');
    });
    card.addEventListener('dragleave', function (e) {
      if (!card.contains(e.relatedTarget)) card.classList.remove('drag-over');
    });
    card.addEventListener('drop', function (e) {
      if (!editingBank || dragSrcId === q.id) return;
      e.preventDefault();
      card.classList.remove('drag-over');
      var qs = _cfg.getQuestions();
      var srcIdx = qs.findIndex(function (x) { return x.id === dragSrcId; });
      var tgtIdx = qs.findIndex(function (x) { return x.id === q.id; });
      if (srcIdx === -1 || tgtIdx === -1) return;
      var moved = qs.splice(srcIdx, 1)[0];
      qs.splice(tgtIdx, 0, moved);
      dragSrcId = null;
      _cfg.onRenderQuestions();
      var orderedIds = qs.map(function (x) { return x.id; });
      _cfg.callWorker({
        action: 'reorder_questions', auth_token: _cfg.getAuthToken(),
        list_name: _cfg.getActiveSet(), ordered_ids: orderedIds
      }).catch(function (err) {
        _cfg.showToastError('Erro ao salvar ordem: ' + err.message);
        _cfg.onRefresh();
      });
    });
  }

  function init(cfg) {
    _cfg = cfg;

    document.getElementById('edit-bank-btn').addEventListener('click', function () {
      if (!_cfg.getActiveSet()) return;
      if (editingBank) {
        exitEditMode();
        _cfg.onRenderQuestions();
      } else {
        editingBank = true;
        document.getElementById('question-list').classList.add('is-editing');
        this.textContent = 'Concluir';
        renderMoveBar();
      }
    });

    document.getElementById('cp-move-btn').addEventListener('click', async function () {
      var destName = document.getElementById('cp-move-dest').value;
      if (!destName || selectedIds.size === 0) return;
      var btn = this;
      btn.disabled = true; btn.textContent = 'Movendo...';
      var ids = Array.from(selectedIds);
      var toMove = _cfg.getQuestions().filter(function (q) { return ids.indexOf(q.id) !== -1; });
      try {
        for (var i = 0; i < toMove.length; i++) {
          var q = toMove[i];
          await _cfg.callWorker({
            action: 'update_question', auth_token: _cfg.getAuthToken(),
            list_name: _cfg.getActiveSet(), original_question: q.question,
            question: q.question, type: q.type,
            options: typeof q.options === 'string' ? q.options : JSON.stringify(q.options || []),
            correct_answer: q.correct_answer != null ? q.correct_answer : '',
            new_list_name: destName
          });
        }
        selectedIds.clear();
        _cfg.showToast(toMove.length + ' questão(ões) movida(s) para "' + _cfg.escHtml(destName) + '".');
        await _cfg.onRefresh();
      } catch (e) {
        _cfg.showToastError(e.message);
      } finally {
        btn.disabled = false; btn.textContent = 'Mover';
      }
    });

    document.getElementById('cp-move-cancel-btn').addEventListener('click', function () {
      selectedIds.clear();
      renderMoveBar();
      _cfg.onRenderQuestions();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (document.getElementById('q-modal').style.display === 'flex') return;
      if (document.getElementById('bulk-modal').style.display === 'flex') return;
      if (editingBank) { exitEditMode(); _cfg.onRenderQuestions(); }
    });
  }

  window.BankEditMode = {
    init: init,
    isActive: function () { return editingBank; },
    exitEditMode: exitEditMode,
    syncListClass: syncListClass,
    renderMoveBar: renderMoveBar,
    decorateCard: decorateCard
  };
})();
