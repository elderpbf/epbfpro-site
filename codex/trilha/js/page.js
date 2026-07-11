// codex/trilha/js/page.js
// Trail student-page orchestrator. Boots state, fetches the turma view via the
// Trail facade, fills the hero + tab nav, and routes hash changes between the
// three panels. The per-panel content renderers live in their own modules and
// are wired in as those slices land (Aulas / Apostila / Outros). resolveTab() is
// pure (unit-tested); the DOM wiring is verified visually on staging.
import { state } from './state.js';
import { esc, showError, isOutrosItem } from './utils.js';
import { trail, isTransientError } from './api.js';
import { startNexo } from './nexo.js';
import { assetUrl } from '../../js/codex-api.js';
import { initials } from '../../js/initials.js';
import { t, setLang } from '../i18n.js';
import { extractEnrollToken, isLoggedIn, clearToken, getToken, getKnownTurmas, getPresence, setPresence, rememberTurma, forgetTurma, otherKnownTurmas, LOGIN_ENABLED } from './student-session.js';
import { openLoginModal } from './student-login-modal.js';
import { logoutStudent } from './student-login.js';
import { isWall } from './access.js';
import { renderWall } from './wall.js';
import { renderSimpleWall } from './wall-simple.js';
import { createBell } from '../../js/notif-bell.js';
import { filterByPrefs, getPrefs, createNotifSettings } from './notif-prefs.js';
import { initInstallPrompt, showInstallPrompt } from './install-prompt.js';
import { mountEntry, contextFromState } from './support-contact.js';
import { overlayLabItems } from './lab-overlay.js';
// forum.js is imported DYNAMICALLY where needed (in the bell's onNavigate) to avoid a
// static import cycle: forum.js imports page.js (registerRenderer), so a static import
// here would hit page.js's RENDERERS const in its temporal dead zone at load.

