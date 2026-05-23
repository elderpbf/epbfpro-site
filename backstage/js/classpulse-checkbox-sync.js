(function() {
  'use strict';

  // Bundle J: the "Mostrar resultados" / "Revelar resposta correta" checkboxes
  // in host.html used to be stomped by every 3-second poll tick because the
  // original setChk helper did `chk.checked = enabled` -- conflating the
  // CONTROL state (enabled/disabled based on question type) with the VALUE
  // state (checked/unchecked, which the user toggles). This module separates
  // those concerns.
  //
  //   sync({chk, supported}):
  //     - Enable or disable the control based on whether the active question
  //       type supports it. The CHECKED state is left alone when supported so
  //       the user's local toggle survives the next poll.
  //     - When NOT supported, force checked back to false so a disabled
  //       checkbox does not silently submit a stale true.
  //
  //   reset({chk, supported, defaultChecked}):
  //     - Explicit seed path used on (a) new question launch / launch form
  //       reset and (b) the initial type-selector wiring. Sets checked back
  //       to the requested default regardless of prior state.

  function applyLabelState(chk, supported) {
    var lbl = chk.parentElement;
    if (!lbl || !lbl.style) return;
    lbl.style.opacity       = supported ? '' : '0.35';
    lbl.style.cursor        = supported ? '' : 'not-allowed';
    lbl.style.pointerEvents = supported ? '' : 'none';
  }

  function sync(opts) {
    var chk = opts && opts.chk;
    if (!chk) return;
    var supported = !!opts.supported;
    chk.disabled = !supported;
    if (!supported) {
      // Disabled controls must not carry a stale checked value -- the user
      // can't see or toggle them, but downstream code reads .checked.
      chk.checked = false;
    }
    applyLabelState(chk, supported);
  }

  function reset(opts) {
    var chk = opts && opts.chk;
    if (!chk) return;
    var supported = !!opts.supported;
    chk.disabled = !supported;
    chk.checked  = supported ? !!opts.defaultChecked : false;
    applyLabelState(chk, supported);
  }

  window.CPCheckboxSync = { sync: sync, reset: reset };
})();
