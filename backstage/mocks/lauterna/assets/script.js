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

  // ----- editor-com-ai.html: accept/reject AI suggestion pills -----
  document.querySelectorAll('[data-ai-accept]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const container = btn.closest('[data-ai-suggestion]');
      if (!container) return;
      const anchor = container.querySelector('.ai-anchor');
      if (anchor) {
        anchor.style.background = '#d1fae5';
        anchor.style.borderBottom = 'none';
      }
      container.querySelector('.ai-actions')?.remove();
      container.querySelector('[data-ai-popover]')?.remove();
    });
  });

  document.querySelectorAll('[data-ai-reject]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const container = btn.closest('[data-ai-suggestion]');
      if (!container) return;
      const anchor = container.querySelector('.ai-anchor');
      if (anchor) {
        anchor.style.background = 'transparent';
        anchor.style.borderBottom = 'none';
      }
      container.querySelector('.ai-actions')?.remove();
      container.querySelector('[data-ai-popover]')?.remove();
    });
  });

  // editor-com-ai.html: dismiss block-level proposed paragraphs
  document.querySelectorAll('[data-ai-dismiss]').forEach((btn) => {
    btn.addEventListener('click', () => {
      btn.closest('.ai-proposed')?.remove();
    });
  });
  document.querySelectorAll('[data-ai-accept-block]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const block = btn.closest('.ai-proposed');
      if (!block) return;
      block.style.background = '#ecfdf5';
      block.style.borderLeftColor = '#10b981';
      const badge = block.querySelector('.ai-proposed-actions');
      if (badge) badge.innerHTML = '<span class="text-xs text-emerald-700 font-medium inline-flex items-center gap-1"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="w-3.5 h-3.5"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>Aceito</span>';
    });
  });

  // editor-com-ai.html: toggle popover on inline anchor
  document.querySelectorAll('[data-ai-suggestion] .ai-anchor').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
      e.stopPropagation();
      const container = anchor.closest('[data-ai-suggestion]');
      const popover = container?.querySelector('[data-ai-popover]');
      if (popover) popover.classList.toggle('hidden');
    });
  });
  document.addEventListener('click', () => {
    document.querySelectorAll('[data-ai-popover]:not(.hidden)').forEach((p) => p.classList.add('hidden'));
  });
})();
