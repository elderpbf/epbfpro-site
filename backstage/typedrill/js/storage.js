// Thin wrapper over localStorage keyed by TypeDrill constants.

export const KEYS = {
  skill: 'td_skill_v1'
};

export function readJSON(key) {
  console.debug('stub: storage.readJSON', key);
  return null;
}

export function writeJSON(key, obj) {
  console.debug('stub: storage.writeJSON', key, obj);
}
