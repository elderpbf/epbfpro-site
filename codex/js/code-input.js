'use strict';

// codex/js/code-input.js
// The CODE field, a single one, for every screen.
//
// Élder's request on 2026-07-31: *"o campo deve permitir apenas a quantidade esperada de
// caracteres, centralizados e auto uppercase"*, and the part that gives the mandate: *"isso tem
// que ser onde eles tiverem, seja no codex, advradar, laudo app, backstage, pdf extractor"*.
//
// WHAT THIS REPLACES: five hand-written code fields across this repository (Codex login, Trail
// entry, the student login modal, the wall, the live-class code), each with a different
// combination of attributes, one of them with style embedded in the HTML, and NONE of them
// actually forcing the value to uppercase. A rule written five times doesn't go wrong all at
// once, it goes wrong one screen at a time.
//
// THE DIFFERENCE THAT MAKES A DIFFERENCE: `text-transform: uppercase` changes what you SEE, not
// what gets SENT. The field showed RPBH and sent `rpbh`. Here the value is actually normalized,
// and the CSS class exists only so the field doesn't flash lowercase while the person types.
//
// A CLASSIC script on purpose, exposing `window.CodeInput`, exactly like `theme-manager.js`
// next to it: the screens in this repository are half ES module, half classic script, and a
// global serves both without forcing anyone to become a module. The `module.exports` at the
// end is only for the test (node --test), and is guarded so it doesn't exist in the browser.
var CodeInput = (function () {
  // THE FIELD'S ALPHABET HAS TO BE WHAT THE SERVER EMITS, and the comment that used to be here
  // described an alphabet this code didn't implement (it said it followed the `OTP_ALPHABET` from
  // `codex-api` "sem I, O e Q", but the pattern accepted DIGITS and Q exists in the real alphabet).
  //
  // Checked against `codex-api/src/lib/student-auth.js` on 2026-07-31: the OTP is
  // `ABCDEFGHJKLMNPQRSTUVWXYZ`, that is **26 letters minus I and O** (they look like 1 and 0), and
  // the server's `normalizeOtpCode` discards anything that isn't `A-Z`. A field that accepted
  // digits let the student type `0` instead of `O`, exactly the confusion that made the alphabet
  // exclude those two letters, and the server would answer "código inválido" without saying why.
  var ALFABETOS = {
    letters: /[^A-Z]/g,
    digits: /[^0-9]/g,
    alnum: /[^A-Z0-9]/g
  };
  // DEFAULT = `letters`, and it's a choice: every code this system EMITS today is either 4
  // letters (OTP) or 4 digits (turma code, which asks for `digits` explicitly). `alnum` doesn't
  // match anything that exists, so leaving it as the default would only let a new screen be born
  // accepting a character the server will reject. Still available for a mixed code that may
  // come to exist.
  var ALFABETO_PADRAO = 'letters';

  // PURE. The value the field should have, given what the person typed or pasted.
  //
  // Pasting from e-mail is the common case and brings junk: a leading space, a trailing line
  // break, sometimes the sentence's final period. None of that can turn into a "código inválido"
  // error in the face of someone who pasted the right code.
  function normalize(value, opts) {
    opts = opts || {};
    var length = opts.length || 4;
    var limpa = ALFABETOS[opts.mode] || ALFABETOS[ALFABETO_PADRAO];
    return String(value == null ? '' : value).toUpperCase().replace(limpa, '').slice(0, length);
  }

  // Wires the behavior onto an <input> that already exists. Returns the element itself.
  //
  // `onComplete` fires ONCE per fill (the caller uses it to self-submit, and calling it twice
  // would submit twice). Clearing and completing again fires it again, which is what someone
  // who mistyped a digit expects.
  function attach(el, opts) {
    if (!el) return el;
    opts = opts || {};
    var length = opts.length || 4;

    el.setAttribute('maxlength', String(length));
    el.setAttribute('inputmode', opts.mode === 'digits' ? 'numeric' : 'text');
    el.setAttribute('autocomplete', 'one-time-code');
    el.setAttribute('autocapitalize', 'characters');
    el.setAttribute('autocorrect', 'off');
    el.setAttribute('spellcheck', 'false');
    if (String(el.className || '').indexOf('pia-code') === -1) {
      el.className = (el.className ? el.className + ' ' : '') + 'pia-code';
    }

    var completou = false;
    el.addEventListener('input', function () {
      var antes = el.value;
      var depois = normalize(antes, { length: length, mode: opts.mode });
      if (depois !== antes) {
        el.value = depois;
        // The cursor moves back to the end when the value was rewritten. Without this, typing
        // a rejected character throws the cursor to the start mid-typing.
        if (typeof el.setSelectionRange === 'function') {
          try { el.setSelectionRange(depois.length, depois.length); } catch (e) { /* field has no selection */ }
        }
      }
      if (depois.length === length) {
        if (!completou) {
          completou = true;
          if (typeof opts.onComplete === 'function') opts.onComplete(depois);
        }
      } else {
        completou = false;
      }
    });

    return el;
  }

  // A wrong code clears the field (Élder 2026-07-31). Whoever got it wrong will type again, and
  // deleting over four characters that are already there is work the field should do by itself.
  // Focus comes back with it, otherwise the person takes in the error and the cursor is nowhere.
  //
  // This lives HERE and not in each screen because the rule is the same across all five, and a
  // rule repeated five times goes wrong one screen at a time.
  function clear(el, opts) {
    if (!el) return el;
    el.value = '';
    if (!opts || opts.focus !== false) {
      try { el.focus(); } catch (e) { /* field not in view */ }
    }
    return el;
  }

  return { normalize: normalize, attach: attach, clear: clear };
})();

if (typeof window !== 'undefined') window.CodeInput = CodeInput;
if (typeof module !== 'undefined' && module.exports) module.exports = CodeInput;
