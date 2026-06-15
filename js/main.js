// js/main.js — boot for the PensoIA landing. The single module entry the page loads.
import { initTheme } from './theme.js';
import { apply } from './i18n.js';
import { initUI } from './ui.js';
import { initDemos } from './demos.js';
import { initOrb } from './orb.js';
import { initOrbSettings } from './orb-settings.js';

initTheme();          // set data-theme from storage
apply(document);      // fill every data-i18n / data-i18n-html
initUI();             // theme + lang + header + reveal + rotating phrase
initDemos();          // pulso + trilha animations
initOrb();            // the descending light
initOrbSettings();    // dev-only tuning panel (gated)
