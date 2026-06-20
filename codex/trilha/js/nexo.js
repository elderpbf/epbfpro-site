// codex/trilha/js/nexo.js
// Live-question orchestrator. Polls cp_get_active_for_turma every 15s (paused via
// the Page Visibility API). When the turma's session is OPEN, it hides the trilha
// body chrome (hero / tabs / content / footer) and mounts the full answer
// experience inline via the Codex nexo-answer module; pensoia-header stays
// visible. When the session closes, it unmounts and restores the trilha. Self-
// contained (parses its own URL) so it does not depend on the page orchestrator.
import { parseLocation, state } from './state.js';
import { trail } from './api.js';
import { mount as mountAnswer_, unmount as unmountAnswer_ } from './nexo-answer.js';

// Cadence is asymmetric on PURPOSE, the opposite way round from the obvious one.
// While a session is OPEN the inner <codex-question> element drives liveness; the
// orchestrator only watches for the CLOSE edge, so a calmer cadence is fine. While
// IDLE the orchestrator is the only thing watching for a session to OPEN, so it
// must poll snappily, otherwise a freshly-opened session takes up to the idle
// interval to surface and the host has to ask students to refresh. Invariant:
// idle <= live, so opening surfaces no slower than closing.
const POLL_LIVE_MS    = 15000; // session open: watch for it to close
const POLL_IDLE_MS    = 8000;  // no session: watch for one to open (snappy)
const HOST_ID         = 'cdx-tr-nexo-host';
const HIDDEN_CLS      = 'cdx-tr-hidden-by-nexo';
// The wall (.cdx-tr-wall) is in the list so that on a gated turma the live-answer
// takeover cleanly replaces the register wall (the live Q&A needs no login); the wall
// is restored when the session closes. (#4: every gated turma now renders the wall.)
const HIDE_SELECTORS  = ['.cdx-trilha-hero', '.cdx-trilha-tabs', '.cdx-trilha-tabcontent', '.cdx-trilha-footer', '.cdx-tr-wall'];

let _loc = null;
let _timer = null;
let _stopped = false;
let _isMounted = false;
let _lastCode = null;

export function startNexo(loc) {
  _loc = loc || parseLocation(location.search, location.pathname);
  if (!_loc.clientSlug || !_loc.turmaSlug) return; // the page will surface its own error
  tick();
  document.addEventListener('visibilitychange', onVisibilityChange);
}

export function stopNexo() { _stopped = true; clearTimeout(_timer); }

// PURE. Next poll delay given whether a session is currently open. Exported so the
// idle<=live invariant (opening surfaces no slower than closing) is unit-pinned.
export function nextDelay(hasSession) { return hasSession ? POLL_LIVE_MS : POLL_IDLE_MS; }

function schedule(ms) {
  if (_stopped) return;
  clearTimeout(_timer);
  _timer = setTimeout(tick, ms);
}

async function tick() {
  if (document.hidden) return; // paused; the visibility handler resumes
  let data;
  try {
    data = await trail.activeForTurma({ client_slug: _loc.clientSlug, turma_slug: _loc.turmaSlug, _silent: true });
  } catch (_) {
    schedule(POLL_LIVE_MS); // transient error: back off to the calmer cadence, retry
    return;
  }
  apply(data || {});
  schedule(nextDelay(!!(data && data.session)));
}

function onVisibilityChange() {
  if (document.hidden) clearTimeout(_timer);
  else tick();
}

// Trigger: a truthy session (cp_get_active_for_turma returns session=null unless OPEN).
function apply(data) {
  const session = data && data.session;
  if (session) {
    const code = session.code || '';
    if (_isMounted && code === _lastCode) return; // already showing
    mountAnswer(code);
  } else if (_isMounted) {
    unmountAnswer();
  }
}

function mountAnswer(sessionCode) {
  HIDE_SELECTORS.forEach((sel) => document.querySelectorAll(sel).forEach((el) => el.classList.add(HIDDEN_CLS)));
  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = HOST_ID;
    (document.querySelector('.cdx-trilha-main') || document.body).appendChild(host);
  }
  mountAnswer_(host, { sessionCode });
  _isMounted = true;
  _lastCode = sessionCode;
}

function unmountAnswer() {
  try { unmountAnswer_(); } catch (_) {}
  const host = document.getElementById(HOST_ID);
  if (host && host.parentNode) host.parentNode.removeChild(host);
  HIDE_SELECTORS.forEach((sel) => document.querySelectorAll(sel).forEach((el) => el.classList.remove(HIDDEN_CLS)));
  _isMounted = false;
  _lastCode = null;
}

// Self-start once the DOM is ready (independent of the page orchestrator).
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => startNexo());
  else startNexo();
}

// Test/cleanup surface.
export const _internal = { tick, apply, isMounted: () => _isMounted };
