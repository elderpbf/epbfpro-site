// engine/panel-pills.js
//
// Reusable hidden bottom-bar for panels and tools. Hover the bottom 24px of
// the host to reveal one or more pills centered above the viewport bottom.
// The host MUST be position:relative (or absolute) so the bar anchors to it;
// callers typically pass the slot/container element so the pill sits flush
// with the viewport bottom (anchoring to the inner tool root puts the pill
// inside any layout padding).
//
// =============================================================================
// PILL CATALOG (reusable kinds)
// =============================================================================
//
//   stepper -- "[−] value [+]" or "[←] value [→]" with optional editable label.
//     Required: { kind: 'stepper', value, onChange }
//     Optional: { min, max, step, format(v), resetTo, editable,
//                 symbolMinus, symbolPlus,
//                 ariaLabelMinus, ariaLabelPlus, ariaLabelLabel }
//
//     Visuals: default symbols '−'/'+'; override with symbolMinus/symbolPlus.
//
//     Behavior:
//       - editable=false: label is a button. Click resets to resetTo if set,
//         else calls onLabelClick if provided, else no-op.
//       - editable=true: label is an <input>. Click focuses + selects raw
//         value. Type number, Enter applies, Esc reverts.
//
// -----------------------------------------------------------------------------
//
//   actions -- a row of icon buttons. No value, no stepper. Each button
//              fires its own onClick, can show toggle state.
//     Required: { kind: 'actions', buttons: [{ icon, onClick }, ...] }
//     Per-button options:
//       - icon          -- HTML/SVG markup string for the default icon
//       - iconActive    -- alt icon when isActive() returns true
//       - ariaLabel     -- aria-label for screen readers
//       - ariaLabelActive -- alt aria-label when active
//       - isActive()    -- returns boolean; toggles .is-active class
//       - onClick(ctx)  -- ctx.refresh() re-evaluates isActive
//
//     Returned handle exposes refresh(index?) to re-evaluate toggles after
//     external state changes (e.g. video plays naturally without click).
//
// -----------------------------------------------------------------------------
//
//   select -- "← [current label] →" pill that opens a searchable dropdown.
//     Required: { kind: 'select', items: [{value, label}], onChange }
//     Optional: { value, format(item), placeholder,
//                 symbolMinus, symbolPlus }
//
//     items: [{ value, label, searchKeys? }]
//       - value       -- opaque identifier passed to onChange
//       - label       -- display text shown in the pill and dropdown
//       - searchKeys  -- extra strings added to the search index (optional)
//
//     Behavior:
//       - Clicking the center label opens a searchable dropdown above the bar.
//       - Clicking ← / → steps to prev / next item.
//       - Dropdown filters by label (accent-insensitive substring).
//       - Arrow keys (↑↓) navigate filtered list; Enter picks; Esc closes.
//       - Click outside the dropdown closes it.
//
//     Returned handle exposes setValue(value) to update the selected item
//     externally (e.g. when the iframe navigates on its own).
//
// -----------------------------------------------------------------------------
// CURRENT CONSUMERS (2026-05-01)
// -----------------------------------------------------------------------------
//   tools/tokenizer-embed   -- stepper, zoom (75-250%, resetTo 1.0)
//   tools/ai-chat           -- stepper, font size (16-40px)
//   tools/slides-embed      -- select, slide picker (← N. Title →)
//   tools/video-embed       -- actions, [restart, play/pause, loop]
//   tools/gif-embed         -- actions, [restart, play/pause]
//
// =============================================================================

const HIDE_GRACE_MS = 600;

