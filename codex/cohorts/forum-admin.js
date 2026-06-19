// codex/cohorts/forum-admin.js
// Fórum moderation inside a turma dossier (2-pane, mock Opção A). The instructor
// moderates ENTIRELY from Codex (no Trilha access), so this carries the full
// toolkit: a thread list (pinned first) on the left, the open thread on the right
// with the professor reply composer, pin/unpin, delete (post or whole thread), and
// edit of his own (admin-authored) posts. Plus "Nova conversa" to open a thread.
//
// Backend strictly via the admin facade (codex-api.js cohorts.forum*). One exported
// entry, mountForumAdmin(el, turma); the module owns its own little render loop.
import { cohorts as api } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import { esc } from '../js/dom.js';
import { relTime } from '../js/rel-time.js';

export function mountForumAdmin(el, turma) {
  if (!el) return;
  const ctx = { el, turma, threads: [], openId: null, detail: null };
  el.innerHTML =
    '<div class="cdx-fa">' +
      '<div class="cdx-fa-list">' +
        '<div class="cdx-fa-list-head">' +
          '<button type="button" class="cdx-btn cdx-fa-new">' + esc(t('cohorts.forum_new')) + '</button>' +
        '</div>' +
        '<div class="cdx-fa-newform" hidden>' +
          '<input class="cdx-fa-nt" type="text" maxlength="160" placeholder="' + esc(t('cohorts.forum_new_title_ph')) + '">' +
          '<textarea class="cdx-fa-nb" rows="3" placeholder="' + esc(t('cohorts.forum_new_body_ph')) + '"></textarea>' +
          '<label class="cdx-fa-pinrow"><input type="checkbox" class="cdx-fa-np"> ' + esc(t('cohorts.forum_pin_on_create')) + '</label>' +
          '<div class="cdx-fa-newactions">' +
            '<button type="button" class="cdx-btn cdx-btn--ghost cdx-fa-ncancel">' + esc(t('cohorts.forum_cancel')) + '</button>' +
            '<button type="button" class="cdx-btn cdx-fa-ncreate">' + esc(t('cohorts.forum_create')) + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="cdx-fa-threads"></div>' +
      '</div>' +
      '<div class="cdx-fa-detail"><div class="cdx-empty cdx-fa-pick">' + esc(t('cohorts.forum_pick')) + '</div></div>' +
    '</div>';
  wireNew(ctx);
  loadThreads(ctx);
}

function wireNew(ctx) {
  const form = ctx.el.querySelector('.cdx-fa-newform');
  const open = ctx.el.querySelector('.cdx-fa-new');
  open.addEventListener('click', () => { form.hidden = !form.hidden; if (!form.hidden) form.querySelector('.cdx-fa-nt').focus(); });
  form.querySelector('.cdx-fa-ncancel').addEventListener('click', () => { form.hidden = true; });
  form.querySelector('.cdx-fa-ncreate').addEventListener('click', async () => {
    const title = (form.querySelector('.cdx-fa-nt').value || '').trim();
    const body = (form.querySelector('.cdx-fa-nb').value || '').trim();
    if (!title || !body) return;
    const pinned = form.querySelector('.cdx-fa-np').checked ? 1 : 0;
    const r = await api.forumCreateThread({ client_slug: ctx.turma.client_slug, turma_slug: ctx.turma.slug, title, body, pinned });
    form.hidden = true; form.querySelector('.cdx-fa-nt').value = ''; form.querySelector('.cdx-fa-nb').value = ''; form.querySelector('.cdx-fa-np').checked = false;
    await loadThreads(ctx);
    if (r && r.thread && r.thread.id) openThread(ctx, r.thread.id);
  });
}

async function loadThreads(ctx) {
  const box = ctx.el.querySelector('.cdx-fa-threads');
  let res;
  try { res = await api.forumListThreads({ client_slug: ctx.turma.client_slug, turma_slug: ctx.turma.slug }); }
  catch (_) { box.innerHTML = '<div class="cdx-empty">' + esc(t('cohorts.error')) + '</div>'; return; }
  ctx.threads = (res && res.threads) || [];
  if (!ctx.threads.length) { box.innerHTML = '<div class="cdx-empty">' + esc(t('cohorts.doss_forum_empty')) + '</div>'; return; }
  const now = Math.floor(Date.now() / 1000);
  box.innerHTML = ctx.threads.map((th) => threadRowHtml(th, now, ctx.openId)).join('');
  box.querySelectorAll('[data-fa-thread]').forEach((row) => {
    row.addEventListener('click', () => openThread(ctx, parseInt(row.getAttribute('data-fa-thread'), 10)));
  });
}

