# PensoIA Site

## Deploy targets

- **Mocks** (`backstage/mocks/**`): always deploy to production directly via the **`production-mock`** path (`/deploy site production-mock`). Do not ask "staging or production." Reason: Elder reviews mocks at `pensoia.com/backstage/mocks/...` (the production URL). Staging review adds friction with no benefit because mocks are iteration artifacts, not customer surfaces. **Never use the plain `production` deploy for a mock change** — its full `dev -> master` merge ships every pending `dev` commit (Slides/Codex/portal work) to live. The `production-mock` env cherry-picks only `backstage/mocks/**`. (Learned 2026-06-04 the hard way.)
- **Main site / app code** (`index.html`, app shells, anything users see): keep the normal `staging -> review -> production` flow; see `.ai/development-flow.md`.

## Mocks lifecycle

**Never delete a mock — archive it.** Mocks are kept as historical reference even when superseded or useless. To retire a mock, MOVE it into an `archive/` subfolder, never `git rm`:
- A mock already under `backstage/mocks/...` moves to the nearest `archive/` (e.g. `backstage/mocks/archive/`, or `backstage/mocks/brand/archive/` for brand mocks).
- A mock that lives inside a specific project folder relocates to the archive inside the central mocks folder (`backstage/mocks/archive/`).

The gallery (`backstage/mocks/index.html`) keeps listing archived mocks under their `archive/` path; mocks it doesn't list just move. Archiving is a `backstage/mocks/**` change, so it still deploys to production per the Deploy-targets rule above.

## Cache busting

Increment `?v=X.X` on CSS/JS files in `index.html` when pushing changes. Inline-script mocks (e.g. self-contained `backstage/mocks/brand/*.html`) don't need version bumps; the HTML itself isn't aggressively cached.

**Favicon versioning:** All `favicon.svg` link tags must include a `?v=N` query string (e.g. `href="/favicon.svg?v=1"`). Browser favicon cache is aggressive and ignores normal hard-refresh. When the SVG changes, increment the version number across all HTML files. The `.ico` and `.png` variants don't need versioning (they are legacy fallbacks and rarely change).

## Hostinger deploy divergence fix

When deploy fails with "Need to specify how to reconcile divergent branches" (Hostinger's `git pull` can't fast-forward):

1. Hostinger panel > Advanced > SSH Access > Enable SSH
2. `ssh -p 65002 u769092021@82.25.73.216` (password does NOT echo -- type blind, press Enter)
3. Then:
   ```bash
   cd ~/domains/pensoia.com/public_html/staging   # or public_html for production
   git fetch origin dev                            # or master for production
   git reset --hard origin/dev
   ```
4. Hostinger panel "Deploy" works normally again after this.

**Why it happens:** Hostinger sometimes auto-commits local files (.htaccess, generated assets), causing divergence the `git pull` can't resolve.

**CDN cache:** Hostinger caches JS/CSS with `max-age=604800` (7 days). `backstage/.htaccess` reduces this to 1 hour. If files are still stale after deploy, rename the file to bust CDN cache.
