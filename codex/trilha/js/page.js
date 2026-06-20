// codex/trilha/js/page.js
// Trail student-page orchestrator. Boots state, fetches the turma view via the
// Trail facade, fills the hero + tab nav, and routes hash changes between the
// three panels. The per-panel content renderers live in their own modules and
// are wired in as those slices land (Aulas / Apostila / Outros). resolveTab() is
// pure (unit-tested); the DOM wiring is verified visually on staging.
import { state } from './state.js';
import { esc, showError } from './utils.js';
import { trail } from './api.js';
import { assetUrl } from '../../js/codex-api.js';
import { t } from '../i18n.js';
import { extractMagicToken, extractEnrollToken, isLoggedIn, clearToken, getToken, getPresence, setPresence, LOGIN_ENABLED } from './student-session.js';
import { openLoginModal } from './student-login-modal.js';
import { isWall } from './access.js';
import { createBell } from '../../js/notif-bell.js';
import { filterByPrefs, getPrefs, createNotifSettings } from './notif-prefs.js';
// forum.js is imported DYNAMICALLY where needed (in the bell's onNavigate) to avoid a
// static import cycle: forum.js imports page.js (registerRenderer), so a static import
// here would hit page.js's RENDERERS const in its temporal dead zone at load.

const PANELS = ['aulas', 'forum', 'apostila', 'outros'];

// Which panel a location hash selects (default 'aulas').
export function resolveTab(hash) {
  const h = String(hash || '').replace(/^#/, '');
  return PANELS.includes(h) ? h : 'aulas';
}

let _root = null;
let _win = null;
let _onHash = null;

function applyStaticI18n(root) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
}

export async function mount(root, ctx = {}) {
  _root = root;
  _win = ctx.window || (typeof window !== 'undefined' ? window : undefined);
  const loc = ctx.location || (_win && _win.location) || { search: '', pathname: '' };
  state.init(loc.search || '', loc.pathname || '', _win);

  applyStaticI18n(root);

  if (!state.clientSlug || !state.turmaSlug || !state.token) { showError(root, 'link_invalid', t); return; }

  const api = ctx.api || trail;
  state.sessionToken = LOGIN_ENABLED ? getToken(state.clientSlug, state.turmaSlug) : null;
  try {
    state.data = await api.turmaView({
      client_slug: state.clientSlug,
      turma_slug: state.turmaSlug,
      token: state.token,
      session_token: state.sessionToken,
      _admin: state.isAdmin,
      _silent: true,
    });
    const loading = root.querySelector('.cdx-trilha-loading');
    const main = root.querySelector('.cdx-trilha-main');
    if (loading) loading.hidden = true;
    if (main) main.hidden = false;
    renderHero(root);
    renderHeaderActions();
    // Upfront-gated + unapproved: render the wall instead of the timeline. Inline
    // mode (and approved / open) renders the timeline as usual; the per-item gate in
    // sub.js/flat.js handles inline opens.
    if (LOGIN_ENABLED && isWall((state.data || {}).access)) {
      renderWall(root);
    } else {
      renderTabs(root);
      _onHash = () => onHashChange();
      if (_win) _win.addEventListener('hashchange', _onHash);
      // Deeplink: the notification bell emits ?thread=<id>. Land on the Fórum tab
      // (forum.js reads the param and opens the thread). Only when the turma enabled
      // the forum and the tab is therefore present.
      const turma = (state.data || {}).turma || {};
      const hasThreadLink = (() => { try { return !!new URLSearchParams(loc.search || '').get('thread'); } catch (_) { return false; } })();
      if (hasThreadLink && turma.forum_enabled && _win && _win.location) _win.location.hash = '#forum';
      onHashChange();
    }
    if (LOGIN_ENABLED) { recheckAuth(); claimPresence(); if (!handleEnrollReturn(loc)) handleMagicReturn(loc); }
  } catch (err) {
    const code = (err && err.data && err.data.error) ? err.data.error : 'error';
    const map = (code === 'not_found' || code === 'forbidden' || code === 'unauthorized') ? 'link_invalid' : 'error';
    showError(root, map, t);
  }
}

export function unmount() {
  if (_win && _onHash) _win.removeEventListener('hashchange', _onHash);
  _onHash = null; _root = null; _win = null;
}

