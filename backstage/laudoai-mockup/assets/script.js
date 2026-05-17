// LaudoAI mockup — interactivity (vanilla JS, no deps)

(function () {
  'use strict';

  // ----- Sidebar nav: highlight current page -----
  const path = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  document.querySelectorAll('.nav-link').forEach((a) => {
    const href = (a.getAttribute('href') || '').toLowerCase();
    if (href === path || (path === '' && href === 'index.html')) {
      a.classList.add('active');
    }
  });

  // ----- assinar.html: simulated ICP-Brasil signing -----
  const waiting = document.getElementById('signing-waiting');
  const signed  = document.getElementById('signing-signed');
  if (waiting && signed) {
    setTimeout(() => {
      waiting.classList.add('hidden');
      signed.classList.remove('hidden');
    }, 3000);
  }

  // ----- planos.html: Mensal <-> Anual toggle -----
  const togglePill = document.querySelector('[data-pricing-toggle]');
  if (togglePill) {
    const btns = togglePill.querySelectorAll('button');
    btns.forEach((btn) => {
      btn.addEventListener('click', () => {
        btns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = btn.getAttribute('data-mode'); // 'anual' or 'mensal'
        document.querySelectorAll('[data-price-anual]').forEach((el) => {
          el.classList.toggle('hidden', mode !== 'anual');
        });
        document.querySelectorAll('[data-price-mensal]').forEach((el) => {
          el.classList.toggle('hidden', mode !== 'mensal');
        });
      });
    });
  }

  // ----- assinar.html: ditada <-> final toggle (cosmetic) -----
  const versionToggle = document.querySelector('[data-version-toggle]');
  if (versionToggle) {
    const btns = versionToggle.querySelectorAll('button');
    btns.forEach((btn) => {
      btn.addEventListener('click', () => {
        btns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = btn.getAttribute('data-mode');
        document.querySelectorAll('.ai-highlight').forEach((el) => {
          el.style.background = mode === 'ditada' ? 'transparent' : '';
        });
      });
    });
  }

  // ----- assinar.html: expandable AI inferences list -----
  const inferenceToggle = document.getElementById('inference-toggle');
  const inferenceList   = document.getElementById('inference-list');
  if (inferenceToggle && inferenceList) {
    inferenceToggle.addEventListener('click', () => {
      const open = !inferenceList.classList.contains('hidden');
      inferenceList.classList.toggle('hidden', open);
      const chev = inferenceToggle.querySelector('.chev');
      if (chev) chev.style.transform = open ? 'rotate(0deg)' : 'rotate(180deg)';
    });
  }
})();
