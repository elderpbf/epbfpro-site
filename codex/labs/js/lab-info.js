/* PensoLabs shared info / theory modal.
   The app-fit standard strips expository text off the lab stage so it
   fits one no-scroll screen. That theory still has to live somewhere for
   the student who opens the lab alone, with no instructor narrating. This
   module is that home: a LABELLED button (default "Entenda", not a bare
   "?" a student wouldn't decode) that opens a shared modal with the lab's
   theory. Uniform across every lab.

   A lab opts in with two bits of markup:
     1) a hidden source block declaring the theory (HTML allowed):
        <template data-lab-info
                  data-lab-info-title="Por que o modelo se perde no meio?">
          <p>…</p>
        </template>
     2) a compact slot for the trigger button, grouped with the operator
        chrome (kept small — screen space is tight):
        <span data-lab-info-ctl></span>
     …and the script:
        <script src="../js/lab-info.js?v=1.0" defer></script>

   With no [data-lab-info-ctl] slot the button floats fixed top-right, so
   the affordance stays uniform even in labs that don't reserve a slot.
   The label defaults to "Entenda" and is overridable with
   data-lab-info-label on the source block or the slot.

   Public API: window.LabInfo.{open, close, mount}.
*/
(function () {
  var DEFAULT_LABEL = 'Entenda';
  var DEFAULT_TITLE = 'Entenda';

  // Lightbulb glyph — signals "understand the idea", not just generic info.
  var ICON =
    '<svg class="lab-info-btn__icon" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M9 18h6"/><path d="M10 21h4"/>' +
    '<path d="M12 3a6 6 0 0 0-3.5 10.9c.5.4.8.9.9 1.5l.1.6h5l.1-.6c.1-.6.4-1.1.9-1.5A6 6 0 0 0 12 3Z"/>' +
    '</svg>';

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var source = null;    // { title, html, label }
  var backdrop = null;  // modal root, built lazily on first open
  var titleEl = null, bodyEl = null;
  var lastFocused = null;

  function readSource() {
    var el = document.querySelector('[data-lab-info]');
    if (!el) return null;
    return {
      title: el.getAttribute('data-lab-info-title') || DEFAULT_TITLE,
      html: el.innerHTML,
      label: el.getAttribute('data-lab-info-label') || null
    };
  }

  function buildModal() {
    if (backdrop) return;
    backdrop = document.createElement('div');
    backdrop.className = 'lab-modal-backdrop';
    backdrop.setAttribute('role', 'presentation');
    backdrop.innerHTML =
      '<div class="lab-modal" role="dialog" aria-modal="true" ' +
      'aria-labelledby="lab-modal-title" tabindex="-1">' +
        '<button class="lab-modal-close" type="button" aria-label="Fechar">&times;</button>' +
        '<h2 class="lab-modal-title" id="lab-modal-title"></h2>' +
        '<div class="lab-modal-body"></div>' +
      '</div>';
    document.body.appendChild(backdrop);
    titleEl = backdrop.querySelector('.lab-modal-title');
    bodyEl = backdrop.querySelector('.lab-modal-body');

    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) close();
    });
    backdrop.querySelector('.lab-modal-close').addEventListener('click', close);
  }

  function onKey(e) {
    if (e.key === 'Escape' || e.key === 'Esc') close();
  }

  function open() {
    if (!source) source = readSource();
    if (!source) return;
    buildModal();
    titleEl.textContent = source.title;
    bodyEl.innerHTML = source.html;
    lastFocused = document.activeElement;
    backdrop.classList.add('lab-modal-open');
    document.addEventListener('keydown', onKey);
    var dialog = backdrop.querySelector('.lab-modal');
    if (dialog && dialog.focus) dialog.focus();
  }

  function close() {
    if (!backdrop) return;
    backdrop.classList.remove('lab-modal-open');
    document.removeEventListener('keydown', onKey);
    if (lastFocused && lastFocused.focus) {
      try { lastFocused.focus(); } catch (_) {}
    }
  }

  function buildButton(host) {
    var label = (source && source.label) ||
                host.getAttribute('data-lab-info-label') ||
                DEFAULT_LABEL;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lab-info-btn';
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.innerHTML = ICON + '<span class="lab-info-btn__label">' + escapeHtml(label) + '</span>';
    btn.addEventListener('click', open);
    return btn;
  }

  function mount() {
    source = readSource();
    if (!source) return; // no theory declared → no button, silently
    var slots = document.querySelectorAll('[data-lab-info-ctl]');
    if (slots.length) {
      for (var i = 0; i < slots.length; i++) {
        slots[i].appendChild(buildButton(slots[i]));
      }
    } else {
      var b = buildButton(document.body);
      b.classList.add('lab-info-btn--fixed');
      document.body.appendChild(b);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }

  window.LabInfo = { open: open, close: close, mount: mount };
})();