// Strip diacritics for accent-insensitive matching (used by select pill).
function normalize(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function attachPanelPills(host, options) {
  const opts = options || {};
  const pills = Array.isArray(opts.pills) ? opts.pills : [];
  if (pills.length === 0) return { destroy() {}, update() {} };

  // Reveal zone (catches the hover at the bottom edge)
  const zone = document.createElement('div');
  zone.className = 'pn-panel-pills-zone';

  // Pill bar (collapsed by default)
  const bar = document.createElement('div');
  bar.className = 'pn-panel-pills';

  // Build one pill per descriptor
  const pillRefs = pills.map(p => buildPill(p));
  for (const ref of pillRefs) bar.appendChild(ref.el);

  // Give select pills a reference to barEl for dropdown positioning.
  // barEl is the bar element itself (built above); pass it after all pills
  // are appended so the bar exists.
  for (const ref of pillRefs) {
    if (typeof ref.setBarEl === 'function') ref.setBarEl(bar);
  }

  host.appendChild(zone);
  host.appendChild(bar);

  // Show / hide. Hide is suppressed while any pill input has focus so users
  // can finish typing (Enter applies, Esc reverts, then the bar may hide).
  let hideTimer = null;
  function show() {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    bar.classList.add('is-visible');
  }
  function hide() {
    if (bar.querySelector('input:focus')) return;
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (bar.querySelector('input:focus')) { hideTimer = null; return; }
      bar.classList.remove('is-visible');
      hideTimer = null;
    }, HIDE_GRACE_MS);
  }

  zone.addEventListener('mouseenter', show);
  bar.addEventListener('mouseenter', show);
  zone.addEventListener('mouseleave', hide);
  bar.addEventListener('mouseleave', hide);

  // Pills with editable inputs need to trigger a hide-check on blur (cursor
  // may already be off the bar).
  bar.addEventListener('focusout', e => {
    if (e.target && e.target.matches && e.target.matches('input')) hide();
  });

  return {
    barEl: bar,
    destroy() {
      if (hideTimer) clearTimeout(hideTimer);
      for (const ref of pillRefs) {
        if (typeof ref.destroy === 'function') ref.destroy();
      }
      if (zone.parentNode) zone.remove();
      if (bar.parentNode) bar.remove();
    },
    update(index, patch) {
      const ref = pillRefs[index];
      if (!ref) return;
      if (patch && patch.value !== undefined) ref.setValue(patch.value);
    },
    refresh(index) {
      if (index === undefined) {
        for (const r of pillRefs) if (typeof r.refresh === 'function') r.refresh();
      } else {
        const r = pillRefs[index];
        if (r && typeof r.refresh === 'function') r.refresh();
      }
    },
  };
}

function buildPill(descriptor) {
  if (descriptor && descriptor.kind === 'stepper') return buildStepperPill(descriptor);
  if (descriptor && descriptor.kind === 'actions') return buildActionsPill(descriptor);
  if (descriptor && descriptor.kind === 'select')  return buildSelectPill(descriptor);
  return { el: document.createElement('span'), setValue() {} };
}

function buildStepperPill(d) {
  const min       = d.min ?? -Infinity;
  const max       = d.max ?? Infinity;
  const step      = d.step ?? 1;
  let   value     = d.value ?? 0;
  const fmt       = typeof d.format === 'function' ? d.format : (v) => String(v);
  const reset     = (typeof d.resetTo === 'number') ? d.resetTo : null;
  const symMinus  = d.symbolMinus || '−';
  const symPlus   = d.symbolPlus  || '+';
  const editable  = !!d.editable;

  const wrap = document.createElement('div');
  wrap.className = 'pn-panel-pills__pill';

  const minus = document.createElement('button');
  minus.type = 'button';
  minus.className = 'pn-panel-pills__btn';
  minus.textContent = symMinus;
  if (d.ariaLabelMinus) minus.setAttribute('aria-label', d.ariaLabelMinus);

  let label;
  if (editable) {
    label = document.createElement('input');
    label.type = 'text';
    label.className = 'pn-panel-pills__input';
    label.spellcheck = false;
    label.autocomplete = 'off';
    if (d.ariaLabelLabel) label.setAttribute('aria-label', d.ariaLabelLabel);
  } else {
    label = document.createElement('button');
    label.type = 'button';
    label.className = 'pn-panel-pills__label';
    if (d.ariaLabelLabel) label.setAttribute('aria-label', d.ariaLabelLabel);
  }

  const plus = document.createElement('button');
  plus.type = 'button';
  plus.className = 'pn-panel-pills__btn';
  plus.textContent = symPlus;
  if (d.ariaLabelPlus) plus.setAttribute('aria-label', d.ariaLabelPlus);

  function clamp(v) {
    if (v < min) return min;
    if (v > max) return max;
    // Round to avoid floating point drift on small steps
    return Math.round(v * 1e6) / 1e6;
  }

  function refresh() {
    if (editable) label.value = fmt(value);
    else          label.textContent = fmt(value);
  }

  function setValue(v) {
    value = clamp(v);
    refresh();
    if (typeof d.onChange === 'function') d.onChange(value);
  }

  minus.addEventListener('click', () => setValue(value - step));
  plus.addEventListener('click',  () => setValue(value + step));

  if (editable) {
    label.addEventListener('focus', () => {
      // Show raw number for easy retyping
      label.value = String(value);
      label.select();
    });
    label.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const n = parseFloat(label.value);
        if (Number.isFinite(n)) setValue(n);
        else refresh();
        label.blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        refresh();
        label.blur();
      }
    });
    label.addEventListener('blur', () => {
      // Apply if a valid number was typed; otherwise revert to formatted
      const n = parseFloat(label.value);
      if (Number.isFinite(n) && clamp(n) === n && n !== value) {
        setValue(n);
      } else {
        refresh();
      }
    });
  } else {
    label.addEventListener('click', () => {
      if (typeof d.onLabelClick === 'function') {
        d.onLabelClick(value);
        return;
      }
      if (reset !== null) setValue(reset);
    });
  }

  wrap.appendChild(minus);
  wrap.appendChild(label);
  wrap.appendChild(plus);
  refresh();
  return { el: wrap, setValue };
}

