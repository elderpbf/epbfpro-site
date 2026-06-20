// engine/author-mode.js
//
// Author Mode toggle. Persisted in localStorage. Reflects as
// data-author-mode="on" on #pn-host so CSS can show/hide author affordances.
// Off by default. Never shown in ?presenter=mirror (caller guards).

const KEY = 'bs_pn_author_mode';

let _on = false;
try { _on = localStorage.getItem(KEY) === 'true'; } catch (_) {}

const _listeners = [];

export function isOn() { return _on; }

export function setOn(val) {
  _on = !!val;
  try { localStorage.setItem(KEY, String(_on)); } catch (_) {}
  _apply();
  _listeners.forEach(fn => fn(_on));
}

export function toggle() { setOn(!_on); }

export function subscribe(fn) {
  _listeners.push(fn);
  return () => {
    const i = _listeners.indexOf(fn);
    if (i >= 0) _listeners.splice(i, 1);
  };
}

function _apply() {
  const host = document.getElementById('pn-host') || document.body;
  if (_on) host.setAttribute('data-author-mode', 'on');
  else host.removeAttribute('data-author-mode');
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _apply);
  } else {
    _apply();
  }
}
