// Strict-input engine: rejects wrong chars and flags opposite-hand Shift errors.

import { recordAttempt } from './skill.js';
import { LAYOUT } from './data/abnt2-layout.js';

const SHIFTED_SYMBOLS = new Set([
  '!','@','#','$','%','&','*','(',')','_','+',
  '<','>',':','?','¨','{','}','|','"'
]);

let state = null;

export function attach(config) {
  detach();
  state = {
    input: config.inputEl,
    target: '',
    lastShiftSide: null,
    handlers: {
      onKeystroke: config.onKeystroke,
      onLineComplete: config.onLineComplete,
      onWrongShift: config.onWrongShift
    }
  };
  state.input.addEventListener('keydown', onKeyDown);
  state.input.addEventListener('input', onInput);
}

export function detach() {
  if (!state) return;
  state.input.removeEventListener('keydown', onKeyDown);
  state.input.removeEventListener('input', onInput);
  state = null;
}

export function setTarget(str) {
  if (!state) return;
  state.target = str || '';
  state.input.value = '';
  state.lastShiftSide = null;
}

function onKeyDown(e) {
  if (!state) return;
  if (e.key === 'Shift') {
    state.lastShiftSide = e.location === 1 ? 'left' : (e.location === 2 ? 'right' : null);
    return;
  }
  if (e.getModifierState && !e.getModifierState('Shift')) {
    state.lastShiftSide = null;
  }
}

function onInput(e) {
  if (!state) return;
  if (e && e.inputType && e.inputType.startsWith('delete')) {
    // Delete shrinks input.value; signal app.js to repaint. No attempt recorded.
    emit('onKeystroke', { isDelete: true });
    return;
  }

  const { input, target } = state;
  const value = input.value;
  const cursor = value.length;

  if (cursor === 0) return;

  const lastChar = value[cursor - 1];
  const expectedChar = target[cursor - 1];

  if (lastChar !== expectedChar) {
    // Realistic mode: wrong char lands; user must backspace to correct.
    if (expectedChar !== undefined) recordAttempt(expectedChar, false);
    emit('onKeystroke', { expected: expectedChar, wasCorrect: false, typed: lastChar });
    return;
  }

  let wasCorrect = true;
  if (isShiftedChar(expectedChar)) {
    const symbolHand = handOf(expectedChar);
    const shiftSide = state.lastShiftSide;
    if (symbolHand && shiftSide && symbolHand === shiftSide) {
      wasCorrect = false;
      emit('onWrongShift', { char: expectedChar, symbolHand, shiftSide });
    }
  }
  recordAttempt(expectedChar, wasCorrect);
  emit('onKeystroke', { expected: expectedChar, wasCorrect, value });

  if (value === target) emit('onLineComplete', { target });
}

function emit(name, payload) {
  const h = state && state.handlers && state.handlers[name];
  if (h) h(payload);
}

function isShiftedChar(ch) {
  if (!ch) return false;
  if (ch !== ch.toLowerCase() && ch === ch.toUpperCase()) return true;
  return SHIFTED_SYMBOLS.has(ch);
}

function handOf(ch) {
  if (!ch) return null;
  if (LAYOUT[ch]) return LAYOUT[ch].hand;
  const lower = ch.toLowerCase();
  return LAYOUT[lower] ? LAYOUT[lower].hand : null;
}
