// TypeDrill source plug-in registry. Each entry exposes `generate` and
// optionally `renderOptions`. MVP registers symbols / common / custom.

import * as symbols from './sources/symbols.js';
import * as common from './sources/common.js';
import * as custom from './sources/custom.js';

const registry = new Map();

export function register(entry) {
  if (!entry || !entry.id) return;
  registry.set(entry.id, entry);
}

export function get(id) {
  return registry.get(id) || null;
}

export function list() {
  return Array.from(registry.values());
}

register({
  id: 'symbols',
  label: 'Símbolos',
  generate: symbols.generate,
  renderOptions: symbols.renderOptions,
  defaults: { level: 1, symbolChar: '%' }
});

register({
  id: 'common',
  label: 'Palavras',
  generate: common.generate,
  renderOptions: null,
  defaults: {}
});

register({
  id: 'custom',
  label: 'Texto',
  generate: custom.generate,
  renderOptions: custom.renderOptions,
  defaults: { text: '', stripPunct: false, lowercase: false, shuffleWords: false }
});
