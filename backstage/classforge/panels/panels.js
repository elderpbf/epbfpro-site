// panels.js — Lightweight presentation engine (zero dependencies)
// Usage: import Panels from './panels.js'; Panels.init();

const Panels = (() => {
  let panels = [];
  let current = 0;
  let channel = null;
  let fadeTimer = null;
  let logoHideOn = [];
  let presenterUrl = './presenter.html';
  let touchStartX = 0;
  let touchStartY = 0;

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  function goTo(index) {
    if (index < 0 || index >= panels.length) return;
    panels[current].classList.remove('pn-active');
    current = index;
    panels[current].classList.add('pn-active');
    updateUI();
    broadcastState();
  }

  function next() { goTo(current + 1); }
  function prev() { goTo(current - 1); }

  // ---------------------------------------------------------------------------
  // UI (dots, counter, logo)
  // ---------------------------------------------------------------------------

  function updateUI() {
    const counter = document.querySelector('.pn-counter');
    if (counter) counter.textContent = (current + 1) + ' / ' + panels.length;

    const dots = document.querySelectorAll('.pn-dot');
    dots.forEach((d, i) => d.classList.toggle('pn-dot-active', i === current));

    const logo = document.getElementById('pn-logo');
    if (logo) logo.hidden = logoHideOn.includes(current);

    showNav();
  }

  function showNav() {
    const nav = document.querySelector('.pn-nav');
    if (!nav) return;
    nav.classList.remove('pn-nav-hidden');
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(() => nav.classList.add('pn-nav-hidden'), 2000);
  }

  function buildNav() {
    const nav = document.createElement('div');
    nav.className = 'pn-nav';

    const dots = document.createElement('div');
    dots.className = 'pn-dots';
    panels.forEach((_, i) => {
      const dot = document.createElement('span');
      dot.className = 'pn-dot' + (i === 0 ? ' pn-dot-active' : '');
      dot.addEventListener('click', (e) => { e.stopPropagation(); goTo(i); });
      dots.appendChild(dot);
    });

    const counter = document.createElement('span');
    counter.className = 'pn-counter';
    counter.textContent = '1 / ' + panels.length;

    nav.appendChild(dots);
    nav.appendChild(counter);
    document.body.appendChild(nav);
  }

  // ---------------------------------------------------------------------------
  // Overview grid
  // ---------------------------------------------------------------------------

  let overviewOpen = false;

  function openOverview() {
    overviewOpen = true;
    const ov = document.getElementById('pn-overview');
    if (ov) { ov.hidden = false; return; }

    const overview = document.createElement('div');
    overview.id = 'pn-overview';
    overview.className = 'pn-overview';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'pn-overview-close';
    closeBtn.textContent = '× Fechar (Esc)';
    closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closeOverview(); });
    overview.appendChild(closeBtn);

    panels.forEach((panel, i) => {
      const thumb = document.createElement('div');
      thumb.className = 'pn-thumb' + (i === current ? ' pn-thumb-active' : '');

      const clone = panel.cloneNode(true);
      clone.classList.remove('pn-active');
      thumb.appendChild(clone);

      const label = document.createElement('span');
      label.className = 'pn-thumb-label';
      label.textContent = (i + 1) + ' / ' + panels.length;
      thumb.appendChild(label);

      thumb.addEventListener('click', () => { closeOverview(); goTo(i); });
      overview.appendChild(thumb);
    });

    overview.addEventListener('click', (e) => { if (e.target === overview) closeOverview(); });
    document.body.appendChild(overview);
  }

  function closeOverview() {
    overviewOpen = false;
    const ov = document.getElementById('pn-overview');
    if (ov) ov.hidden = true;
  }

  // ---------------------------------------------------------------------------
  // Fullscreen
  // ---------------------------------------------------------------------------

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  // ---------------------------------------------------------------------------
  // Presenter mode (BroadcastChannel, same device only)
  // ---------------------------------------------------------------------------

  function broadcastState() {
    if (!channel) return;
    const panel = panels[current];
    const nextPanel = panels[current + 1];
    channel.postMessage({
      type: 'slide',
      index: current,
      total: panels.length,
      notes: panel.dataset.notes || '',
      panelHTML: panel.innerHTML,
      nextHTML: nextPanel ? nextPanel.innerHTML : null
    });
  }

  function openPresenter() {
    const url = new URL(presenterUrl, location.href).href;
    window.open(url, 'pn-presenter', 'width=1200,height=700');
    channel = new BroadcastChannel('panels-presenter');
    setTimeout(broadcastState, 500);
  }

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  function onKeyDown(e) {
    if (overviewOpen) {
      if (e.key === 'Escape') { closeOverview(); return; }
      return;
    }
    switch (e.key) {
      case 'ArrowRight': case 'ArrowDown': case ' ': e.preventDefault(); next(); break;
      case 'ArrowLeft':  case 'ArrowUp':             e.preventDefault(); prev(); break;
      case 'Escape': openOverview(); break;
      case 'f': case 'F': toggleFullscreen(); break;
      case 'p': case 'P': openPresenter(); break;
    }
  }

  function onClickNav(e) {
    if (overviewOpen) return;
    const x = e.clientX;
    const half = window.innerWidth / 2;
    if (x > half) next(); else prev();
    showNav();
  }

  function onTouchStart(e) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }

  function onTouchEnd(e) {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx)) return;
    if (dx < 0) next(); else prev();
  }

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------

  function init(opts) {
    opts = opts || {};
    logoHideOn = opts.logoHideOn || [];
    if (opts.presenterUrl) presenterUrl = opts.presenterUrl;

    panels = Array.from(document.querySelectorAll('.panel'));
    if (!panels.length) return;

    panels[0].classList.add('pn-active');
    buildNav();

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('click', onClickNav);
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    document.addEventListener('mousemove', showNav);

    updateUI();
  }

  return { init, goTo, next, prev };
})();

export default Panels;
