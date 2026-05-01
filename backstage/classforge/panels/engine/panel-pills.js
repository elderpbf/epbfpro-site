// engine/panel-pills.js
//
// Reusable bottom bar for panels and tools. One or more pills (stepper /
// future kinds) sit centered at the bottom, hidden until the user hovers
// the bottom 16px of the host. Any panel/tool that needs a control like
// zoom, font-size, brightness, etc. can opt in via attachPanelPills.
// The bar's host MUST be position:relative (or absolute) so the bar
// anchors to it; the helper does not modify the host.
//
// Theming follows the existing tokenizer-embed pill: --pn-surface-2 bg,
// --pn-border border, --pn-text label, --pn-accent hover. Class names
// are namespaced under pn-panel-pills.

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

  // Show / hide
  let hideTimer = null;
  function show() {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    bar.classList.add('is-visible');
  }
  function hide() {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { bar.classList.remove('is-visible'); hideTimer = null; }, HIDE_GRACE_MS);
  }

  zone.addEventListener('mouseenter', show);
  bar.addEventListener('mouseenter', show);
  zone.addEventListener('mouseleave', hide);
  bar.addEventListener('mouseleave', hide);

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
  const min   = d.min ?? -Infinity;
  const max   = d.max ?? Infinity;
  const step  = d.step ?? 1;
  let value   = d.value ?? 0;
  const fmt   = typeof d.format === 'function' ? d.format : (v) => String(v);
  const reset = (typeof d.resetTo === 'number') ? d.resetTo : null;

  const wrap = document.createElement('div');
  wrap.className = 'pn-panel-pills__pill';

  const minus = document.createElement('button');
  minus.type = 'button';
  minus.className = 'pn-panel-pills__btn';
  minus.textContent = '−';
  if (d.ariaLabelMinus) minus.setAttribute('aria-label', d.ariaLabelMinus);

  const label = document.createElement('button');
  label.type = 'button';
  label.className = 'pn-panel-pills__label';
  if (d.ariaLabelLabel) label.setAttribute('aria-label', d.ariaLabelLabel);

  const plus = document.createElement('button');
  plus.type = 'button';
  plus.className = 'pn-panel-pills__btn';
  plus.textContent = '+';
  if (d.ariaLabelPlus) plus.setAttribute('aria-label', d.ariaLabelPlus);

  function clamp(v) {
    if (v < min) return min;
    if (v > max) return max;
    // Round to avoid floating point drift on small steps
    return Math.round(v * 1e6) / 1e6;
  }

  function refresh() {
    label.textContent = fmt(value);
  }

  function setValue(v) {
    value = clamp(v);
    refresh();
    if (typeof d.onChange === 'function') d.onChange(value);
  }

  minus.addEventListener('click', () => setValue(value - step));
  plus.addEventListener('click',  () => setValue(value + step));
  label.addEventListener('click', () => {
    if (reset !== null) setValue(reset);
  });

  wrap.appendChild(minus);
  wrap.appendChild(label);
  wrap.appendChild(plus);
  refresh();
  return { el: wrap, setValue };
}
