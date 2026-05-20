# PensoIA Site

## Deploy targets

- **Mocks** (`backstage/mocks/**`): always `/deploy site production` directly. Do not ask "staging or production." Reason: Elder reviews mocks at `pensoia.com/backstage/mocks/...` (the production URL). Staging review adds friction with no benefit because mocks are iteration artifacts, not customer surfaces.
- **Main site / app code** (`index.html`, app shells, anything users see): keep the normal `staging -> review -> production` flow from the global workflow doctrine in `~/.claude/CLAUDE.md`.

## Cache busting

Increment `?v=X.X` on CSS/JS files in `index.html` when pushing changes. Inline-script mocks (e.g. self-contained `backstage/mocks/brand/*.html`) don't need version bumps; the HTML itself isn't aggressively cached.
