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
//     Visuals:
//       - default symbols are '−' and '+' (used by zoom and font-size pills)
//       - override with symbolMinus/symbolPlus (e.g. '←' / '→' for slide nav)
//
//     Behavior:
//       - editable=false (default): label is a button. Click resets to
//         resetTo if provided, else no-op. Used by tokenizer (zoom reset).
//       - editable=true: label is an <input>. Click focuses + selects raw
//         value. Type a number, Enter applies (clamped to [min,max]),
//         Esc reverts. Bar stays visible while input has focus.
//
// -----------------------------------------------------------------------------
// CURRENT CONSUMERS (2026-05-01)
// -----------------------------------------------------------------------------
//   tools/tokenizer-embed   -- stepper, zoom (75-250%, resetTo 1.0)
//   tools/ai-chat           -- stepper, font size (16-40px)
//   tools/slides-embed      -- stepper, slide nav (1..N, ← →, editable)
//
// =============================================================================

const HIDE_GRACE_MS = 600;

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
    destroy() {
      if (hideTimer) clearTimeout(hideTimer);
      if (zone.parentNode) zone.remove();
      if (bar.parentNode) bar.remove();
    },
    update(index, patch) {
      const ref = pillRefs[index];
      if (!ref) return;
      if (patch && typeof patch.value === 'number') ref.setValue(patch.value);
    },
  };
}

function buildPill(descriptor) {
  if (descriptor && descriptor.kind === 'stepper') return buildStepperPill(descriptor);
  // Future: 'toggle', 'select', 'button', etc.
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
      if (reset !== null) setValue(reset);
    });
  }

  wrap.appendChild(minus);
  wrap.appendChild(label);
  wrap.appendChild(plus);
  refresh();
  return { el: wrap, setValue };
}
