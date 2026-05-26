# PensoIA Site

## Deploy targets

- **Mocks** (`backstage/mocks/**`): always `/deploy site production` directly. Do not ask "staging or production." Reason: Elder reviews mocks at `pensoia.com/backstage/mocks/...` (the production URL). Staging review adds friction with no benefit because mocks are iteration artifacts, not customer surfaces.
- **Main site / app code** (`index.html`, app shells, anything users see): keep the normal `staging -> review -> production` flow; see `.ai/development-flow.md`.

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
