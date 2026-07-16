// codex/trilha/js/forum.js
// Fórum tab: the per-turma discussion board (board-of-topics, mock Opção 1). Lists
// threads (pinned first), opens a thread inline with one-level-nested replies + a
// reply composer, and lets a logged-in student open a new conversation and edit
// their own posts. The whole tab is gated by the student session (you must be
// logged in to read/post); the Fórum tab only appears when the turma enabled it
// (page.js). Honors the ?thread=<id> deeplink the notification bell emits.
//
// Pure helpers (relTime / initials / threadMeta) are unit-tested; the DOM wiring is
// verified visually on staging. Backend strictly through the Trail facade (api.js).
import { state } from './state.js';
import { esc } from './utils.js';
import { trail } from './api.js';
import { t } from '../i18n.js';
import { registerRenderer } from './page.js';
import { relTime } from '../../js/rel-time.js';
import { initials } from '../../js/initials.js';

// ── Pure helpers (tested) ────────────────────────────────────────────────────

// Coarse relative time + avatar initials, both shared with the rest of Codex
// (js/rel-time.js, js/initials.js — ONE initials rule app-wide). Re-exported so
// this module's tests and consumers keep one import surface.
export { relTime, initials };

// The thread meta line: author · opened · N replies.
export function threadMeta(th, now) {
  const author = th.author_is_admin ? t('forum.professor') : (th.author_name || '');
  // post_count includes the opening post, so replies = post_count - 1.
  const replies = Math.max(0, (th.post_count || 1) - 1);
  const repWord = replies === 1 ? t('forum.reply_one') : t('forum.replies');
  return { author, replies, repWord, opened: relTime(th.last_activity_at || th.created_at, now) };
}

// ── DOM ──────────────────────────────────────────────────────────────────────

let _root = null;       // the #cdx-tr-forum-root mount
let _threads = [];      // last loaded thread list
let _openId = null;     // currently expanded thread id
let _pendingFocus = null; // a thread the bell asked us to open on the next render

function avatar(name, mods = '') {
  return '<div class="cdx-fr-avatar' + mods + '">' + esc(initials(name) || '·') + '</div>';
}

function myName() {
  const p = (state.data || {}).participant || {};
  return p.name || '';   // ONE name (track-42): the forum is always explicit (Élder)
}

function meParticipantId() {
  const p = (state.data || {}).participant || {};
  return p.id != null ? p.id : null;
}

export async function renderForum(root) {
  _root = root.querySelector('#cdx-tr-forum-root') || root;
  if (!state.sessionToken) {
    _root.innerHTML = '<div class="cdx-fr-login"><p>' + esc(t('forum.login_cta')) + '</p></div>';
    return;
  }
  _root.innerHTML = '<div class="cdx-tr-empty">' + esc(t('page.loading')) + '</div>';
  try {
    const res = await trail.forumListThreads({ session_token: state.sessionToken, _silent: true });
    _threads = (res && res.threads) || [];
  } catch (e) {
    if (window.bsLog) window.bsLog('forum listThreads: ' + (e && e.message || e), 'error');
    _root.innerHTML = '<div class="cdx-tr-empty">' + esc(t('forum.load_error')) + '</div>';
    return;
  }
  paintBoard();
  // Open a thread straight away when one was requested: the in-app bell sets
  // _pendingFocus (no reload), the cross-page deeplink carries ?thread=<id>.
  const wanted = _pendingFocus || deeplinkThreadId();
  _pendingFocus = null;
  if (wanted) openThread(wanted);
}

// Open the Fórum tab and a specific thread WITHOUT a page reload. Called by the
// student notification bell: the student is already on this turma's page, so we
// just switch tabs and expand the thread in place. Forces a fresh board render so
// a brand-new thread (the notification's subject) is present before we open it.
export function focusThread(id) {
  _pendingFocus = id || null;
  state.rendered.forum = false; // make the page re-render the panel on show
  if (typeof window !== 'undefined' && window.location) {
    if (window.location.hash !== '#forum') { window.location.hash = '#forum'; return; } // hashchange -> showTab -> renderForum
  }
  // Already on #forum (no hashchange will fire): render right here.
  const root = (typeof document !== 'undefined') && document.getElementById('cdx-trilha-root');
  if (root) renderForum(root);
}

