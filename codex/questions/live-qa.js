// questions/live-qa.js
// Codex-owned, faithful port of the legacy student Q&A feed (classpulse-qa.js):
// the right-column instructor surface that lists student questions and lets the
// host promote them to the display, answer them inline, dismiss, or delete. A
// native ES module: backend through the codex-api facade, strings via t(),
// cdx- classes, and an owned poll timer torn down by destroy().
//
// createQaFeed(opts) returns { syncFromState, setSessionCode, destroy }, mirroring
// the legacy attach() contract so the live host can drive it from the session
// poll. Q&A is implicitly always-on here (no toggle UI), matching the legacy host.
import { questions as api } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import { hostLabel } from './identity.js';

const POLL_MS = 4000;

function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatTime(iso) {
  try { return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
  catch (_) { return ''; }
}

export function createQaFeed(opts) {
  let sessionCode = opts.sessionCode;
  const feedEl  = opts.feedEl;
  const badgeEl = opts.badgeEl;
  const onError = typeof opts.onError === 'function' ? opts.onError : () => {};

  let _questions = [];
  let _activeStudentQuestionId = null;
  let _activeQuestionId = null;
  let _activeQuestionText = null;
  const _drafts = {};
  let _focusedRowId = null;
  let _resolvedOpen = false;
  let _pollTimer = null;
  let _attached = true;
  let _busy = false;

  function startPoll() {
    if (_pollTimer) return;
    poll();
    _pollTimer = setInterval(poll, POLL_MS);
  }

  function stopPoll() {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  }

  function poll() {
    if (!_attached) return;
    api.listStudentQuestions({ session_code: sessionCode }).then((res) => {
      if (!res || !res.ok) return;
      _questions = res.questions || [];
      render();
    }).catch((err) => { onError(err && err.message ? err.message : String(err)); });
  }

  function updateBadge(count) {
    if (!badgeEl) return;
    badgeEl.textContent = count ? String(count) : '';
    badgeEl.style.display = count ? '' : 'none';
  }

  function updateBadgeOnly() {
    const pending = _questions.filter((q) => q.status === 'pending');
    updateBadge(pending.length);
  }

  function render() {
    if (!feedEl) return;
    // Skip a destructive re-render while the host is typing in an answer box;
    // drafts are still hoisted so a later render repopulates them.
    if (_focusedRowId !== null) { updateBadgeOnly(); return; }

    const prevDetails = feedEl.querySelector('details.cdx-qa-resolved');
    if (prevDetails) _resolvedOpen = prevDetails.open;

    const pending  = _questions.filter((q) => q.status === 'pending');
    const resolved = _questions.filter((q) => q.status !== 'pending').reverse();
    updateBadge(pending.length);

    let html = '';
    if (pending.length === 0 && resolved.length === 0) {
      html = '<p class="cdx-qa-empty">' + escHtml(t('questions.qa_empty')) + '</p>';
    } else {
      pending.forEach((q) => { html += renderRow(q, true); });
      if (resolved.length) {
        html += '<details class="cdx-qa-resolved"' + (_resolvedOpen ? ' open' : '') + '><summary>' +
          escHtml(t('questions.qa_see_resolved')) + ' (' + resolved.length + ')</summary>';
        resolved.forEach((q) => { html += renderRow(q, false); });
        html += '</details>';
      }
    }
    feedEl.innerHTML = html;
    restoreDrafts();
    wireRowEvents();
    wireResolvedToggle();
  }

  function renderRow(q, showActions) {
    const onDisplay = _activeStudentQuestionId === q.id;
    const rowClasses = 'cdx-qa-row cdx-qa-' + q.status + (onDisplay ? ' cdx-qa-pinned' : '');
    let html = '<div class="' + rowClasses + '" data-qa-row-id="' + escHtml(q.id) + '">'
      + '<div class="cdx-qa-meta-row">'
      +   '<span class="cdx-qa-meta">' + escHtml(hostLabel(q.student_name)) + ' &middot; ' + formatTime(q.created_at) + '</span>'
      +   (onDisplay ? '<span class="cdx-qa-pin-badge">' + escHtml(t('questions.qa_on_display')) + '</span>' : '')
      + '</div>'
      + '<p class="cdx-qa-text">' + escHtml(q.text) + '</p>';

    if (q.answer && q.status !== 'pending') {
      html += '<p class="cdx-qa-answer-text"><strong>' + escHtml(t('questions.qa_answer_label')) + ':</strong> ' + escHtml(q.answer) + '</p>';
    }

    if (showActions && onDisplay) {
      html += '<div class="cdx-qa-actions"><div class="cdx-qa-action-buttons">'
        + '<button class="cdx-btn cdx-btn-danger cdx-qa-btn-sm" data-qa-action="close-active" data-qa-id="' + escHtml(q.id) + '" type="button">' + escHtml(t('questions.qa_close_on_display')) + '</button>'
        + '</div></div>';
    } else if (showActions) {
      html += '<div class="cdx-qa-actions">'
        + '<textarea class="cdx-qa-answer-input" data-qa-answer-input="' + escHtml(q.id) + '" placeholder="' + escHtml(t('questions.qa_answer_placeholder')) + '" maxlength="500" rows="2"></textarea>'
        + '<div class="cdx-qa-action-buttons">'
        +   '<button class="cdx-btn cdx-btn-primary cdx-qa-btn-sm" data-qa-action="promote" data-qa-id="' + escHtml(q.id) + '" type="button">' + escHtml(t('questions.qa_show_on_display')) + '</button>'
        +   '<button class="cdx-btn cdx-qa-btn-sm" data-qa-action="answer" data-qa-id="' + escHtml(q.id) + '" type="button">' + escHtml(t('questions.qa_answer_here')) + '</button>'
        +   '<button class="cdx-btn cdx-qa-btn-sm" data-qa-action="dismiss" data-qa-id="' + escHtml(q.id) + '" type="button">' + escHtml(t('questions.qa_dismiss')) + '</button>'
        +   '<button class="cdx-btn cdx-btn-danger cdx-qa-btn-sm" data-qa-action="delete" data-qa-id="' + escHtml(q.id) + '" type="button" title="' + escHtml(t('questions.qa_delete')) + '">' + escHtml(t('questions.qa_delete')) + '</button>'
        + '</div>'
        + '</div>';
    } else if (q.status !== 'pending') {
      html += '<div class="cdx-qa-actions"><div class="cdx-qa-action-buttons">'
        + '<button class="cdx-btn cdx-qa-btn-sm" data-qa-action="promote" data-qa-id="' + escHtml(q.id) + '" type="button">' + escHtml(t('questions.qa_show_on_display')) + '</button>'
        + '<button class="cdx-btn cdx-btn-danger cdx-qa-btn-sm" data-qa-action="delete" data-qa-id="' + escHtml(q.id) + '" type="button" title="' + escHtml(t('questions.qa_delete')) + '">' + escHtml(t('questions.qa_delete')) + '</button>'
        + '</div></div>';
    }
    html += '</div>';
    return html;
  }

  function restoreDrafts() {
    feedEl.querySelectorAll('[data-qa-answer-input]').forEach((inp) => {
      const rowId = inp.dataset.qaAnswerInput;
      if (_drafts[rowId]) inp.value = _drafts[rowId];
    });
  }

  function wireResolvedToggle() {
    const d = feedEl.querySelector('details.cdx-qa-resolved');
    if (d) d.addEventListener('toggle', () => { _resolvedOpen = d.open; });
  }

  function wireRowEvents() {
    feedEl.querySelectorAll('[data-qa-answer-input]').forEach((inp) => {
      inp.addEventListener('input', onInputChange);
      inp.addEventListener('focus', onInputFocus);
      inp.addEventListener('blur', onInputBlur);
    });
    feedEl.querySelectorAll('[data-qa-action]').forEach((btn) => btn.addEventListener('click', onActionClick));
  }

  function onInputChange(ev) { _drafts[ev.currentTarget.dataset.qaAnswerInput] = ev.currentTarget.value; }
  function onInputFocus(ev) { _focusedRowId = ev.currentTarget.dataset.qaAnswerInput; }
  function onInputBlur(ev) {
    const rowId = ev.currentTarget.dataset.qaAnswerInput;
    _drafts[rowId] = ev.currentTarget.value;
    if (_focusedRowId === rowId) _focusedRowId = null;
    poll();
  }

  function onActionClick(ev) {
    const btn = ev.currentTarget;
    const action = btn.dataset.qaAction;
    const id = btn.dataset.qaId;
    if (!action || !id || _busy) return;
    if (action === 'answer') { doUpdate(id, 'answered', _drafts[id] || ''); delete _drafts[id]; }
    else if (action === 'dismiss') { doUpdate(id, 'dismissed', null); delete _drafts[id]; }
    else if (action === 'promote') { doPromote(id); }
    else if (action === 'close-active') { doCloseActive(); }
    else if (action === 'delete') { doDelete(id); }
  }

  function confirmDestructive(msg) {
    return (typeof confirm === 'function') ? confirm(msg) : true;
  }

  function doDelete(id) {
    if (!confirmDestructive(t('questions.qa_delete_confirm'))) return;
    _busy = true;
    api.deleteStudentQuestion({ id }).then((res) => {
      if (!res || !res.ok) onError((res && res.error) || t('questions.qa_err_delete'));
      else delete _drafts[id];
      poll();
    }).catch((err) => onError(err && err.message ? err.message : String(err)))
      .finally(() => { _busy = false; });
  }

  function doUpdate(id, status, answer) {
    _busy = true;
    api.updateStudentQuestion({ id, status, answer }).then((res) => {
      if (!res || !res.ok) onError((res && res.error) || t('questions.qa_err_update'));
      poll();
    }).catch((err) => onError(err && err.message ? err.message : String(err)))
      .finally(() => { _busy = false; });
  }

  function doPromote(id) {
    if (_activeQuestionId && _activeStudentQuestionId !== id) {
      let snippet = (_activeQuestionText || '').replace(/\s+/g, ' ').trim();
      if (snippet.length > 90) snippet = snippet.slice(0, 87) + '...';
      if (!confirmDestructive(t('questions.qa_promote_confirm').replace('{q}', snippet))) return;
    }
    _busy = true;
    api.promoteStudentQuestion({ id, session_code: sessionCode }).then((res) => {
      if (!res || !res.ok) onError((res && res.error) || t('questions.qa_err_promote'));
      poll();
      if (typeof opts.onPromoted === 'function') opts.onPromoted();
    }).catch((err) => onError(err && err.message ? err.message : String(err)))
      .finally(() => { _busy = false; });
  }

  function doCloseActive() {
    if (!_activeQuestionId) return;
    _busy = true;
    api.closeQuestion({ id: _activeQuestionId, session_code: sessionCode, show_results: false, reveal_answer: false }).then((res) => {
      if (!res || !res.ok) onError((res && res.error) || t('questions.qa_err_close'));
      poll();
      if (typeof opts.onClosedActive === 'function') opts.onClosedActive();
    }).catch((err) => onError(err && err.message ? err.message : String(err)))
      .finally(() => { _busy = false; });
  }

  // Q&A is implicitly always-on (no toggle UI), so force server state to match
  // and begin polling immediately.
  api.toggleQa({ code: sessionCode, enabled: 1 }).catch((e) => { if (window.bsLog) window.bsLog('live-qa: toggle failed: ' + (e && e.message || e), 'error'); });
  startPoll();

  return {
    syncFromState(state) {
      if (!state) return;
      const prevActive = _activeStudentQuestionId;
      const prevActiveQ = _activeQuestionId;
      if (state.active_question) {
        _activeQuestionId = state.active_question.id;
        _activeQuestionText = state.active_question.text || '';
        _activeStudentQuestionId = state.active_question.type === 'student_qa'
          ? (state.active_question.student_question_id || null)
          : null;
      } else {
        _activeStudentQuestionId = null;
        _activeQuestionId = null;
        _activeQuestionText = null;
      }
      if (prevActive !== _activeStudentQuestionId || prevActiveQ !== _activeQuestionId) render();
    },
    setSessionCode(code) { sessionCode = code; poll(); },
    destroy() { _attached = false; stopPoll(); },
  };
}
