// functions/_middleware.js
// Nothing that is not a web asset is downloadable from this site.
//
// WHY THIS FILE EXISTS. On 2026-08-11 `pensoia.com/codex/CLAUDE.md`, `codex/tests/README.md`,
// `codex/questions/POLLING.md` and every one of the 200+ `*.test.mjs` files answered 200 with
// their real contents, in PRODUCTION. The whole test suite and the engineering notes were on the
// public internet.
//
// The cause is a category error, not a typo. `.assetsignore` is a **Workers Assets** feature.
// This is a **Pages** project, and Pages ignores that file completely and uploads everything in
// the deployed directory. The protection was believed to exist and never did, which is why nobody
// checked it for months.
//
// WHY A MIDDLEWARE AND NOT A LIST OF PATHS. Élder's instruction (2026-08-11): "we need to block
// access to all documentation, not the ones affected now, but all future ones". A list of
// `_redirects` rules protects the files that exist on the day someone writes the list, and
// `_redirects` cannot express "every .md" anyway (a splat may only appear at the end of a
// pattern). A PATTERN protects the file somebody adds next year without knowing this rule exists.
//
// Pages runs `functions/` BEFORE static assets and never uploads it as an asset, so this cannot
// leak itself and cannot be bypassed by the asset server.
//
// The list is deliberately an ALLOW-nothing/DENY-shape, not a deny-list of names: it matches what
// a file IS (documentation, a test, a script, config, a dotfile), so a new `ARCHITECTURE.md` or a
// new `*.test.mjs` is covered the day it lands, with nobody remembering to come back here.
// `codex/tests/private-files.test.mjs` walks the repository and fails if any tracked file that is
// not a web asset escapes this pattern.

// A path that is NOT part of the website. Anchored on the last segment or on a whole directory,
// never on a substring: `/js/markdown-render.js` must keep working.
export const PRIVATE_PATH = new RegExp([
  // documentation, in any directory
  '\\.(md|markdown|mdx|txt)$',
  // tests, in any shape this repo uses
  '\\.(test|spec)\\.(js|mjs|cjs|ts)$',
  '(^|/)(tests?|__tests__)(/|$)',
  // scripts, config and manifests
  '\\.(sh|bash|ps1|py|rb|toml|ya?ml|lock|ini|cfg|conf)$',
  '(^|/)(package(-lock)?\\.json|jsconfig\\.json|tsconfig\\.json|wrangler\\.toml)$',
  // dotfiles and dot-directories (.git, .env, .assetsignore, .github, ...)
  '(^|/)\\.[^/]+',
  // the tooling and archive trees, whole
  '(^|/)(node_modules|tools|_archive|manifest)(/|$)',
].join('|'), 'i');

// `robots.txt` is the one .txt the web genuinely asks for, and blocking it would be a new bug in
// the name of fixing this one. Same for the ACME and well-known paths a certificate check uses.
const PUBLIC_EXCEPTIONS = /^\/(robots\.txt|ads\.txt|security\.txt|\.well-known\/)/i;

export function isPrivatePath(pathname) {
  const p = String(pathname || '');
  if (PUBLIC_EXCEPTIONS.test(p)) return false;
  return PRIVATE_PATH.test(p);
}

export async function onRequest(context) {
  const { pathname } = new URL(context.request.url);
  if (isPrivatePath(pathname)) {
    // A flat 404 with no body: the point is that the file is indistinguishable from one that was
    // never there. A 403 would confirm the path exists, which is half of what was leaking.
    return new Response('Not found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
  return context.next();
}