function deeplinkThreadId() {
  try {
    const v = new URLSearchParams(location.search).get('thread');
    const n = v ? parseInt(v, 10) : 0;
    return n > 0 ? n : null;
  } catch (_) { return null; }
}

function paintBoard() {
  const now = Math.floor(Date.now() / 1000);
  let html = '<div class="cdx-fr-wrap">';
  html += '<p class="cdx-fr-intro">' + esc(t('forum.intro')) + '</p>';
  // Composer (collapsed): a fake input that expands into the new-thread form.
  html +=
    '<div class="cdx-fr-composer" data-fr-newopen>' +
      avatar(myName()) +
      '<div class="cdx-fr-composer-fake">' + esc(t('forum.start')) + '</div>' +
      '<button class="cdx-fr-btn cdx-btn cdx-btn-primary cdx-btn-sm" type="button">' + esc(t('forum.publish')) + '</button>' +
    '</div>';
  html += '<form class="cdx-fr-newform" hidden>' +
      '<input class="cdx-fr-new-title" type="text" placeholder="' + esc(t('forum.new_title_ph')) + '" maxlength="160">' +
      '<textarea class="cdx-fr-new-body" rows="3" placeholder="' + esc(t('forum.new_body_ph')) + '"></textarea>' +
      '<div class="cdx-fr-newform-actions">' +
        '<button type="button" class="cdx-fr-btn cdx-btn cdx-btn-vazado cdx-btn-sm" data-fr-newcancel>' + esc(t('forum.cancel')) + '</button>' +
        '<button type="submit" class="cdx-fr-btn cdx-btn cdx-btn-primary cdx-btn-sm">' + esc(t('forum.publish')) + '</button>' +
      '</div>' +
    '</form>';
  if (!_threads.length) {
    html += '<div class="cdx-tr-empty">' + esc(t('forum.empty')) + '</div>';
  } else {
    _threads.forEach((th) => { html += threadCardHtml(th, now); });
  }
  html += '</div>';
  _root.innerHTML = html;
  wireBoard();
}

function threadCardHtml(th, now) {
  const m = threadMeta(th, now);
  const pin = th.pinned ? '<span class="cdx-fr-pin">📌 ' + esc(t('forum.pinned')) + '</span>' : '';
  const profMod = th.author_is_admin ? ' cdx-fr-avatar--prof' : '';
  return '<article class="cdx-fr-thread" data-fr-thread="' + th.id + '">' +
      '<div class="cdx-fr-thread-head" data-fr-open="' + th.id + '">' +
        avatar(m.author, profMod) +
        '<div class="cdx-fr-thread-body">' +
          '<div class="cdx-fr-thread-topline">' + pin +
            '<span class="cdx-fr-thread-title">' + esc(th.title) + '</span></div>' +
          '<div class="cdx-fr-thread-meta">' +
            '<span class="cdx-fr-author">' + esc(m.author) + '</span> · ' + esc(m.opened) +
          '</div>' +
        '</div>' +
        '<span class="cdx-fr-count-pill">💬 ' + m.replies + '</span>' +
      '</div>' +
      '<div class="cdx-fr-replies" hidden></div>' +
    '</article>';
}

