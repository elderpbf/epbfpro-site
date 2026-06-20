// js/resizable.js
// A draggable vertical divider that resizes the FIRST column of a 2-column CSS grid.
// It writes the width to a CSS custom property (--cdx-rz-w) on the grid element and
// remembers it in localStorage, so the divider stays where the user left it across
// reloads. The grip is absolutely positioned over the column gap, so the grid template
// (and its responsive collapse to 1fr on phones) stays declared in CSS, untouched.
//
// Shared by the Cohorts panes (clientes/turmas | dossiê) and the Liberações/Tarefas
// split (lista | painel). One mechanism, three consumers, no duplicated drag code.

// Pure clamp, exported for tests.
export function clampWidth(x, min, max) {
  const n = Math.round(Number(x) || 0);
  return Math.max(min, Math.min(max, n));
}

export function installResizer(gridEl, opts = {}) {
  if (!gridEl || gridEl.__cdxRz) return () => {};
  const { storeKey = null, defaultPx = 300, min = 180, max = 640 } = opts;

  let w = defaultPx;
  try {
    const saved = storeKey && localStorage.getItem(storeKey);
    if (saved) { const n = parseInt(saved, 10); if (n) w = n; }
  } catch (_) { /* private mode: just use the default */ }
  w = clampWidth(w, min, max);

  const apply = () => gridEl.style.setProperty('--cdx-rz-w', w + 'px');
  apply();

  const grip = document.createElement('div');
  grip.className = 'cdx-rz-grip';
  grip.setAttribute('role', 'separator');
  grip.setAttribute('aria-orientation', 'vertical');
  grip.title = 'Arraste para redimensionar';
  grip.innerHTML = '<i></i>';
  gridEl.appendChild(grip);
  gridEl.__cdxRz = true;

  // Window listeners live ONLY during an active drag, so re-mounting a consumer (the
  // Liberações/Tarefas tabs re-mount on every dossiê open) never leaks listeners.
  const move = (e) => {
    const x = e.clientX - gridEl.getBoundingClientRect().left;
    w = clampWidth(x, min, max);
    apply();
  };
  const up = () => {
    grip.classList.remove('is-drag');
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', up);
    try { if (storeKey) localStorage.setItem(storeKey, String(w)); } catch (_) { /* ignore */ }
  };
  const down = (e) => {
    grip.classList.add('is-drag');
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    e.preventDefault();
  };
  grip.addEventListener('mousedown', down);

  return () => {
    grip.remove();
    gridEl.__cdxRz = false;
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', up);
  };
}
