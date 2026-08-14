// codex/trilha/js/push-invite.js
// track-44: the invitation to turn on notifications, sibling of install-prompt.js.
//
// WHY IT EXISTS. Push has worked since Etapa B, but the only way to start it was to open the
// gear, find the preferences grid and toggle a cell. Nobody discovers that, so the machinery
// reached almost nobody. This is the offer, in the one place on the trail a student cannot miss.
//
// IT INHERITS THE INSTALL BAR'S PLACE, and its markup, on purpose: not installed shows "Salvar
// como app", installed shows this, already authorized shows nothing. One strip at a time in one
// spot, so the top of the trail never becomes a stack of asks. Reusing the .cdx-install-* classes
// is what makes them the SAME strip rather than two that look alike until one of them drifts.
//
// THE TEXT IS GENERIC ON PURPOSE (Élder 2026-07-26). Browser permission is per domain and covers
// every category at once, so a promise about one of them ("we will remind you the day before
// class") is a promise the next producer breaks. The invite asks about the trail as a whole; the
// per-category control stays in the preferences grid.
//
// BLOCKED MEANS GONE. If the student refuses at the browser prompt, the strip is removed and does
// not come back: a button that cannot do anything is a switch that lies. The COLLAPSED strip is
// the permanent re-offer for everyone else, which is why there is no "later" button and no
// counter of days.
import { t } from '../i18n.js';
import { esc } from './utils.js';
import { glyphSvg } from '../../js/glyphs.js';
import { isInstallAvailable } from './install-prompt.js';
import { pushAvailability } from './push-subscribe.js';

const LOGO_SRC = '/codex/trilha/icons/app-icon-192.png';
const BELL_GLYPH = glyphSvg('bell', { size: null, cls: 'cdx-install-glyph-svg', strokeWidth: 2.2 });

// PURE. Should the invite be on screen? Every input is passed in, so the whole ladder is one
// readable expression and the test does not need a browser.
//   hasSession      the student is logged in (a subscription is saved against their identity)
//   capable         this device can actually receive push (push-subscribe.js's pushAvailability)
//   installAvailable the install bar is claiming the spot right now
//   permission      Notification.permission: 'default' | 'granted' | 'denied'
export function pushInviteState(o = {}) {
  if (!o.hasSession) return 'hidden';
  if (!o.capable) return 'hidden';
  if (o.installAvailable) return 'hidden';
  if (o.permission === 'granted') return 'hidden';
  if (o.permission === 'denied') return 'hidden';
  return 'offer';
}

// PURE. The browser's current permission, defaulting to 'default' where Notification is absent
// (which `capable` has already ruled out, but a null read must not crash the ladder).
export function currentPermission(win) {
  win = win || (typeof window !== 'undefined' ? window : undefined);
  const n = win && win.Notification;
  return (n && n.permission) || 'default';
}

// First user interaction (scroll / pointer / key). Fires once, then self-removes. Copied in
// shape from install-prompt.js so the two strips collapse identically.
function onFirstInteraction(win, fn) {
  let done = false;
  const run = () => { if (done) return; done = true; cleanup(); fn(); };
  const cleanup = () => {
    win.removeEventListener('scroll', run, true);
    win.removeEventListener('pointerdown', run, true);
    win.removeEventListener('keydown', run, true);
  };
  win.addEventListener('scroll', run, true);
  win.addEventListener('pointerdown', run, true);
  win.addEventListener('keydown', run, true);
  return cleanup;
}

// The single live strip, module-scoped so a second init re-expands instead of duplicating.
let _ui = null;

// Mount the invite, if there is one to make. Renders NOTHING when the ladder says hidden.
//   opts.win        window (injected for tests)
//   opts.hasSession the student holds access
//   opts.subscribe  () => Promise<{ ok, reason? }>  (page.js wires push-subscribe.js + facade)
export function initPushInvite(root, opts = {}) {
  const win = opts.win || (typeof window !== 'undefined' ? window : undefined);
  if (!win || !root) return;
  const doc = win.document;
  if (!doc) return;

  const state = pushInviteState({
    hasSession: !!opts.hasSession,
    capable: pushAvailability(win).capable,
    installAvailable: isInstallAvailable(win),
    permission: currentPermission(win),
  });
  if (state !== 'offer') return;

  if (_ui && _ui.bar && _ui.bar.isConnected) { _ui.expand(); return; }
  _ui = null;

  const host = root.querySelector('.cdx-trilha-main') || root;
  const hero = root.querySelector('.cdx-trilha-hero');
  let disarm = null;

  const bar = doc.createElement('div');
  bar.className = 'cdx-install-bar cdx-push-invite';
  bar.setAttribute('role', 'button');
  bar.setAttribute('tabindex', '0');
  bar.innerHTML =
    '<img class="cdx-install-logo" src="' + LOGO_SRC + '" alt="" width="40" height="40">' +
    '<div class="cdx-install-body">' +
      '<span class="cdx-install-title">' + esc(t('pushinvite.title')) + '</span>' +
      '<span class="cdx-install-desc">' + esc(t('pushinvite.desc')) + '</span>' +
    '</div>' +
    '<span class="cdx-install-minlabel">' + esc(t('pushinvite.pill')) + '</span>' +
    '<span class="cdx-install-cta">' + esc(t('pushinvite.btn')) + '</span>' +
    '<span class="cdx-install-glyph">' + BELL_GLYPH + '</span>';

  function collapse() { if (bar) bar.classList.add('is-min'); }
  function armCollapse() {
    if (disarm) { disarm(); disarm = null; }
    disarm = onFirstInteraction(win, collapse);
  }
  function expand() { bar.classList.remove('is-min'); armCollapse(); }
  function teardown() {
    if (disarm) { disarm(); disarm = null; }
    bar.remove();
    if (hero && !host.querySelector('.cdx-install-bar')) hero.classList.remove('cdx-install-joined');
    _ui = null;
  }

  let asking = false;
  function ask() {
    if (asking) return;
    asking = true;
    Promise.resolve(opts.subscribe && opts.subscribe()).then((res) => {
      asking = false;
      if (res && res.ok) { teardown(); return; }
      const reason = (res && res.reason) || 'error';
      // Refused at the browser prompt: the permission is now 'denied' and no click of ours can
      // reopen it. Leaving the strip up would be an offer we cannot honour.
      if (reason === 'denied') { teardown(); return; }
      if (win.bsLog) win.bsLog('push-invite: assinatura falhou (' + reason + ')', 'error');
      collapse();
    }).catch((e) => {
      asking = false;
      if (win.bsLog) win.bsLog('push-invite: ' + ((e && e.message) || e), 'error');
      collapse();
    });
  }

  bar.addEventListener('click', ask);
  bar.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ask(); }
  });

  host.prepend(bar);
  if (hero) hero.classList.add('cdx-install-joined');
  _ui = { bar, expand, teardown };
  armCollapse();
}

// Tear the strip down from outside (the student turned push on somewhere else, e.g. the
// preferences grid). Silent no-op when nothing is mounted.
export function hidePushInvite() {
  if (_ui && _ui.teardown) _ui.teardown();
}