function threadRowHtml(th, now, openId) {
  const replies = Math.max(0, (th.post_count || 1) - 1);
  const word = replies === 1 ? t('cohorts.forum_reply_one') : t('cohorts.forum_replies');
  const pin = th.pinned ? '<span class="cdx-fa-pin">📌</span>' : '';
  const who = th.author_is_admin ? t('cohorts.forum_professor') : (th.author_name || '');
  const sel = openId === th.id ? ' cdx-fa-trow--active' : '';
  return '<div class="cdx-fa-trow' + sel + '" data-fa-thread="' + th.id + '">' +
      '<div class="cdx-fa-trow-top">' + pin + '<span class="cdx-fa-trow-title">' + esc(th.title) + '</span></div>' +
      '<div class="cdx-fa-trow-meta">' + esc(who) + ' · ' + esc(relTime(th.last_activity_at || th.created_at, now)) + ' · ' + replies + ' ' + esc(word) + '</div>' +
    '</div>';
}

async function openThread(ctx, id) {
  ctx.openId = id;
  ctx.el.querySelectorAll('[data-fa-thread]').forEach((r) => r.classList.toggle('cdx-fa-trow--active', parseInt(r.getAttribute('data-fa-thread'), 10) === id));
  const pane = ctx.el.querySelector('.cdx-fa-detail');
  pane.innerHTML = '<div class="cdx-empty">…</div>';
  let data;
  try { data = await api.forumGetThread({ thread_id: id }); }
  catch (_) { pane.innerHTML = '<div class="cdx-empty">' + esc(t('cohorts.error')) + '</div>'; return; }
  ctx.detail = data;
  paintDetail(ctx);
}

function paintDetail(ctx) {
  const pane = ctx.el.querySelector('.cdx-fa-detail');
  const d = ctx.detail || {};
  const th = d.thread || {};
  const now = Math.floor(Date.now() / 1000);
  const flat = [];
  (d.posts || []).forEach((p) => { flat.push(p); (p.replies || []).forEach((r) => flat.push(r)); });
  const pinLabel = th.pinned ? t('cohorts.forum_unpin') : t('cohorts.forum_pin');
  pane.innerHTML =
    '<div class="cdx-fa-dhead">' +
      '<div class="cdx-fa-dtitle">' + (th.pinned ? '<span class="cdx-fa-pin">📌</span> ' : '') + esc(th.title || '') + '</div>' +
      '<div class="cdx-fa-dactions">' +
        '<button type="button" class="cdx-fa-tbtn cdx-fa-pin-toggle">' + esc(pinLabel) + '</button>' +
        '<button type="button" class="cdx-fa-tbtn cdx-fa-del-thread">' + esc(t('cohorts.forum_delete_thread')) + '</button>' +
      '</div>' +
    '</div>' +
    '<div class="cdx-fa-posts">' + flat.map((p) => postHtml(p, now)).join('') + '</div>' +
    '<div class="cdx-fa-replybar">' +
      '<textarea class="cdx-fa-replyinput" rows="2" placeholder="' + esc(t('cohorts.forum_reply_ph')) + '"></textarea>' +
      '<button type="button" class="cdx-btn cdx-fa-replysend">' + esc(t('cohorts.forum_reply')) + '</button>' +
    '</div>';
  wireDetail(ctx, th);
}

