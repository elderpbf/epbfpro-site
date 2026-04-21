// themes/default/index.js
//
// Default theme. Baseline with no token overrides; values come from
// engine/tokens.css. Other themes register a non-empty tokens object
// to override a subset of the baseline.

import { registerTheme } from '../../engine/registry.js';

registerTheme({
  id: 'default',
  kind: 'theme',
  backstageSource: 'IA Blue',
  tokens: {},
});
