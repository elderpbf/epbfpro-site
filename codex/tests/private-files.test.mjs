// Nothing that is not a web asset may be downloadable from this site.
//
// This is the guard that makes functions/_middleware.js a RULE rather than a fix. On 2026-08-11
// the whole test suite and the engineering notes were answering 200 on pensoia.com, because
// `.assetsignore` is a Workers Assets feature and this is a Pages project, which ignores it. The
// protection was believed to exist and never did, and nothing failed while that was true.
//
// So the test does not check a list of known-bad paths. It WALKS THE REPOSITORY and asserts that
// every tracked file which is not a web asset is covered by the pattern. A doc or a test added
// next year is covered on the day it lands, with nobody remembering this file exists, which is
// exactly what Élder asked for ("not the ones affected now, but all future ones").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isPrivatePath, PRIVATE_PATH } from '../../functions/_middleware.js';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n').map((s) => s.trim()).filter(Boolean);

// What a browser is legitimately allowed to fetch from here. `.txt` is in the list because
// robots.txt is one, and the middleware's own exception list is what keeps the private .txt files
// out; that exception is asserted below.
const WEB_ASSET = /\.(html|css|js|mjs|json|svg|png|jpe?g|gif|webp|ico|woff2?|ttf|eot|pdf|mp[34]|webm|zip|map|webmanifest|xml|txt)$/i;

// Pages CONSUMES these at build time and never serves them: verified with curl on 2026-08-11,
// both answered with the SPA fallback rather than their contents. They are listed rather than
// pattern-matched because there are exactly two of them and they are the platform's own names.
const PAGES_CONSUMED = new Set(['_headers', '_redirects']);

test('the repository actually contains files that must never be served', () => {
  // Guards the guard: if the walk silently found nothing, every assertion below passes for the
  // wrong reason. That is how the original hole survived.
  assert.ok(tracked.length > 100, 'git ls-files returned an implausibly short list');
});

test('every tracked file that is not a web asset is blocked', () => {
  const leaked = tracked
    .filter((f) => !WEB_ASSET.test(f) || /\.(test|spec)\.(js|mjs|cjs|ts)$/i.test(f))
    .filter((f) => !PAGES_CONSUMED.has(f))
    .filter((f) => !isPrivatePath('/' + f));
  assert.deepEqual(leaked, [], 'these would be downloadable from the live site');
});

test('the files that were actually leaking on 2026-08-11 are blocked', () => {
  for (const p of [
    '/codex/CLAUDE.md',
    '/codex/tests/README.md',
    '/codex/tests/ai-spec.test.mjs',
    '/codex/questions/POLLING.md',
    '/README.md',
    '/.assetsignore',
    '/AGENTS.md',
  ]) assert.ok(isPrivatePath(p), p + ' must 404');
});

test('the website itself still works', () => {
  // The failure mode of a pattern like this is not that it misses something, it is that it eats
  // the site. Every one of these is a real path this project serves.
  for (const p of [
    '/', '/index.html', '/codex/', '/codex/index.html',
    '/codex/js/item-list.js', '/codex/content/item-form.js', '/codex/css/codex.css',
    '/codex/js/vendor/fflate.min.js', '/trilha/entrar.html', '/codex/trilha/icons/glyph.svg',
    '/favicon.ico', '/robots.txt',
    // a substring match would kill these, and each one is a real trap:
    '/codex/js/text-search.js',           // "test" lives inside "text-search"
    '/codex/js/markdown-render.js',       // ".md" lives inside "markdown"
    '/codex/content/slides/js/app.js',
  ]) assert.equal(isPrivatePath(p), false, p + ' must still be served');
});

test('the pattern is anchored, so a name is never matched as a substring', () => {
  assert.equal(isPrivatePath('/js/latest.js'), false, '"test" inside a word is not a test file');
  assert.equal(isPrivatePath('/img/protests.png'), false);
  assert.ok(isPrivatePath('/codex/tests/anything.mjs'), 'but the tests DIRECTORY is blocked whole');
  assert.ok(PRIVATE_PATH.test('/whatever/NEW-DOC.md'), 'and a doc nobody has written yet');
});