function renderHero(root) {
  const data = state.data || {};
  const client = data.client || {};
  const turma = data.turma || {};

  const nameEl = root.querySelector('#cdx-tr-client-name');
  const turmaEl = root.querySelector('#cdx-tr-turma-name');
  const avatarEl = root.querySelector('#cdx-tr-client-avatar');
  const iconEl = root.querySelector('#cdx-tr-client-icon');

  if (nameEl) nameEl.textContent = client.display_name || '';
  if (turmaEl) turmaEl.textContent = turma.display_name || turma.name || state.turmaSlug;

  if (client.icon_path && avatarEl && iconEl) {
    iconEl.src = /^https?:\/\//.test(client.icon_path) ? client.icon_path : assetUrl('/r2/' + client.icon_path);
    iconEl.alt = client.display_name || '';
    iconEl.hidden = false;
    avatarEl.style.background = 'var(--background)';
  } else if (avatarEl) {
    const name = client.display_name || '';
    const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
    avatarEl.innerHTML = initials ? '<span class="cdx-tr-avatar-initials">' + esc(initials) + '</span>' : '';
  }

  const titleBase = turma.display_name || turma.name;
  if (titleBase && typeof document !== 'undefined') document.title = titleBase + ' · PensoIA';
}

// Inject the header actions (login/logout pill, plus the WhatsApp group pill when
// the turma has a whatsapp_url) into the pensoia-header .ph-right. Retries while
// the header web component upgrades. The login pill always shows; its label tracks
// the session and its click reads live state, so one handler serves both directions.
let _loginPill = null;

function buildLoginPill() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ph-action-btn cdx-tr-login-pill';
  btn.textContent = isLoggedIn(state.clientSlug, state.turmaSlug) ? t('login.logout') : t('login.entrar');
  btn.addEventListener('click', () => {
    if (isLoggedIn(state.clientSlug, state.turmaSlug)) {
      // Logout must re-gate. Content already rendered for an approved session
      // stays on screen, because the gate only re-checks on the next fetch, so
      // clearing the token alone left everything visible. Reload so the Trail
      // re-fetches as anonymous and the gate re-applies.
      clearToken(state.clientSlug, state.turmaSlug);
      if (typeof location !== 'undefined' && location.reload) { location.reload(); return; }
      refreshLoginPill();
    } else {
      openLoginModal({
        client: state.clientSlug, turma: state.turmaSlug, k: state.token,
        presence: getPresence(state.clientSlug, state.turmaSlug),
        onAuthenticated: afterAuth,
      });
    }
  });
  return btn;
}

function refreshLoginPill() {
  if (_loginPill) {
    _loginPill.textContent = isLoggedIn(state.clientSlug, state.turmaSlug) ? t('login.logout') : t('login.entrar');
  }
}

// Re-check auth on every page open. If we hold a session token but the server no longer
// recognizes it (revoked/expired -> the gated turma view comes back 'anonymous'), clear
// the stale token so the UI reflects logout and dead tokens stop being sent. Revocation
// from the Alunos admin thus takes full effect on the student's next load. (Inert on open
// turmas, which are never gated, and on a 'pending' student, whose session is still valid.)
function recheckAuth() {
  const access = (state.data || {}).access || {};
  if (access.gated && access.status === 'anonymous' && isLoggedIn(state.clientSlug, state.turmaSlug)) {
    clearToken(state.clientSlug, state.turmaSlug);
    refreshLoginPill();
  }
}

function renderHeaderActions() {
  const data = state.data || {};
  const turma = data.turma || {};
  if (typeof document === 'undefined') return;

  (function tryInject(attempt = 0) {
    const header = document.querySelector('pensoia-header');
    const phRight = header && header.querySelector('.ph-right');
    if (!phRight) {
      if (attempt < 20) setTimeout(() => tryInject(attempt + 1), 100);
      return;
    }
    if (header.dataset.trActionsInjected) return;
    header.dataset.trActionsInjected = '1';

    const prepend = (el) => {
      if (phRight.insertBefore) phRight.insertBefore(el, (phRight.children && phRight.children[0]) || null);
      else phRight.appendChild(el);
    };

    if (turma.whatsapp_url) {
      const wa = document.createElement('a');
      wa.className = 'ph-action-btn';
      wa.href = turma.whatsapp_url;
      wa.target = '_blank';
      wa.rel = 'noopener';
      wa.title = t('page.wa_group');
      wa.innerHTML = state.WA_ICON + '<span>' + esc(t('page.wa_group')) + '</span>';
      prepend(wa);
    }

    // The login pill shows only on a gated turma; open turmas need no login UI and
    // stay visually unchanged when LOGIN_ENABLED flips on.
    if (LOGIN_ENABLED && data.access && data.access.gated) {
      _loginPill = buildLoginPill();
      prepend(_loginPill);
    }

    // Notification bell + preferences (student): the bell is a CONSEQUENCE of a
    // notification-emitting feature being on (today: the forum), not a separate
    // toggle. So it shows when the forum is enabled AND the student is logged in
    // (notifications are computed against their identity). Scoped to this turma. The
    // bell filters the server's pending list by the student's chosen categories;
    // clicking an item opens the Fórum tab + thread IN PLACE (no reload). The gear
    // button edits which events notify.
    if (data.turma && data.turma.forum_enabled && state.sessionToken) {
      const turmaKey = state.clientSlug + '/' + state.turmaSlug;
      const bell = createBell({
        fetchNotifications: () => trail.forumNotifications({ session_token: state.sessionToken, _silent: true })
          .then((res) => {
            const items = filterByPrefs((res && res.items) || [], getPrefs(turmaKey));
            return { count: items.length, items };
          }),
        markSeen: () => trail.forumMarkSeen({ session_token: state.sessionToken }),
        onNavigate: (item) => {
          // Already on this turma's page: just switch to the Fórum tab and open the
          // thread (the worker stamps thread_id). Falls back to the token-preserving
          // deeplink only if the id is somehow missing. Dynamic import dodges the cycle.
          if (item && item.thread_id) { import('./forum.js').then((m) => m.focusThread(item.thread_id)); return; }
          if (item && item.deeplink && typeof location !== 'undefined') {
            let url = item.deeplink;
            if (state.token) url += (url.indexOf('?') === -1 ? '?' : '&') + 'k=' + encodeURIComponent(state.token);
            location.href = url;
          }
        },
        t,
        btnClass: 'ph-action-btn',
      });
      const settings = createNotifSettings({
        initials: avatarInitials((data.participant || {}).display_name || (data.participant || {}).name),
        turmaKey,
        onChange: () => bell.refresh(),
        btnClass: 'ph-action-btn',
      });
      // Order in the header: bell first, then the gear (prepend reverses, so gear last).
      prepend(settings.el);
      prepend(bell.el);
    }
  })();
}