function postHtml(p, now) {
  const prof = !!p.author_is_admin;
  const name = prof ? t('cohorts.forum_professor') : (p.author_name || '');
  const badge = prof ? '<span class="cdx-fa-profbadge">' + esc(t('cohorts.forum_professor')) + '</span>' : '';
  const edit = prof ? '<button type="button" class="cdx-fa-pbtn" data-fa-edit="' + p.id + '">' + esc(t('cohorts.forum_edit')) + '</button>' : '';
  return '<div class="cdx-fa-post' + (prof ? ' cdx-fa-post--prof' : '') + '" data-fa-post="' + p.id + '">' +
      '<div class="cdx-fa-post-head">' +
        '<span class="cdx-fa-post-name">' + esc(name) + '</span>' + badge +
        '<span class="cdx-fa-post-time">' + esc(relTime(p.created_at, now)) + '</span>' +
      '</div>' +
      '<div class="cdx-fa-post-body">' + esc(p.body) + '</div>' +
      '<div class="cdx-fa-post-actions">' + edit +
        '<button type="button" class="cdx-fa-pbtn cdx-fa-pbtn--danger" data-fa-delpost="' + p.id + '">' + esc(t('cohorts.forum_delete')) + '</button>' +
      '</div>' +
    '</div>';
}

function wireDetail(ctx, th) {
  const pane = ctx.el.querySelector('.cdx-fa-detail');
  pane.querySelector('.cdx-fa-pin-toggle').addEventListener('click', async () => {
    await api.forumSetPinned({ thread_id: th.id, pinned: th.pinned ? 0 : 1 });
    await loadThreads(ctx); await openThread(ctx, th.id);
  });
  pane.querySelector('.cdx-fa-del-thread').addEventListener('click', async () => {
    if (typeof confirm === 'function' && !confirm(t('cohorts.forum_confirm_del_thread'))) return;
    await api.forumDeleteThread({ thread_id: th.id });
    ctx.openId = null; ctx.detail = null;
    pane.innerHTML = '<div class="cdx-empty cdx-fa-pick">' + esc(t('cohorts.forum_pick')) + '</div>';
    await loadThreads(ctx);
  });
  const send = pane.querySelector('.cdx-fa-replysend');
  const input = pane.querySelector('.cdx-fa-replyinput');
  send.addEventListener('click', async () => {
    const body = (input.value || '').trim();
    if (!body) return;
    send.disabled = true;
    try { await api.forumReply({ thread_id: th.id, body }); await loadThreads(ctx); await openThread(ctx, th.id); }
    finally { send.disabled = false; }
  });
  pane.querySelectorAll('[data-fa-delpost]').forEach((b) => b.addEventListener('click', async () => {
    if (typeof confirm === 'function' && !confirm(t('cohorts.forum_confirm_del_post'))) return;
    await api.forumDeletePost({ post_id: parseInt(b.getAttribute('data-fa-delpost'), 10) });
    await loadThreads(ctx); await openThread(ctx, th.id);
  }));
  pane.querySelectorAll('[data-fa-edit]').forEach((b) => b.addEventListener('click', () => beginEdit(ctx, th, parseInt(b.getAttribute('data-fa-edit'), 10))));
}

function beginEdit(ctx, th, postId) {
  const pane = ctx.el.querySelector('.cdx-fa-detail');
  const bodyEl = pane.querySelector('[data-fa-post="' + postId + '"] .cdx-fa-post-body');
  if (!bodyEl || bodyEl.dataset.editing) return;
  bodyEl.dataset.editing = '1';
  const cur = bodyEl.textContent;
  bodyEl.innerHTML = '<textarea class="cdx-fa-editinput" rows="3"></textarea>' +
    '<div class="cdx-fa-post-actions">' +
      '<button type="button" class="cdx-fa-pbtn cdx-fa-editsave">' + esc(t('cohorts.forum_save')) + '</button>' +
      '<button type="button" class="cdx-fa-pbtn cdx-fa-editcancel">' + esc(t('cohorts.forum_cancel')) + '</button>' +
    '</div>';
  const ta = bodyEl.querySelector('.cdx-fa-editinput'); ta.value = cur; ta.focus();
  bodyEl.querySelector('.cdx-fa-editcancel').addEventListener('click', () => openThread(ctx, th.id));
  bodyEl.querySelector('.cdx-fa-editsave').addEventListener('click', async () => {
    const body = (ta.value || '').trim();
    if (!body) return;
    await api.forumEditPost({ post_id: postId, body });
    await openThread(ctx, th.id);
  });
}