const PANELS = ['aulas', 'forum', 'apostila', 'outros', 'apps'];

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

  // Audience surface: adopt the GLOBAL student language (default pt-BR) before rendering,
  // independent of the operator's admin language. Best-effort: a failed fetch stays pt-BR.
  try { const lr = await (ctx.api || trail).getStudentLang(); if (lr && lr.lang) setLang(lr.lang); } catch (_) { /* stays pt-BR */ }

  applyStaticI18n(root);

  const api = ctx.api || trail;

  // Code entry (/trilha/<code>): the 200 rewrite served the student page for a bare short
  // code, keeping the visible path — so the code is the LAST path segment. Resolve it in
  // place to the turma identity; the code STAYS in the bar as the turma's permanent URL
  // (no bounce to slug/token). An open enrollment window returns an et, surfaced as ?et= so
  // the shared enroll handling (wall + handleEnrollReturn) auto-approves exactly like a QR.
  let enteredViaCode = false;
  if (!state.clientSlug && !state.turmaSlug) {
    const seg = String(loc.pathname || '').split('/').filter(Boolean).pop() || '';
    if (/^[A-Za-z0-9]{4}$/.test(seg)) {
      let r; try { r = await api.resolveCode({ code: seg }); } catch (_) { r = null; }
      if (!r || !r.found) { showError(root, 'link_invalid', t); return; }
      enteredViaCode = true;
      state.clientSlug = r.client_slug; state.turmaSlug = r.turma_slug; state.token = r.turma_token;
      if (r.enrollment_token && _win && _win.history && _win.history.replaceState) {
        try {
          const u = new URL(_win.location.href);
          u.searchParams.set('et', r.enrollment_token);
          _win.history.replaceState({}, '', u.pathname + (u.search || '') + (u.hash || ''));
        } catch (_) { /* et is best-effort */ }
      }
      // The live-question poller self-started with no identity (code URL) and no-oped; start
      // it now with the resolved turma. Idempotent for a direct entry (guarded in nexo).
      startNexo({ clientSlug: state.clientSlug, turmaSlug: state.turmaSlug, token: state.token });
    }
  }

  if (!state.clientSlug || !state.turmaSlug || !state.token) { showError(root, 'link_invalid', t); return; }

  state.sessionToken = LOGIN_ENABLED ? getToken(state.clientSlug, state.turmaSlug) : null;
  try {
    state.data = await fetchTurmaViewResilient(api);
    // Lab items are shipped artifacts: derive their title/summary/description/
    // objective from the code registry (single source), not the seeded DB copy,
    // and drop labs retired from the registry. See lab-overlay.js.
    overlayLabItems(state.data);
    const loading = root.querySelector('.cdx-trilha-loading');
    const main = root.querySelector('.cdx-trilha-main');
    if (loading) loading.hidden = true;
    if (main) main.hidden = false;
    renderHero(root);
    renderHeaderActions();
    // Remember this turma in the device registry so /trilha can relaunch it (the
    // "minhas turmas" hub) without a re-login. Only when this device holds a session.
    if (LOGIN_ENABLED && state.sessionToken) {
      const rc = (state.data || {}).client || {};
      const rt = (state.data || {}).turma || {};
      rememberTurma({
        client_slug: state.clientSlug, turma_slug: state.turmaSlug,
        client_name: rc.display_name || rc.name || '', turma_name: rt.display_name || rt.name || '', k: state.token,
      });
    }
    // Upfront-gated + unapproved: render the wall instead of the timeline. Inline
    // mode (and approved / open) renders the timeline as usual; the per-item gate in
    // sub.js/flat.js handles inline opens.
    if (LOGIN_ENABLED && isWall((state.data || {}).access)) {
      // Opt-in: a turma flagged `simple_enroll` uses the separate name+e-mail page that
      // registers on the spot; every other gated turma keeps the original OTP wall.
      if (((state.data || {}).access || {}).simple_enroll) renderSimpleWall(root);
      else renderWall(root);
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
      // "Salvar como app": offer a home-screen install on the timeline only (never on the
      // login wall), and only when the turma enables it (per-turma flag, DEFAULT-ON).
      // Self-guards further: no-op if installed, not installable, or previously dismissed.
      if (turma.app_install_prompt !== 0) initInstallPrompt(root, { win: _win });
    }
    if (LOGIN_ENABLED) { recheckAuth(); claimPresence(); handleEnrollReturn(loc); }
    // One public identity: normalize a legacy slug/token entry to the permanent /trilha/<code>
    // in the bar (no reload; the code URL resolves on any later refresh). Runs AFTER
    // handleEnrollReturn has consumed any ?et=. Skipped when we already entered via the code.
    if (!enteredViaCode && state.data && state.data.turma && state.data.turma.access_code
        && _win && _win.history && _win.history.replaceState) {
      try {
        const prefix = /^\/codex\//.test(loc.pathname || '') ? '/codex' : '';
        _win.history.replaceState({}, '',
          prefix + '/trilha/' + encodeURIComponent(state.data.turma.access_code) + (_win.location.hash || ''));
      } catch (_) { /* normalization is cosmetic */ }
    }
  } catch (err) {
    const code = (err && err.data && err.data.error) ? err.data.error : 'error';
    // A transient server/network hiccup (already retried in fetchTurmaViewResilient) is NOT a
    // bad link: DON'T map it to link_invalid (which reads as logged-out). Keep the held session
    // and show the generic retryable error so a reload recovers, instead of tearing down the
    // student's identity on a soluço (track-36 a, the "sumiu em minutos" class of failure).
    const map = (code === 'not_found' || code === 'forbidden' || code === 'unauthorized') ? 'link_invalid' : 'error';
    showError(root, map, t);
    mountEntry(root.querySelector('#cdx-tr-error-support'), contextFromState(state), 'erro');
  }
}

