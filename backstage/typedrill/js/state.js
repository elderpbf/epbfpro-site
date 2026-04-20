// TypeDrill session state. Reset on source switch.
export const state = {
  symIdx: 0,
  lvl: 0,
  line: 0,
  cursor: 0,
  errors: 0
};

export function reset() {
  state.symIdx = 0;
  state.lvl = 0;
  state.line = 0;
  state.cursor = 0;
  state.errors = 0;
  console.debug('stub: state.reset');
}