function wireBoard() {
  const open = _root.querySelector('[data-fr-newopen]');
  const form = _root.querySelector('.cdx-fr-newform');
  if (open && form) {
    open.addEventListener('click', () => { open.hidden = true; form.hidden = false; const ti = form.querySelector('.cdx-fr-new-title'); if (ti) ti.focus(); });
    const cancel = form.querySelector('[data-fr-newcancel]');
    if (cancel) cancel.addEventListener('click', () => { form.hidden = true; open.hidden = false; });
    form.addEventListener('submit', (e) => { if (e.preventDefault) e.preventDefault(); submitNewThread(form); });
  }
  _root.querySelectorAll('[data-fr-open]').forEach((head) => {
    head.addEventListener('click', () => {
      const id = parseInt(head.getAttribute('data-fr-open'), 10);
      if (_openId === id) collapseThread(id); else openThread(id);
    });
  });
  if (_openId) { const a = _root.querySelector('[data-fr-thread="' + _openId + '"]'); if (a) a.classList.add('open'); }
}

async function submitNewThread(form) {
  const title = (form.querySelector('.cdx-fr-new-title').value || '').trim();
  const body = (form.querySelector('.cdx-fr-new-body').value || '').trim();
  if (!title || !body) return;
  const btn = form.querySelector('button[type="submit"]');
  if (btn) btn.disabled = true;
  try {
    await trail.forumCreateThread({ session_token: state.sessionToken, title, body });
    const res = await trail.forumListThreads({ session_token: state.sessionToken, _silent: true });
    _threads = (res && res.threads) || [];
    _openId = null;
    paintBoard();
  } catch (e) {
    if (window.bsLog) window.bsLog('forum submitNewThread: ' + (e && e.message || e), 'error');
  } finally { if (btn) btn.disabled = false; }
}

async function openThread(id) {
  const article = _root.querySelector('[data-fr-thread="' + id + '"]');
  if (!article) return;
  if (_openId && _openId !== id) collapseThread(_openId);
  _openId = id;
  article.classList.add('open');
  const box = article.querySelector('.cdx-fr-replies');
  if (!box) return;
  box.hidden = false;
  box.innerHTML = '<div class="cdx-tr-empty">' + esc(t('page.loading')) + '</div>';
  let data;
  try { data = await trail.forumGetThread({ session_token: state.sessionToken, thread_id: id, _silent: true }); }
  catch (e) { if (window.bsLog) window.bsLog('forum openThread: ' + (e && e.message || e), 'error'); box.innerHTML = '<div class="cdx-tr-empty">' + esc(t('forum.load_error')) + '</div>'; return; }
  paintReplies(box, id, (data && data.posts) || []);
}

function collapseThread(id) {
  const article = _root.querySelector('[data-fr-thread="' + id + '"]');
  if (article) {
    article.classList.remove('open');
    const box = article.querySelector('.cdx-fr-replies');
    if (box) { box.hidden = true; box.innerHTML = ''; }
  }
  if (_openId === id) _openId = null;
}

// Flatten the opening post + its replies into one chronological reply stream (the
// board shows posts, not a tree; one-level nesting collapses to a flat list here).
function paintReplies(box, threadId, posts) {
  const now = Math.floor(Date.now() / 1000);
  const flat = [];
  posts.forEach((p) => { flat.push(p); (p.replies || []).forEach((r) => flat.push(r)); });
  let html = '';
  flat.forEach((p) => { html += replyHtml(p, now); });
  html += '<div class="cdx-fr-reply-composer">' +
      avatar(myName(), ' cdx-fr-avatar--sm') +
      '<input class="cdx-fr-reply-input" type="text" placeholder="' + esc(t('forum.reply_ph')) + '">' +
      '<button class="cdx-fr-btn cdx-btn cdx-btn-primary cdx-btn-sm" type="button" data-fr-send="' + threadId + '">' + esc(t('forum.send')) + '</button>' +
    '</div>';
  box.innerHTML = html;
  wireReplies(box, threadId);
}