// Load the turma view, riding out a transient server/network hiccup instead of failing the
// whole page (fail-open, track-36 a). Retries a couple of times with a short backoff on a
// transient error; a definitive error (bad link / needs_approval) throws straight through so
// the caller handles it. Payload shape is unchanged from the original inline call.
async function fetchTurmaViewResilient(api, attempt = 0) {
  try {
    return await api.turmaView({
      client_slug: state.clientSlug,
      turma_slug: state.turmaSlug,
      token: state.token,
      session_token: state.sessionToken,
      _admin: state.isAdmin,
      _silent: true,
    });
  } catch (err) {
    const code = err && err.data && err.data.error;
    if (isTransientError(code) && attempt < 2) {
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
      return fetchTurmaViewResilient(api, attempt + 1);
    }
    throw err;
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
    const ini = initials(name);
    avatarEl.innerHTML = ini ? '<span class="cdx-tr-avatar-initials">' + esc(ini) + '</span>' : '';
  }

  const titleBase = turma.display_name || turma.name;
  if (titleBase && typeof document !== 'undefined') document.title = titleBase + ' · PensoIA';

  mountEntry(root.querySelector('#cdx-tr-support-footer'), contextFromState(state), 'trilha');
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
  btn.addEventListener('click', async () => {
    if (isLoggedIn(state.clientSlug, state.turmaSlug)) {
      // Logout must re-gate. Content already rendered for an approved session
      // stays on screen, because the gate only re-checks on the next fetch, so
      // clearing the token alone left everything visible. Reload so the Trail
      // re-fetches as anonymous and the gate re-applies. Server round-trip first so
      // the HttpOnly cookie is CLEARED (track-36 d) — else the next request re-auths from it.
      await logoutStudent(state.clientSlug, state.turmaSlug);
      if (typeof location !== 'undefined' && location.reload) { location.reload(); return; }
      refreshLoginPill();
    } else {
      openLoginModal({
        client: state.clientSlug, turma: state.turmaSlug, k: state.token,
        presence: getPresence(state.clientSlug, state.turmaSlug),
        // Simple-enroll turma: the pill opens the e-mail-only step, not the código flow.
        simple: !!(((state.data || {}).access || {}).simple_enroll),
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

    // Login pill: ONLY for an ANONYMOUS student on a gated turma (a returning student who
    // wants to log in instead of registering at the wall). When logged in, the logout lives
    // inside the settings box (below), so there is no standalone "Sair" pill (Élder).
    if (LOGIN_ENABLED && data.access && data.access.gated && !state.sessionToken) {
      _loginPill = buildLoginPill();
      prepend(_loginPill);
    }

    // Settings box (the initials avatar) whenever the student is logged in on a gated
    // turma: it carries the logout (ALWAYS) plus the notif prefs (only when the forum is
    // on, the sole notification source today). The bell shows only with the forum. Header
    // order: bell + theme toggle stay on the LEFT; the settings gear sits on the RIGHT,
    // appended AFTER the theme toggle (Élder).
    if (LOGIN_ENABLED && state.sessionToken && data.access && data.access.gated) {
      const turmaKey = state.clientSlug + '/' + state.turmaSlug;
      let bell = null;
      if (data.turma && data.turma.forum_enabled) {
        bell = createBell({
          role: 'student',
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
        prepend(bell.el); // bell to the left of the theme toggle
      }
      // "Trocar de turma" (Idea A): the device's OTHER saved turmas (those it holds a
      // session for), listed in the settings box; a dead one is removed via the ✕.
      const others = otherKnownTurmas(getKnownTurmas(), state.clientSlug, state.turmaSlug)
        .filter((e) => getToken(e.client_slug, e.turma_slug))
        .map((e) => ({
          clientSlug: e.client_slug, turmaSlug: e.turma_slug,
          name: e.turma_name || e.turma_slug, client: e.client_name || e.client_slug,
          url: '/trilha/' + encodeURIComponent(e.client_slug) + '/' + encodeURIComponent(e.turma_slug) + '?k=' + encodeURIComponent(e.k || ''),
        }));
      const settings = createNotifSettings({
        initials: avatarInitials((data.participant || {}).display_name || (data.participant || {}).name),
        turmaKey,
        showPrefs: !!(data.turma && data.turma.forum_enabled),
        turmas: others,
        onForget: (c, tt) => forgetTurma(c, tt),
        onChange: () => { if (bell) bell.refresh(); },
        // iOS recover: a dismissed student can bring the install invite back (only meaningful
        // when the turma enables the prompt). No-op on platforms where it isn't installable.
        onInstallApp: (data.turma && data.turma.app_install_prompt !== 0)
          ? (() => showInstallPrompt(_root, { win: _win }))
          : undefined,
        onLogout: async () => {
          // Server round-trip first (track-36 d): clear the HttpOnly cookie + revoke, then reload.
          await logoutStudent(state.clientSlug, state.turmaSlug);
          if (typeof location !== 'undefined' && location.reload) location.reload();
        },
        btnClass: 'ph-action-btn',
      });
      phRight.appendChild(settings.el); // the gear sits to the RIGHT of the theme toggle
    }
  })();
}

// Two-letter avatar initials from a display name (header settings button).
// Delegates to the shared rule so the Trail and the Alunos roster always match.
function avatarInitials(name) {
  return initials(name);
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
  const outros = items.filter(isOutrosItem);
  const apostilaSet = data.apostila_set;
  const apostilaCount = apostilaSet ? items.filter((it) => it.set_id === apostilaSet.id).length : 0;

  const outrosBtn = root.querySelector('#cdx-tr-tab-outros');
  const apostilaBtn = root.querySelector('#cdx-tr-tab-apostila');
  const forumBtn = root.querySelector('#cdx-tr-tab-forum');
  const appsBtn = root.querySelector('#cdx-tr-tab-apps');

  // The Fórum tab shows only when the turma enabled it.
  if (forumBtn) forumBtn.hidden = !turma.forum_enabled;

  // Aplicativos tab: shows only when the turma has at least one app whose lesson has
  // occurred (the backend already applied that happened-gate to data.apps). With exactly
  // one app the tab takes that app's name; with several it is the generic "Aplicativos".
  const apps = data.apps || [];
  if (appsBtn) {
    appsBtn.hidden = !apps.length;
    if (apps.length === 1 && apps[0].name) appsBtn.textContent = apps[0].name;
    else appsBtn.textContent = t('page.tab_apps');
  }

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
