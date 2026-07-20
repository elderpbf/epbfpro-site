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
import { glyphSvg } from '../../js/glyphs.js';
import { t, setLang } from '../i18n.js';
import { extractEnrollToken, isLoggedIn, clearToken, getToken, setToken, getKnownTurmas, getPresence, setPresence, rememberTurma, forgetTurma, otherKnownTurmas, LOGIN_ENABLED } from './student-session.js';
import { openLoginModal } from './student-login-modal.js';
import { logoutStudent } from './student-login.js';
import { isWall } from './access.js';
import { renderWall } from './wall.js';
import { renderNoticePage } from './notice-page.js';
import { createBell } from '../../js/notif-bell.js';
import { filterByPrefs, getPrefs, createNotifSettings } from './notif-prefs.js';
import { initInstallPrompt, showInstallPrompt } from './install-prompt.js';
import { mountEntry, contextFromState } from './support-contact.js';
import { openMyData } from './my-data.js';
import { overlayLabItems } from './lab-overlay.js';
// forum.js is imported DYNAMICALLY where needed (in the bell's onNavigate) to avoid a
// static import cycle: forum.js imports page.js (registerRenderer), so a static import
// here would hit page.js's RENDERERS const in its temporal dead zone at load.

const PANELS = ['aulas', 'tarefas', 'forum', 'apostila', 'outros', 'apps'];

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

  // Magic-link return (track-36): the emailed validation link lands here as ?lt=<token>. Consume
  // it BEFORE fetching the view, so the session is set and content loads approved (or the pending
  // wall shows). auth_verify marks the e-mail validated + mints the session on this device. A
  // RECENT click (the original "aguardando validação" page is likely still open, polling and about
  // to unlock itself) shows the clean "e-mail validated" confirmation with the timeline HIDDEN; a
  // later click opens the trail directly.
  const _magic = LOGIN_ENABLED ? await consumeMagicToken(loc, api) : null;

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
    // A RECENT magic-link click by an ALREADY-APPROVED student (the original "aguardando validação"
    // tab is likely still open, polling and about to unlock itself) shows the clean "e-mail validated"
    // confirmation with the timeline HIDDEN, not the trail — "Abrir a trilha aqui" reveals it on demand.
    // A student who is validated but STILL PENDING has no access yet, so we do NOT offer that button:
    // renderTrilhaView drops them straight on the "Acesso em análise" wall. Any other load renders the
    // trail straight away.
    if (_magic && _magic.validated && _magic.recent && !isWall((state.data || {}).access)) renderValidatedNotice(root, loc);
    else renderTrilhaView(root, loc);
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
// track-36 c: the header login/logout pill was retired (the wall is the single Entrar screen;
// logout lives in the settings box). refreshLoginPill is kept as an inert no-op so its call sites
// (recheckAuth / afterAuth) stay simple — there is simply no pill to repaint anymore.
function refreshLoginPill() { /* no pill to refresh (retired) */ }

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

    // The standalone "Entrar" pill was retired (track-36 c): the wall IS the single Entrar
    // screen (e-mail-first), so a header pill duplicating it lost its purpose (Élder). An
    // anonymous student on a gated turma just sees the wall. Logged-in logout lives in the
    // settings box (below), so the header carries no login/logout pill either way.

    // Settings box (the initials avatar) + bell: shown whenever the student holds ACCESS —
    // i.e. approved (Élder 2026-07-13). This includes a provisional, not-yet-validated session
    // granted by an open window or by emergency (simple) enrol: they have real access NOW, need
    // the logout (to switch e-mails) and get the bell. Only a just-requested/pending student (still
    // 'pending' / not approved, on the "confira seu e-mail" screen) is excluded — the status gate
    // below already keeps them out. It carries the logout (ALWAYS) plus the notif prefs (only when
    // the forum is on). Header order: bell + theme toggle on the LEFT; the settings gear on the
    // RIGHT, appended AFTER the theme toggle (Élder).
    if (LOGIN_ENABLED && state.sessionToken && data.access && data.access.gated
        && data.access.status === 'approved') {
      const turmaKey = state.clientSlug + '/' + state.turmaSlug;
      // The bell is ALWAYS here (Élder 2026-07-14) — it is NOT a forum feature. It is the
      // one shared component (js/notif-bell.js, same as the Codex topbar) fed by a pluggable
      // set of sources, and each SOURCE owns its own gate server-side: the forum contributes
      // only where the turma enabled it, a tarefa resposta/nota contributes regardless. So we
      // no longer gate the MOUNT on forum_enabled — an empty feed simply renders no badge,
      // which costs nothing, while gating the mount meant a reply could never be announced on
      // a forum-off turma. Same two tiers as the admin: Dispensáveis clear on open (markSeen),
      // Acionáveis persist until dismissed one-by-one (×  → dismissItem) or via "marcar tudo"
      // (markAll → scope:'all', which also clears the actionable floor).
      const bell = createBell({
        role: 'student',
        fetchNotifications: () => trail.forumNotifications({ session_token: state.sessionToken, _silent: true }),
        // Durable history (track-44): served by the worker, so the tray's Histórico survives a reload.
        fetchHistory: () => trail.notifHistory({ session_token: state.sessionToken, _silent: true }),
        // The student's prefs live HERE, not inside the fetch, so they apply identically to a
        // feed we fetched and to one that rode back on another call (notif-bus). Putting them
        // in the fetch would have let a piggybacked envelope bypass them.
        adaptFeed: (res) => {
          const items = filterByPrefs((res && res.items) || [], getPrefs(turmaKey));
          return { count: items.length, items };
        },
        markSeen: () => trail.forumMarkSeen({ session_token: state.sessionToken }),
        markAll: () => trail.forumMarkSeen({ session_token: state.sessionToken, scope: 'all' }),
        dismissItem: (item) => trail.forumDismiss({
          session_token: state.sessionToken,
          notif_key: item.notif_key,
          up_to_at: item.created_at,
        }),
        onNavigate: (item) => {
          // Already on this turma's page, so navigate IN-PAGE per source; the deeplink is
          // only the cross-device fallback. Dynamic import dodges the page.js↔forum.js cycle.
          // Tarefa feedback: land ON the answered tarefa with the professor's resposta open,
          // not merely on the tab. focusTarefa FIRST (it remembers the request), THEN the tab
          // switch — the tab may still have to mount + load, and it applies the focus when it
          // paints. If we are already on the tab the hash is a no-op and focusTarefa repaints.
          if (item && item.type === 'tarefa_feedback' && item.item_id != null) {
            import('./tarefas.js').then((m) => {
              m.focusTarefa(item.item_id);
              if (_win && _win.location) _win.location.hash = '#tarefas';
            });
            return;
          }
          // Comunicado: the message body rides in the item — open it in place (a modal), never
          // navigate. The old fall-through to deeplink just reloaded the trilha showing nothing.
          if (item && item.type === 'comunicado') {
            import('./comunicado-modal.js').then((m) => m.openComunicado(item)).catch(() => {});
            return;
          }
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
        initials: avatarInitials((data.participant || {}).name),
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
        // "Meus dados" (track-42): read-only. The student sees what we hold; changing or erasing it
        // is a request to support, by hand (Élder 2026-07-15). Only offered when there IS a
        // participant to show — an anonymous view has nothing to answer with.
        onMyData: (data.participant)
          ? (() => openMyData(data.participant, contextFromState(state), { root: _root }))
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
// Magic-link return (track-36): consume ?lt=<token>. auth_verify marks the e-mail validated,
// mints the session on THIS device, and (for an already-approved e-mail) unlocks durably. A
// pending newcomer just gets a walled session and lands on the pending wall. The token is
// single-use; strip it from the URL so a refresh can't replay it. Best-effort throughout — a
// bad/expired link falls through to the wall rather than erroring.
// A click within 15 min of the request means the original "aguardando validação" page is likely
// still open + polling, so this page shows the clean "e-mail validated" confirmation (timeline
// hidden) instead of taking over the tab; a later click opens the trail directly.
const MAGIC_RECENT_SECONDS = 15 * 60;

async function consumeMagicToken(loc, api) {
  let lt = null;
  try { lt = new URLSearchParams((loc && loc.search) || '').get('lt'); } catch (_) { lt = null; }
  if (!lt) return { validated: false, recent: false };
  let validated = false, recent = false;
  try {
    const res = await api.authVerify({
      token: lt,
      presence_token: getPresence(state.clientSlug, state.turmaSlug) || undefined,
      _silent: true,
    });
    if (res && res.ok && res.session_token) {
      setToken(state.clientSlug, state.turmaSlug, res.session_token);
      validated = true;
      recent = typeof res.link_age_seconds === 'number' && res.link_age_seconds <= MAGIC_RECENT_SECONDS;
    }
  } catch (_) { /* bad/expired link -> fall through to the wall */ }
  try {
    if (_win && _win.history && _win.history.replaceState) {
      const u = new URL(_win.location.href);
      u.searchParams.delete('lt');
      _win.history.replaceState({}, '', u.pathname + (u.search || '') + (u.hash || ''));
    }
  } catch (_) { /* strip is best-effort */ }
  return { validated, recent };
}

// Render the actual trail: the timeline (approved / open) or the register-and-pending wall
// (gated + unapproved). Extracted so the magic-link confirmation can DEFER it behind a button
// ("Abrir a trilha aqui") instead of rendering it up front.
function renderTrilhaView(root, loc) {
  // Upfront-gated + unapproved: render the wall instead of the timeline. Inline mode (and
  // approved / open) renders the timeline as usual; the per-item gate in sub.js/flat.js
  // handles inline opens.
  if (LOGIN_ENABLED && isWall((state.data || {}).access)) {
    // ONE wall for every turma. Which DOOR it draws (OTP or the break-glass Emergência) is the
    // wall's own business now, picked from access.simple_enroll by its ACCESS_MODES table. This
    // used to branch to a whole second page, and the copy drifted (Élder 2026-07-15).
    renderWall(root);
  } else {
    renderTabs(root);
    _onHash = () => onHashChange();
    if (_win) _win.addEventListener('hashchange', _onHash);
    // Deeplink: the notification bell emits ?thread=<id>. Land on the Fórum tab (forum.js
    // reads the param and opens the thread). Only when the turma enabled the forum.
    const turma = (state.data || {}).turma || {};
    const hasThreadLink = (() => { try { return !!new URLSearchParams((loc && loc.search) || '').get('thread'); } catch (_) { return false; } })();
    if (hasThreadLink && turma.forum_enabled && _win && _win.location) _win.location.hash = '#forum';
    onHashChange();
    // "Salvar como app": offer a home-screen install on the timeline only (never on the login
    // wall), and only when the turma enables it (per-turma flag, DEFAULT-ON). Self-guards: no-op
    // if installed, not installable, or previously dismissed.
    if (turma.app_install_prompt !== 0) initInstallPrompt(root, { win: _win });
  }
}

// Reveal the trail from behind the magic-link confirmation: drop the notice, unhide the timeline
// shell, then render as usual. (A pending student's renderWall re-hides the shell and shows the
// pending notice; an approved student sees the timeline.)
function revealTrilha(root, loc) {
  const main = root.querySelector('.cdx-trilha-main');
  if (main) {
    const wall = main.querySelector('.cdx-en-wall');
    if (wall) wall.remove();
    const tabs = main.querySelector('.cdx-trilha-tabs');
    const content = main.querySelector('.cdx-trilha-tabcontent');
    if (tabs) tabs.hidden = false;
    if (content) content.hidden = false;
  }
  if (root.classList) root.classList.remove('cdx-tr-has-wall');
  renderTrilhaView(root, loc);
}

// The magic-link "e-mail validated" confirmation (track-36). Reuses the shared full-page notice
// (renderNoticePage / .cdx-en-pending), so the timeline stays HIDDEN behind a clean page — NOT a
// modal over a rendered trail. Primary path: go back to the original tab, which unlocked itself via
// its poll. Fallback (no original tab, e.g. clicked on the phone): "Abrir a trilha aqui" reveals
// the trail on this device.
function renderValidatedNotice(root, loc) {
  renderNoticePage(root, {
    glyph: 'check-circle',
    cls: 'cdx-en-ok',
    title: t('login.validated_title'),
    body: t('login.validated_body'),
    orLabel: t('login.validated_or'),
    action: { label: t('login.validated_cta'), onClick: () => revealTrilha(root, loc) },
  });
}

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

// The mobile bottom-nav mark per tab (desktop hides it: trilha.css `.cdx-tr-tab-ico{display:none}`).
// These six were six hand-drawn <svg> in trilha/index.html, and FOUR were byte-identical copies of
// drawings js/glyphs.js already owned, with `checklist` a re-encoding of the same vertices and
// `lines` the only mark the library lacked (registered there now). Élder 2026-07-16: the icon comes
// from the library, always. Injected here because HTML cannot call glyphSvg; no pop-in, since the
// tabs start `hidden` in the markup and renderTabs is what unhides them. size:null because
// mobile.css owns width/height/stroke/fill (.cdx-tr-tab-ico), down to stroke-width 1.9.
const TAB_GLYPH = {
  aulas: 'lines', tarefas: 'checklist', forum: 'message-square',
  outros: 'folder', apps: 'grid', apostila: 'book',
};

function _tabGlyph(btn) {
  const key = TAB_GLYPH[btn.dataset.tab];
  if (!key || btn.querySelector('.cdx-tr-tab-ico')) return; // renderTabs re-runs; inject once
  btn.insertAdjacentHTML('afterbegin', glyphSvg(key, { size: null, cls: 'cdx-tr-tab-ico' }));
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
  const tarefasBtn = root.querySelector('#cdx-tr-tab-tarefas');

  // The Fórum tab shows only when the turma enabled it.
  if (forumBtn) forumBtn.hidden = !turma.forum_enabled;

  // The Tarefas tab is per-student (your own submissions), so it needs a session: show it only
  // when the student is logged in AND at least one tarefa is revealed. On an open turma (no
  // session) it stays hidden, since "my tarefas" has no identity to resolve.
  if (tarefasBtn) tarefasBtn.hidden = !(state.sessionToken && items.some((it) => it.type === 'tarefa'));

  // Aplicativos tab: shows only when the turma has at least one app whose lesson has
  // occurred (the backend already applied that happened-gate to data.apps). With exactly
  // one app the tab takes that app's name; with several it is the generic "Aplicativos".
  // Each tab button now wraps its label in a .cdx-tr-tab-txt span (next to the inline SVG icon),
  // so set the SPAN's text, never the button's textContent, which would wipe the icon.
  const labelEl = (btn) => (btn && (btn.querySelector('.cdx-tr-tab-txt') || btn));
  const apps = data.apps || [];
  if (appsBtn) {
    appsBtn.hidden = !apps.length;
    if (apps.length === 1 && apps[0].name) labelEl(appsBtn).textContent = apps[0].name;
    else labelEl(appsBtn).textContent = t('page.tab_apps');
  }

  if (outrosBtn) {
    if (outros.length) labelEl(outrosBtn).textContent = t('page.tab_outros') + ' (' + outros.length + ')';
    outrosBtn.hidden = !outros.length;
  }
  if (apostilaBtn) apostilaBtn.hidden = !apostilaCount;

  // Short labels for the mobile fixed bottom nav (the full labels wrap at ≤700px). The CSS hides
  // the button's text node and draws data-short via ::after; set it from i18n so pt/en both work.
  root.querySelectorAll('.cdx-tr-tab-btn').forEach((btn) => {
    const key = 'page.tabshort_' + btn.dataset.tab;
    const short = t(key);
    if (short && short !== key) btn.setAttribute('data-short', short);
    _tabGlyph(btn);
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
