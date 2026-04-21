// ABNT2 key -> {hand, finger, anchor} map.
// Hand matches the hand that owns the key on a standard 10-finger layout.
// Anchor is the home-row key that finger rests on.

export const LAYOUT = {
  // Home row
  'a': { hand: 'left',  finger: 'pinky',  anchor: 'a' },
  's': { hand: 'left',  finger: 'ring',   anchor: 's' },
  'd': { hand: 'left',  finger: 'middle', anchor: 'd' },
  'f': { hand: 'left',  finger: 'index',  anchor: 'f' },
  'g': { hand: 'left',  finger: 'index',  anchor: 'f' },
  'h': { hand: 'right', finger: 'index',  anchor: 'j' },
  'j': { hand: 'right', finger: 'index',  anchor: 'j' },
  'k': { hand: 'right', finger: 'middle', anchor: 'k' },
  'l': { hand: 'right', finger: 'ring',   anchor: 'l' },
  'ç': { hand: 'right', finger: 'pinky',  anchor: 'ç' },

  // Top letter row
  'q': { hand: 'left',  finger: 'pinky',  anchor: 'a' },
  'w': { hand: 'left',  finger: 'ring',   anchor: 's' },
  'e': { hand: 'left',  finger: 'middle', anchor: 'd' },
  'r': { hand: 'left',  finger: 'index',  anchor: 'f' },
  't': { hand: 'left',  finger: 'index',  anchor: 'f' },
  'y': { hand: 'right', finger: 'index',  anchor: 'j' },
  'u': { hand: 'right', finger: 'index',  anchor: 'j' },
  'i': { hand: 'right', finger: 'middle', anchor: 'k' },
  'o': { hand: 'right', finger: 'ring',   anchor: 'l' },
  'p': { hand: 'right', finger: 'pinky',  anchor: 'ç' },

  // Bottom letter row
  'z': { hand: 'left',  finger: 'pinky',  anchor: 'a' },
  'x': { hand: 'left',  finger: 'ring',   anchor: 's' },
  'c': { hand: 'left',  finger: 'middle', anchor: 'd' },
  'v': { hand: 'left',  finger: 'index',  anchor: 'f' },
  'b': { hand: 'left',  finger: 'index',  anchor: 'f' },
  'n': { hand: 'right', finger: 'index',  anchor: 'j' },
  'm': { hand: 'right', finger: 'index',  anchor: 'j' },
  ',': { hand: 'right', finger: 'middle', anchor: 'k' },
  '.': { hand: 'right', finger: 'ring',   anchor: 'l' },
  ';': { hand: 'right', finger: 'pinky',  anchor: 'ç' },
  '/': { hand: 'right', finger: 'pinky',  anchor: 'ç' },

  // Number row (unshifted)
  '1': { hand: 'left',  finger: 'pinky',  anchor: 'a' },
  '2': { hand: 'left',  finger: 'ring',   anchor: 's' },
  '3': { hand: 'left',  finger: 'middle', anchor: 'd' },
  '4': { hand: 'left',  finger: 'index',  anchor: 'f' },
  '5': { hand: 'left',  finger: 'index',  anchor: 'f' },
  '6': { hand: 'right', finger: 'index',  anchor: 'j' },
  '7': { hand: 'right', finger: 'index',  anchor: 'j' },
  '8': { hand: 'right', finger: 'middle', anchor: 'k' },
  '9': { hand: 'right', finger: 'ring',   anchor: 'l' },
  '0': { hand: 'right', finger: 'pinky',  anchor: 'ç' },
  '-': { hand: 'right', finger: 'pinky',  anchor: 'ç' },
  '=': { hand: 'right', finger: 'pinky',  anchor: 'ç' },

  // Shifted number-row symbols (same hand as base key)
  '!': { hand: 'left',  finger: 'pinky',  anchor: 'a' },
  '@': { hand: 'left',  finger: 'ring',   anchor: 's' },
  '#': { hand: 'left',  finger: 'middle', anchor: 'd' },
  '$': { hand: 'left',  finger: 'index',  anchor: 'f' },
  '%': { hand: 'left',  finger: 'index',  anchor: 'f' },
  '¨': { hand: 'right', finger: 'index',  anchor: 'j', deadKey: true },
  '&': { hand: 'right', finger: 'index',  anchor: 'j' },
  '*': { hand: 'right', finger: 'middle', anchor: 'k' },
  '(': { hand: 'right', finger: 'ring',   anchor: 'l' },
  ')': { hand: 'right', finger: 'pinky',  anchor: 'ç' },
  '_': { hand: 'right', finger: 'pinky',  anchor: 'ç' },
  '+': { hand: 'right', finger: 'pinky',  anchor: 'ç' },

  // Shifted punctuation
  '<': { hand: 'right', finger: 'middle', anchor: 'k' },
  '>': { hand: 'right', finger: 'ring',   anchor: 'l' },
  ':': { hand: 'right', finger: 'pinky',  anchor: 'ç' },
  '?': { hand: 'right', finger: 'pinky',  anchor: 'ç' }
};
