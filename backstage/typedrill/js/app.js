// TypeDrill boot. Wires all modules and hands control to the engine.

import * as state from './state.js';
import * as skill from './skill.js';
import * as engine from './engine.js';
import * as renderer from './renderer.js';
import * as stats from './stats.js';
import * as storage from './storage.js';
import * as sounds from './sounds.js';

import * as symbolsSource from './sources/symbols.js';
import * as commonSource from './sources/common.js';
import * as customSource from './sources/custom.js';
import * as weaknessSource from './sources/weakness.js';
import * as aiSource from './sources/ai.js';
import * as guidedSource from './sources/guided.js';
import * as numbersSource from './sources/numbers.js';

import { WORDS } from './data/pt-br-1000.js';
import { LAYOUT } from './data/abnt2-layout.js';
import { SYMBOLS } from './data/abnt2-symbols.js';

// Auth guard (provided by ../js/auth.js, loaded before this module).
window.BS_AUTH.guard();
window.BS_AUTH.clearPasswordInputs();

// Topbar (provided by ../js/backstage-topbar.js).
window.Topbar.init({ title: 'TypeDrill', backLink: '../' });

// Dev inspection handle. Not used by app logic.
window.__TD__ = {
  state,
  skill,
  engine,
  renderer,
  stats,
  storage,
  sounds,
  sources: {
    symbols: symbolsSource,
    common: commonSource,
    custom: customSource,
    weakness: weaknessSource,
    ai: aiSource,
    guided: guidedSource,
    numbers: numbersSource
  },
  data: { WORDS, LAYOUT, SYMBOLS }
};

console.debug('typedrill boot: all modules wired');
