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
import { extractMagicToken, isLoggedIn, clearToken, LOGIN_ENABLED } from './student-session.js';
import { openLoginModal } from './student-login-modal.js';

const PANELS = ['aulas', 'apostila', 'outros'];

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
  try {
    state.data = await api.turmaView({
      client_slug: state.clientSlug,
      turma_slug: state.turmaSlug,
      token: state.token,
      _admin: state.isAdmin,
      _silent: true,
    });
    const loading = root.querySelector('.cdx-trilha-loading');
    const main = root.querySelector('.cdx-trilha-main');
    if (loading) loading.hidden = true;
    if (main) main.hidden = false;
    renderHero(root);
    renderHeaderActions();
    renderTabs(root);
    _onHash = () => onHashChange();
    if (_win) _win.addEventListener('hashchange', _onHash);
    onHashChange();
    if (LOGIN_ENABLED) handleMagicReturn(loc);
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
      clearToken(state.clientSlug, state.turmaSlug);
      refreshLoginPill();
    } else {
      openLoginModal({
        client: state.clientSlug, turma: state.turmaSlug, k: state.token,
        onAuthenticated: refreshLoginPill,
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

    if (LOGIN_ENABLED) {
      _loginPill = buildLoginPill();
      prepend(_loginPill);
    }
  })();
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
    startToken: lt,
    onAuthenticated: refreshLoginPill,
  });
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

function renderTabs(root) {
  const data = state.data || {};
  const items = data.items || [];
  const outros = items.filter((it) => it.aula_number == null && it.set_id == null && it.type !== 'tarefa');
  const apostilaSet = data.apostila_set;
  const apostilaCount = apostilaSet ? items.filter((it) => it.set_id === apostilaSet.id).length : 0;

  const outrosBtn = root.querySelector('#cdx-tr-tab-outros');
  const apostilaBtn = root.querySelector('#cdx-tr-tab-apostila');

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
