// js/compose.js — segmented controls + view toggles shared across surfaces:
// the Publicar media-type segment, the Caixa "Aguardando você / Tudo" segment,
// the generic chip groups, and the user-toggleable settings switches.
export function initCompose() {
  // .seg groups: a single active button. The Caixa segment also swaps panels.
  document.querySelectorAll('.seg').forEach((seg) => {
    seg.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      seg.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      if (seg.id === 'cxSeg') {
        const v = b.getAttribute('data-view');
        const p = document.getElementById('cxPending'), a = document.getElementById('cxAll');
        if (p) p.hidden = (v !== 'pending');
        if (a) a.hidden = (v !== 'all');
      }
    }));
  });

  // Generic chip groups: a single active chip (any filtering is wired by the owner).
  document.querySelectorAll('.chips').forEach((g) => {
    g.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => {
      g.querySelectorAll('.chip').forEach((x) => x.classList.remove('on'));
      c.classList.add('on');
    }));
  });

  // Settings switches the operator can flip (locked ones carry no data-act).
  document.querySelectorAll('.sw[data-act="switch"]').forEach((sw) =>
    sw.addEventListener('click', () => sw.classList.toggle('on')));
}
