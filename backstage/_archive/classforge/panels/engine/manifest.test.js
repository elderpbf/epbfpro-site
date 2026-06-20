// engine/manifest.test.js
//
// Phase 2G acceptance test for validateManifest. Verifies:
//   - a valid full manifest triggers zero warnings
//   - missing id triggers exactly one warning
//   - empty panels array triggers exactly one warning
//   - unknown top-level key triggers exactly one warning
//   - unknown per-panel key triggers exactly one warning
//
// Run: node Site/backstage/classforge/panels/engine/manifest.test.js

import { strict as assert } from 'node:assert';
import { validateManifest } from './runtime.js';

function captureWarnings(fn) {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    fn();
  } finally {
    console.warn = originalWarn;
  }
  return warnings;
}

// Test 1: valid full manifest triggers zero warnings
{
  const warnings = captureWarnings(() => {
    validateManifest({
      id: 'demo',
      title: 'Demo',
      theme: 'default',
      course: 'capacitacao-ia-geral',
      author: 'ClassForge',
      language: 'pt-BR',
      description: 'A demo presentation',
      panels: [
        'panel-01.html',
        { src: 'panel-02.html', id: 'p2', title: 'Second' },
      ],
    });
  });
  assert.equal(warnings.length, 0, 'valid full manifest emits zero warnings');
  console.log('PASS  test 1: valid full manifest triggers zero warnings');
}

// Test 2: missing id triggers exactly one warning
{
  const warnings = captureWarnings(() => {
    validateManifest({
      title: 'No Id',
      panels: ['panel-01.html'],
    });
  });
  assert.equal(warnings.length, 1, 'missing id emits exactly one warning');
  assert.match(warnings[0], /missing required field: id/, 'warning mentions missing id');
  console.log('PASS  test 2: missing id triggers exactly one warning');
}

// Test 3: empty panels array triggers exactly one warning
{
  const warnings = captureWarnings(() => {
    validateManifest({
      id: 'demo',
      panels: [],
    });
  });
  assert.equal(warnings.length, 1, 'empty panels emits exactly one warning');
  assert.match(warnings[0], /panels \(non-empty array\)/, 'warning mentions non-empty array');
  console.log('PASS  test 3: empty panels array triggers exactly one warning');
}

// Test 4: unknown top-level key triggers exactly one warning
{
  const warnings = captureWarnings(() => {
    validateManifest({
      id: 'demo',
      panels: ['panel-01.html'],
      pannels: ['typo-target.html'],
    });
  });
  assert.equal(warnings.length, 1, 'unknown top-level key emits exactly one warning');
  assert.match(warnings[0], /unknown key: pannels/, 'warning names the unknown key');
  console.log('PASS  test 4: unknown top-level key triggers exactly one warning');
}

// Test 5: unknown per-panel key triggers exactly one warning
{
  const warnings = captureWarnings(() => {
    validateManifest({
      id: 'demo',
      panels: [
        { src: 'panel-01.html', sleg: 'bad' },
        'panel-02.html',
      ],
    });
  });
  assert.equal(warnings.length, 1, 'unknown per-panel key emits exactly one warning');
  assert.match(warnings[0], /panels\[0\] has unknown key: sleg/, 'warning names entry index and key');
  console.log('PASS  test 5: unknown per-panel key triggers exactly one warning');
}

// Test 6: sidebar top-level key is accepted without warning (Phase 4A schema extension)
{
  const warnings = captureWarnings(() => {
    validateManifest({
      id: 'demo',
      panels: ['panel-01.html'],
      sidebar: {
        tools: [
          { id: 'claude', label: 'Claude', kind: 'popup', url: 'https://claude.ai' },
        ],
      },
    });
  });
  assert.equal(warnings.length, 0, 'manifest with sidebar.tools emits zero warnings');
  console.log('PASS  test 6: sidebar.tools key accepted without warning');
}

console.log('\nAll manifest tests passed.');
