/* PensoLabs shared operator control: text-size (A− / A+).
   Nudges the global --lab-fs-scale multiplier that every --lab-fs-*
   token multiplies by, so one control resizes the whole lab. The value
   is clamped, persisted in localStorage['lab_fs_scale'], and applied to
   documentElement as soon as this script runs (before mount) so a
   room-tuned size survives a reload without a visible resize.

   Opt-in: a lab includes this script AND (optionally) provides a
   placeholder <span data-lab-fs-ctl></span> to host the buttons inside
   its own operator bar. With no placeholder, the control floats fixed at
   bottom-left. Not loaded by labs that haven't been migrated, so it never
   appears where the tokens wouldn't respond to it.

   Public API: window.LabFontScale.{get, set, reset}.

     <script src="../js/lab-controls.js?v=1.0" defer></script>
*/
(function () {
  var KEY = 'lab_fs_scale';
  var MIN = 0.8, MAX = 1.8, STEP = 0.1;

  function clamp(v) {
    if (isNaN(v)) return 1;
    v = Math.round(v * 10) / 10;
    return Math.min(MAX, Math.max(MIN, v));
  }
  function read() {
    try { return clamp(parseFloat(localStorage.getItem(KEY))); }
    catch (e) { return 1; }
  }
  function apply(v) {
    document.documentElement.style.setProperty('--lab-fs-scale', String(v));
  }

  var scale = read();
  apply(scale); // pre-mount, avoids a resize flash

  var valEls = [];
  function refresh() {
    var pct = Math.round(scale * 100) + '%';
    for (var i = 0; i < valEls.length; i++) valEls[i].textContent = pct;
  }
  function set(v) {
    scale = clamp(v);
    apply(scale);
    try { localStorage.setItem(KEY, String(scale)); } catch (e) {}
    refresh();
  }

  function build(host, fixed) {
    host.classList.add('lab-fs-ctl');
    if (fixed) host.classList.add('lab-fs-ctl--fixed');
    host.innerHTML =
      '<button type="button" class="lab-fs-btn" data-act="dec" aria-label="Diminuir o texto">A−</button>' +
      '<span class="lab-fs-val">100%</span>' +
      '<button type="button" class="lab-fs-btn" data-act="inc" aria-label="Aumentar o texto">A+</button>';
    valEls.push(host.querySelector('.lab-fs-val'));
    host.querySelector('[data-act="dec"]').addEventListener('click', function () { set(scale - STEP); });
    host.querySelector('[data-act="inc"]').addEventListener('click', function () { set(scale + STEP); });
  }

  function mount() {
    var hosts = document.querySelectorAll('[data-lab-fs-ctl]');
    if (hosts.length) {
      for (var i = 0; i < hosts.length; i++) build(hosts[i], false);
    } else {
      var fx = document.createElement('div');
      document.body.appendChild(fx);
      build(fx, true);
    }
    refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }

  window.LabFontScale = {
    get: function () { return scale; },
    set: set,
    reset: function () { set(1); }
  };
})();