// Two-letter avatar initials from a display name (header settings button).
function avatarInitials(name) {
  return String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

// Magic-link return: when the URL carries ?lt=<token>, verify it (the page already
// loaded the timeline from k), then strip lt so a refresh cannot replay a spent
// token. Opens the login modal straight into its verifying state.
function handleMagicReturn(loc) {
  const lt = extractMagicToken((loc && loc.search) || '');
  if (!lt) return;
  stripLt();
  openLoginModal({
    client: state.clientSlug, turma: state.turmaSlug, k: state.token,
    presence: getPresence(state.clientSlug, state.turmaSlug),
    startToken: lt,
    onAuthenticated: afterAuth,
  });
}

// QR enrollment return: the in-class QR carries ?et=<token>. It ALWAYS claims a
// device-presence grant silently (so a later off-window login auto-approves) and never
// forces a login on its own. What opens, if anything, is the turma's choice: direct_access
// (register + access on the spot, no magic link) takes precedence, else enroll_prompt (the
// magic-link request). The fixed ?k= link never reaches this path, so it stays prompt-free.
// Strips et so a refresh can't replay it; returns true so the caller skips the magic path.
function handleEnrollReturn(loc) {
  const et = extractEnrollToken((loc && loc.search) || '');
  if (!et) return false;
  stripEt();
  try {
    Promise.resolve(trail.enrollClaim({ client_slug: state.clientSlug, turma_slug: state.turmaSlug, et, _silent: true }))
      .then((res) => { if (res && res.granted && res.presence_token) setPresence(state.clientSlug, state.turmaSlug, res.presence_token); })
      .catch(() => {});
  } catch (_) { /* presence is best-effort */ }
  const access = (state.data || {}).access || {};
  if (access.direct_access) {
    openLoginModal({
      client: state.clientSlug, turma: state.turmaSlug, k: state.token,
      enrollToken: et,
      presence: getPresence(state.clientSlug, state.turmaSlug),
      onAuthenticated: afterAuth,
    });
  } else if (access.enroll_prompt) {
    openLoginModal({
      client: state.clientSlug, turma: state.turmaSlug, k: state.token,
      presence: getPresence(state.clientSlug, state.turmaSlug),
      onAuthenticated: afterAuth,
    });
  }
  return true;
}

// After a successful login: refresh the pill, and on a GATED turma reload so the
// now-approved session unlocks content (or surfaces the pending wall/notice). An
// open turma gates nothing, so a reload would be pointless there.
function afterAuth() {
  refreshLoginPill();
  const gated = !!(state.data && state.data.access && state.data.access.gated);
  if (gated && _win && _win.location && typeof _win.location.reload === 'function') {
    _win.location.reload();
  }
}

// Best-effort device-presence claim (signal b): while the turma's live session is
// open, the worker issues a grant the device keeps and offers at the next login, so
// being in the room earns access even if the student logs in later.
function claimPresence() {
  try {
    Promise.resolve(trail.presenceClaim({ client_slug: state.clientSlug, turma_slug: state.turmaSlug, _silent: true }))
      .then((res) => { if (res && res.granted && res.presence_token) setPresence(state.clientSlug, state.turmaSlug, res.presence_token); })
      .catch(() => {});
  } catch (_) { /* presence is best-effort */ }
}

// Upfront-mode wall: hide the tabs + content and show a login CTA, or a "pending
// approval" notice once the student is logged in but awaiting approval. The hero
// stays visible so the student still sees which turma this is.
function renderWall(root) {
  const main = root.querySelector('.cdx-trilha-main');
  if (!main) return;
  const tabs = main.querySelector('.cdx-trilha-tabs');
  const content = main.querySelector('.cdx-trilha-tabcontent');
  if (tabs) tabs.hidden = true;
  if (content) content.hidden = true;
  let wall = main.querySelector('.cdx-tr-wall');
  if (!wall) {
    wall = document.createElement('section');
    wall.className = 'cdx-tr-wall';
    const footer = main.querySelector('.cdx-trilha-footer');
    main.insertBefore(wall, footer || null);
  }
  const access = (state.data || {}).access || {};
  const pending = access.status === 'pending';
  wall.innerHTML =
    '<div class="cdx-tr-wall-card">' +
      '<div class="cdx-tr-wall-icon" aria-hidden="true">🔒</div>' +
      '<h2 class="cdx-tr-wall-title">' + esc(t(pending ? 'login.pending_title' : 'login.wall_title')) + '</h2>' +
      '<p class="cdx-tr-wall-body">' + esc(t(pending ? 'login.pending_body' : 'login.wall_body')) + '</p>' +
      (pending ? '' : '<button type="button" class="tr-btn tr-btn-primary cdx-tr-wall-cta">' + esc(t('login.access_cta')) + '</button>') +
    '</div>';
  const cta = wall.querySelector('.cdx-tr-wall-cta');
  if (cta) {
    cta.addEventListener('click', () => {
      openLoginModal({
        client: state.clientSlug, turma: state.turmaSlug, k: state.token,
        presence: getPresence(state.clientSlug, state.turmaSlug),
        onAuthenticated: afterAuth,
      });
    });
  }
}

// Remove the lt param from the visible URL without a navigation.
function stripLt() {
  if (!_win || !_win.history || !_win.history.replaceState || !_win.location) return;
  try {
    const url = new URL(_win.location.href);
    url.searchParams.delete('lt');
    _win.history.replaceState({}, '', url.pathname + (url.search ? url.search : '') + url.hash);
  } catch (_) { /* noop */ }
}

// Remove the et param from the visible URL so a refresh cannot replay the QR pass.
function stripEt() {
  if (!_win || !_win.history || !_win.history.replaceState || !_win.location) return;
  try {
    const url = new URL(_win.location.href);
    url.searchParams.delete('et');
    _win.history.replaceState({}, '', url.pathname + (url.search ? url.search : '') + url.hash);
  } catch (_) { /* noop */ }
}

function renderTabs(root) {
  const data = state.data || {};
  const turma = data.turma || {};
  const items = data.items || [];
  const outros = items.filter((it) => it.aula_number == null && it.set_id == null && it.type !== 'tarefa');
  const apostilaSet = data.apostila_set;
  const apostilaCount = apostilaSet ? items.filter((it) => it.set_id === apostilaSet.id).length : 0;

  const outrosBtn = root.querySelector('#cdx-tr-tab-outros');
  const apostilaBtn = root.querySelector('#cdx-tr-tab-apostila');
  const forumBtn = root.querySelector('#cdx-tr-tab-forum');

  // The Fórum tab shows only when the turma enabled it.
  if (forumBtn) forumBtn.hidden = !turma.forum_enabled;

  if (outrosBtn) {
    if (outros.length) outrosBtn.textContent = t('page.tab_outros') + ' (' + outros.length + ')';
    outrosBtn.hidden = !outros.length;
  }
  if (apostilaBtn) apostilaBtn.hidden = !apostilaCount;

  root.querySelectorAll('.cdx-tr-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (_win) _win.location.hash = '#' + btn.dataset.tab;
      else onHashChange(btn.dataset.tab);
    });
  });
}

function onHashChange(forced) {
  const hash = forced || (_win && _win.location && _win.location.hash) || '#aulas';
  showTab(resolveTab(hash));
}

// Panel content renderers are registered by their slice modules via
// page.registerRenderer(name, fn); until a slice lands its panel renders empty.
const RENDERERS = {};
export function registerRenderer(name, fn) { RENDERERS[name] = fn; }

function showTab(name) {
  if (!_root) return;
  PANELS.forEach((p) => {
    const el = _root.querySelector('.cdx-trilha-panel[data-panel="' + p + '"]');
    if (el) el.hidden = (p !== name);
  });
  _root.querySelectorAll('.cdx-tr-tab-btn').forEach((btn) => {
    const active = btn.dataset.tab === name;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  if (!state.rendered[name] && RENDERERS[name]) {
    RENDERERS[name](_root);
    state.rendered[name] = true;
  }
}
