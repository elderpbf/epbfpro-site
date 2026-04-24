// Thin wrapper over localStorage keyed by TypeDrill constants.

export const KEYS = {
  skill: 'td_skill_v1'
};

export function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn('storage.readJSON failed for', key, e);
    return null;
  }
}

export function writeJSON(key, obj) {
  try {
    localStorage.setItem(key, JSON.stringify(obj));
  } catch (e) {
    console.warn('storage.writeJSON failed for', key, e);
  }
}