function replyHtml(p, now) {
  const prof = !!p.author_is_admin;
  const name = prof ? t('forum.professor') : (p.author_name || '');
  const badge = prof ? '<span class="cdx-fr-prof-badge">' + esc(t('forum.professor')) + '</span>' : '';
  const mine = !prof && meParticipantId() != null && p.author_participant_id === meParticipantId();
  const editBtn = mine ? '<button class="cdx-fr-reply-action" type="button" data-fr-edit="' + p.id + '">' + esc(t('forum.edit')) + '</button>' : '';
  return '<div class="cdx-fr-reply" data-fr-post="' + p.id + '">' +
      avatar(name, ' cdx-fr-avatar--sm' + (prof ? ' cdx-fr-avatar--prof' : '')) +
      '<div class="cdx-fr-reply-body">' +
        '<div class="cdx-fr-reply-head">' +
          '<span class="cdx-fr-reply-name">' + esc(name) + '</span>' + badge +
          '<span class="cdx-fr-reply-time">' + esc(relTime(p.created_at, now)) + '</span>' +
        '</div>' +
        '<p class="cdx-fr-reply-text">' + esc(p.body) + '</p>' +
        (editBtn ? '<div class="cdx-fr-reply-actions">' + editBtn + '</div>' : '') +
      '</div>' +
    '</div>';
}

function wireReplies(box, threadId) {
  const send = box.querySelector('[data-fr-send]');
  const input = box.querySelector('.cdx-fr-reply-input');
  if (send && input) {
    const go = async () => {
      const body = (input.value || '').trim();
      if (!body) return;
      send.disabled = true;
      try {
        await trail.forumCreatePost({ session_token: state.sessionToken, thread_id: threadId, body });
        await refreshOpen(threadId);
      } catch (e) {
        if (window.bsLog) window.bsLog('forum createPost: ' + (e && e.message || e), 'error');
      } finally { send.disabled = false; }
    };
    send.addEventListener('click', go);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { if (e.preventDefault) e.preventDefault(); go(); } });
  }
  box.querySelectorAll('[data-fr-edit]').forEach((btn) => {
    btn.addEventListener('click', () => beginEdit(box, threadId, parseInt(btn.getAttribute('data-fr-edit'), 10)));
  });
}

function beginEdit(box, threadId, postId) {
  const row = box.querySelector('[data-fr-post="' + postId + '"] .cdx-fr-reply-text');
  if (!row || row.dataset.editing) return;
  row.dataset.editing = '1';
  const current = row.textContent;
  row.innerHTML = '<textarea class="cdx-fr-edit-input" rows="2"></textarea>' +
    '<div class="cdx-fr-reply-actions">' +
      '<button class="cdx-fr-reply-action" type="button" data-fr-editsave>' + esc(t('forum.save')) + '</button>' +
      '<button class="cdx-fr-reply-action" type="button" data-fr-editcancel>' + esc(t('forum.cancel')) + '</button>' +
    '</div>';
  const ta = row.querySelector('.cdx-fr-edit-input');
  ta.value = current; ta.focus();
  row.querySelector('[data-fr-editcancel]').addEventListener('click', () => refreshOpen(threadId));
  row.querySelector('[data-fr-editsave]').addEventListener('click', async () => {
    const body = (ta.value || '').trim();
    if (!body) return;
    try {
      await trail.forumEditPost({ session_token: state.sessionToken, post_id: postId, body });
      await refreshOpen(threadId);
    } catch (e) {
      if (window.bsLog) window.bsLog('forum editPost: ' + (e && e.message || e), 'error');
    }
  });
}

async function refreshOpen(threadId) {
  const article = _root.querySelector('[data-fr-thread="' + threadId + '"]');
  const box = article && article.querySelector('.cdx-fr-replies');
  if (!box) return;
  let data;
  try { data = await trail.forumGetThread({ session_token: state.sessionToken, thread_id: threadId, _silent: true }); }
  catch (e) { if (window.bsLog) window.bsLog('forum refreshOpen: ' + (e && e.message || e), 'error'); return; }
  paintReplies(box, threadId, (data && data.posts) || []);
}

registerRenderer('forum', renderForum);
