// codex/tests/error-routing.test.mjs
// Pins Elder's rule (see the js/notice.js header): every caught error reaches the
// debug pill, never a silent swallow. These content modules previously carried bare
// `.catch(() => {})` / `.catch((e) => {})` handlers that hid failures from the pill.
// A bare swallow is detected by source; a real handler logs (notice.internal/_pill)
// or carries side effects, so it never matches. This test fails if a swallow returns.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const MODULES = ['releases.js', 'slides.js', 'apostila.js'];

// .catch with an empty arrow body and no logging, e.g. `.catch(() => {})` or `.catch((e) => {})`.
const BARE_SWALLOW = /\.catch\(\s*\(\s*\w*\s*\)\s*=>\s*\{\s*\}\s*\)/;

for (const file of MODULES) {
  test(`content/${file} routes caught errors to the pill (no bare swallow)`, () => {
    const src = readFileSync(join(HERE, '..', 'content', file), 'utf8');
    assert.ok(
      !BARE_SWALLOW.test(src),
      `${file} has a bare .catch() => {} that swallows the error instead of logging it (notice.internal)`,
    );
  });
}