function buildActionsPill(d) {
  const wrap = document.createElement('div');
  wrap.className = 'pn-panel-pills__pill';

  const buttons = (Array.isArray(d.buttons) ? d.buttons : []).map(b => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pn-panel-pills__btn pn-panel-pills__btn--icon';
    btn.innerHTML = b.icon || '';
    if (b.ariaLabel) btn.setAttribute('aria-label', b.ariaLabel);

    function refresh() {
      if (typeof b.isActive !== 'function') return;
      const active = !!b.isActive();
      btn.classList.toggle('is-active', active);
      if (b.iconActive) btn.innerHTML = active ? b.iconActive : (b.icon || '');
      if (b.ariaLabelActive) btn.setAttribute('aria-label', active ? b.ariaLabelActive : (b.ariaLabel || ''));
    }

    btn.addEventListener('click', () => {
      if (typeof b.onClick === 'function') b.onClick({ refresh });
      refresh();
    });

    refresh();
    wrap.appendChild(btn);
    return { btn, refresh };
  });

  return {
    el: wrap,
    setValue() { /* no-op for actions */ },
    refresh() { for (const b of buttons) b.refresh(); },
  };
}

function buildSelectPill(d) {
  const items      = Array.isArray(d.items) ? d.items : [];
  const fmt        = typeof d.format === 'function' ? d.format : (item) => item.label;
  const symMinus   = d.symbolMinus || '←';
  const symPlus    = d.symbolPlus  || '→';
  const placeholder = d.placeholder || 'Buscar...';

  // Find current item index by value
  let currentIdx = Math.max(0, items.findIndex(it => it.value === d.value));

  // Build search index: label + optional searchKeys
  const searchIndex = items.map(it => {
    const base = normalize(it.label || '');
    const extra = Array.isArray(it.searchKeys) ? it.searchKeys.map(normalize).join(' ') : '';
    return extra ? base + ' ' + extra : base;
  });

  const wrap = document.createElement('div');
  wrap.className = 'pn-panel-pills__pill';

  const minus = document.createElement('button');
  minus.type = 'button';
  minus.className = 'pn-panel-pills__btn';
  minus.textContent = symMinus;
  minus.setAttribute('aria-label', 'Item anterior');

  const labelBtn = document.createElement('button');
  labelBtn.type = 'button';
  labelBtn.className = 'pn-panel-pills__label';
  labelBtn.setAttribute('aria-label', 'Abrir lista');

  const plus = document.createElement('button');
  plus.type = 'button';
  plus.className = 'pn-panel-pills__btn';
  plus.textContent = symPlus;
  plus.setAttribute('aria-label', 'Próximo item');

  function refreshLabel() {
    const item = items[currentIdx];
    labelBtn.textContent = item ? fmt(item) : '';
  }

  let openDropdown = null;

  function closeDropdown() {
    if (openDropdown) {
      openDropdown.close();
      openDropdown = null;
    }
  }

  function openSelectDropdown(barEl) {
    if (openDropdown) { closeDropdown(); return; }

    const dialog = document.createElement('dialog');
    dialog.className = 'pn-pill-select-dropdown';
    dialog.setAttribute('aria-label', 'Selecionar item');

    const search = document.createElement('input');
    search.type = 'text';
    search.className = 'pn-pill-select-search';
    search.placeholder = placeholder;
    search.spellcheck = false;
    search.autocomplete = 'off';
    dialog.appendChild(search);

    const list = document.createElement('ul');
    list.className = 'pn-pill-select-list';
    dialog.appendChild(list);

    // Build list items (two-span layout: key + text)
    const listItems = items.map((item, i) => {
      const li = document.createElement('li');
      li.className = 'pn-pill-select-item';
      li.setAttribute('data-index', String(i));
      li.tabIndex = -1;

      const keySpan = document.createElement('span');
      keySpan.className = 'pn-pill-select-item__key';
      keySpan.textContent = (i + 1) + '.';
      li.appendChild(keySpan);

      const textSpan = document.createElement('span');
      textSpan.className = 'pn-pill-select-item__text';
      textSpan.textContent = item.label || '';
      li.appendChild(textSpan);

      li.addEventListener('click', () => pickItem(i));
      list.appendChild(li);
      return { el: li, index: i };
    });

    let highlighted = currentIdx;
    let visibleIndices = listItems.map(it => it.index);

    function setHighlight(idx) {
      if (idx == null) return;
      listItems.forEach(it => it.el.classList.toggle('is-active', it.index === idx));
      const item = listItems[idx];
      if (item && !item.el.classList.contains('is-hidden')) {
        item.el.scrollIntoView({ block: 'nearest' });
      }
      highlighted = idx;
    }

    function applyFilter(query) {
      const q = normalize(query);
      visibleIndices = [];
      for (const it of listItems) {
        const match = !q || searchIndex[it.index].includes(q);
        it.el.classList.toggle('is-hidden', !match);
        if (match) visibleIndices.push(it.index);
      }
      if (visibleIndices.length === 0) { highlighted = null; return; }
      if (highlighted == null || !visibleIndices.includes(highlighted)) {
        setHighlight(visibleIndices[0]);
      } else {
        setHighlight(highlighted);
      }
    }

    function moveHighlight(delta) {
      if (visibleIndices.length === 0) return;
      let pos = visibleIndices.indexOf(highlighted);
      if (pos === -1) pos = 0;
      pos = (pos + delta + visibleIndices.length) % visibleIndices.length;
      setHighlight(visibleIndices[pos]);
    }

    function pickItem(idx) {
      closeDropdown();
      setValue(items[idx].value);
    }

    function close() {
      if (dialog.open) dialog.close();
      if (dialog.parentNode) dialog.remove();
      openDropdown = null;
    }

    search.addEventListener('input', () => applyFilter(search.value.trim()));
    search.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown')   { e.preventDefault(); moveHighlight(+1); }
      else if (e.key === 'ArrowUp')   { e.preventDefault(); moveHighlight(-1); }
      else if (e.key === 'Enter')     { e.preventDefault(); if (highlighted != null) pickItem(highlighted); }
      else if (e.key === 'Escape')    { e.preventDefault(); close(); }
    });

    // showModal() fires 'cancel' natively on Esc -- run our full cleanup.
    dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });

    // showModal() adds a transparent backdrop that covers the page.
    // Clicks on the backdrop bubble up with e.target === dialog.
    dialog.addEventListener('click', e => {
      if (e.target === dialog) close();
    });

    // Position: fixed, bottom of dropdown aligns to top of pill bar.
    // Belt-and-braces: explicitly null out top/right at the inline level so
    // even if a UA stylesheet's specificity beats our class rule's `inset:auto`,
    // our inline reset still wins.
    function positionDialog() {
      const rect = barEl.getBoundingClientRect();
      const dialogWidth = Math.min(640, window.innerWidth - 48);
      let left = rect.left + (rect.width / 2) - (dialogWidth / 2);
      left = Math.max(24, Math.min(left, window.innerWidth - dialogWidth - 24));
      dialog.style.left = left + 'px';
      dialog.style.bottom = (window.innerHeight - rect.top) + 'px';
      dialog.style.width = dialogWidth + 'px';
      dialog.style.top = 'auto';
      dialog.style.right = 'auto';
    }

    setHighlight(currentIdx);
    document.body.appendChild(dialog);
    positionDialog();
    dialog.showModal();
    requestAnimationFrame(() => search.focus());

    openDropdown = { close };
  }

  function setValue(value) {
    const idx = items.findIndex(it => it.value === value);
    if (idx !== -1) currentIdx = idx;
    refreshLabel();
    if (typeof d.onChange === 'function') d.onChange(value);
  }

  // Pill bar must be accessible; label click is wired after attachPanelPills
  // returns barEl. We capture barEl via a closure set from outside.
  let _barEl = null;

  minus.addEventListener('click', () => {
    if (items.length === 0) return;
    const nextIdx = (currentIdx - 1 + items.length) % items.length;
    setValue(items[nextIdx].value);
  });

  plus.addEventListener('click', () => {
    if (items.length === 0) return;
    const nextIdx = (currentIdx + 1) % items.length;
    setValue(items[nextIdx].value);
  });

  labelBtn.addEventListener('click', () => {
    openSelectDropdown(_barEl || wrap.closest('.pn-panel-pills') || document.body);
  });

  wrap.appendChild(minus);
  wrap.appendChild(labelBtn);
  wrap.appendChild(plus);
  refreshLabel();

  return {
    el: wrap,
    setValue,
    setBarEl(el) { _barEl = el; },
    destroy() { closeDropdown(); },
  };
}
