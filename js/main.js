// js/main.js — boot for the PensoIA landing. The single module entry the page loads.
import { initTheme } from './theme.js?v=11';
import { apply } from './i18n.js?v=11';
import { initUI } from './ui.js?v=11';
import { initDemos } from './demos.js?v=11';
import { initOrb } from './orb.js?v=11';
import { initOrbSettings } from './orb-settings.js?v=11';

initTheme();          // set data-theme from storage
apply(document);      // fill every data-i18n / data-i18n-html
initUI();             // theme + lang + header + reveal + rotating phrase
initDemos();          // pulso + trilha animations
initOrb();            // the descending light
initOrbSettings();    // dev-only tuning panel (gated)
