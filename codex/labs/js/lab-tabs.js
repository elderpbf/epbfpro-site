/* PensoLabs shared mobile-tab primitive.
   On phones (<=700px) a two-panel lab reads far better showing ONE panel
   at a time behind a tab bar than squishing both side by side. This module
   turns any container into that, with zero desktop impact: above 700px the
   tab bar is removed and the panels are shown, letting the lab's own grid
   drive the layout.

   Markup (panels must be DIRECT children of the container):
     <div class="k3-main" data-lab-tabs data-lab-tab-default="Janela">
       <div class="k3-bars"   data-lab-tab="Janela">…</div>
       <aside class="k3-legend" data-lab-tab="Composição">…</aside>
     </div>
     <script src="../js/lab-tabs.js?v=1.0" defer></script>

   Inactive panels get the [hidden] attribute (labs.css forces display:none
   with !important so a panel's own display can't win on source order).

   Programmatic switch (e.g. auto-flip to the analysis panel when the
   operator clicks "Pedir análise"): window.LabTabs.show(containerEl, 'Análise').

   Public API: window.LabTabs.{init, show}.
*/
(function () {
  var MQ = window.matchMedia('(max-width: 700px)');

  function panelsOf(container) {
    return Array.prototype.filter.call(container.children, function (c) {
      return c.hasAttribute && c.hasAttribute('data-lab-tab');
    });
  }

  function setup(container) {
    if (container.__labTabs) return container.__labTabs;
    var panels = panelsOf(container);
    if (panels.length < 2) return null;
    var bar = null;

    function show(name) {
      for (var i = 0; i < panels.length; i++) {
        panels[i].hidden = (panels[i].getAttribute('data-lab-tab') !== name);
      }
      if (bar) {
        for (var j = 0; j < bar.children.length; j++) {
          var btn = bar.children[j];
          btn.setAttribute('aria-selected',
            btn.getAttribute('data-tab') === name ? 'true' : 'false');
        }
      }
    }

    function build() {
      if (!bar) {
        bar = document.createElement('div');
        bar.className = 'lab-tabs-bar';
        panels.forEach(function (p) {
          var name = p.getAttribute('data-lab-tab');
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'lab-tab-btn';
          b.setAttribute('data-tab', name);
          b.textContent = name;
          b.addEventListener('click', function () { show(name); });
          bar.appendChild(b);
        });
        container.insertBefore(bar, container.firstChild);
      }
      container.classList.add('lab-tabs-active');
      show(container.getAttribute('data-lab-tab-default') ||
           panels[0].getAttribute('data-lab-tab'));
    }

    function teardown() {
      container.classList.remove('lab-tabs-active');
      if (bar) { bar.parentNode.removeChild(bar); bar = null; }
      panels.forEach(function (p) { p.hidden = false; });
    }

    function apply() { if (MQ.matches) build(); else teardown(); }

    var api = { apply: apply, show: show };
    container.__labTabs = api;
    apply();
    return api;
  }

  function initAll() {
    var containers = document.querySelectorAll('[data-lab-tabs]');
    for (var i = 0; i < containers.length; i++) setup(containers[i]);
  }
  function reapplyAll() {
    var containers = document.querySelectorAll('[data-lab-tabs]');
    for (var i = 0; i < containers.length; i++) {
      if (containers[i].__labTabs) containers[i].__labTabs.apply();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll, { once: true });
  } else {
    initAll();
  }
  if (MQ.addEventListener) MQ.addEventListener('change', reapplyAll);
  else if (MQ.addListener) MQ.addListener(reapplyAll);

  window.LabTabs = {
    init: initAll,
    show: function (container, name) {
      var api = container && (container.__labTabs || setup(container));
      if (api) api.show(name);
    }
  };
})();
