// js/queue.js — the approval-queue interactions (the product's spine, made
// tangible). Client-side for now; the live-data swap (greenroom-api.queue) lands
// when the Worker actions are implemented. Approve/discard with real undo/redo,
// bulk select, and the kind filter all ship in the first port because they are
// the core operator gesture.
import { t } from './i18n.js';
import { toastK } from './toast.js';

const undoStack = [];
const redoStack = [];

function refreshCount() {
  const left = document.querySelectorAll('#qlist .qcard').length;
  document.querySelectorAll('[data-pg="caixa"] .ct').forEach((b) => {
    if (left > 0) { b.textContent = left; b.style.display = ''; }
    else { b.style.display = 'none'; }
  });
  const x = document.getElementById('gateCount');
  if (x) x.textContent = left > 0 ? t('gate_n').replace('{n}', left) : t('gate_empty');
  const e = document.getElementById('qEmpty');
  if (e) e.classList.toggle('on', left === 0);
}
export { refreshCount };

function bulk() {
  const n = document.querySelectorAll('#qlist .chk.on').length;
  const c = document.getElementById('bulkcount');
  if (c) c.textContent = n;
  const bar = document.getElementById('bulkbar');
  if (bar) bar.classList.toggle('on', n > 0);
}

function removeCard(id, toastKey) {
  const c = document.querySelector('.qcard[data-id="' + id + '"]');
  if (!c) return;
  const parent = c.parentNode, next = c.nextElementSibling;
  redoStack.length = 0;
  c.classList.add('go');
  setTimeout(() => { parent.removeChild(c); undoStack.push({ node: c, parent, next }); refreshCount(); bulk(); }, 260);
  toastK(toastKey);
}

function undo() {
  if (!undoStack.length) { toastK('undo_none'); return; }
  const it = undoStack.pop();
  it.node.classList.remove('go');
  if (it.next && it.next.parentNode === it.parent) it.parent.insertBefore(it.node, it.next);
  else it.parent.appendChild(it.node);
  redoStack.push(it); refreshCount(); bulk(); toastK('undone');
}

function redo() {
  if (!redoStack.length) { toastK('redo_none'); return; }
  const it = redoStack.pop(), c = it.node;
  c.classList.add('go');
  setTimeout(() => { if (c.parentNode) c.parentNode.removeChild(c); undoStack.push(it); refreshCount(); bulk(); }, 260);
  toastK('redone');
}

function editDraft(card) {
  const d = card && card.querySelector('.ai .draft');
  if (!d) return;
  d.setAttribute('contenteditable', 'true');
  d.classList.add('editing');
  d.focus();
  toastK('edit_draft');
}

function bulkDo() {
  document.querySelectorAll('#qlist .chk.on').forEach((chk) => {
    const card = chk.closest('.qcard');
    if (card) { card.classList.add('go'); setTimeout(() => { card.remove(); refreshCount(); }, 260); }
  });
  bulkClear();
  toastK('batch');
}

function bulkClear() {
  document.querySelectorAll('#qlist .chk.on').forEach((c) => c.classList.remove('on'));
  bulk();
}

export function initQueue() {
  // Card + bulk actions (delegated; replaces the mock's inline onclick).
  document.addEventListener('click', (e) => {
    const act = e.target.closest('#qlist [data-act], #bulkbar [data-act]');
    if (!act) return;
    const kind = act.getAttribute('data-act');
    const card = act.closest('.qcard');
    const id = card && card.getAttribute('data-id');
    if (kind === 'approve') removeCard(id, 'done');
    else if (kind === 'discard') removeCard(id, 'discarded');
    else if (kind === 'edit') editDraft(card);
    else if (kind === 'check') { act.classList.toggle('on'); bulk(); }
    else if (kind === 'bulk-approve' || kind === 'bulk-discard') bulkDo();
    else if (kind === 'bulk-clear') bulkClear();
  });

  // Keyboard: Ctrl/Cmd+Z undo, Ctrl/Cmd+Y (or Shift+Z) redo — not while editing.
  document.addEventListener('keydown', (e) => {
    if (e.target.isContentEditable || /^(input|textarea|select)$/i.test(e.target.tagName)) return;
    const k = (e.key || '').toLowerCase();
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && k === 'z') { e.preventDefault(); undo(); }
    else if ((e.ctrlKey || e.metaKey) && (k === 'y' || (e.shiftKey && k === 'z'))) { e.preventDefault(); redo(); }
  });

  // Kind filter chips (Tudo / Respostas / Menções / Posts / Marcações). The
  // active-chip styling is handled generically in compose.js; this filters.
  const chips = document.getElementById('filaChips');
  if (chips) chips.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => {
    const f = c.getAttribute('data-filter');
    document.querySelectorAll('#qlist .qcard').forEach((card) => {
      card.style.display = (f === 'all' || card.getAttribute('data-kind') === f) ? '' : 'none';
    });
  }));

  refreshCount();
}
