// js/app.js — Greenroom boot. Loads the operator session (Backstage, same origin),
// applies i18n, and wires every module. No business logic here beyond the wiring;
// the mock's behaviour now lives in focused modules. Live data (greenroom-api) is
// swapped in per surface as the Worker actions land.
import { apply as applyI18n, toggle as toggleLang, current as curLang } from './i18n.js';
import { initNav } from './nav.js';
import { initTheme, buildMenu } from './theme.js';
import { initToast } from './toast.js';
import { initQueue, refreshCount } from './queue.js';
import { initCompose } from './compose.js';

// Operator identity comes from Backstage (same origin). Guard like the other
// apps; degrade gracefully if the shared session script is absent (isolated load).
if (window.BS_AUTH && BS_AUTH.guard) BS_AUTH.guard();
if (window.BS_AUTH && BS_AUTH.clearPasswordInputs) BS_AUTH.clearPasswordInputs();

function refreshLang() {
  applyI18n();
  const btn = document.getElementById('langBtn');
  if (btn) btn.textContent = curLang() === 'pt' ? 'EN' : 'PT';
  buildMenu();     // theme names are language-aware
  refreshCount();  // the gate text is built with t()
}

initNav();
initTheme();
initToast();
initCompose();
initQueue();

const langBtn = document.getElementById('langBtn');
if (langBtn) langBtn.addEventListener('click', () => { toggleLang(); refreshLang(); });

refreshLang(); // initial paint: fills i18n, sets the EN/PT label + <html lang>
