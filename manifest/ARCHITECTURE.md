# Architecture -- PensoIA Site

## File structure

```
Site/
├── index.html              # Single-page landing
├── css/
│   └── style.css           # All styles, CSS variables for theming
├── js/
│   ├── main.js             # ThemeManager + LanguageManager classes
│   ├── translations.js     # PT-BR and EN strings (Model)
│   └── brand.js            # ACTIVE_BRAND flag
├── images/
│   ├── logo.png, profile.jpg
│   └── icons/              # Black PNGs, CSS-filter-colorized
├── favicon.ico, favicon-16x16.png, favicon-32x32.png
├── apple-touch-icon.png
├── android-chrome-192x192.png, android-chrome-512x512.png
├── site.webmanifest        # PWA manifest (for the landing page itself)
├── README.md, MANIFEST.md
└── manifest/               # This satellite folder
```

Sub-folders (`backstage/`, `adriana/`, `go/`, `classforge/`, `classpulse/`) and the file `OneSignalSDKWorker.js` live in the same deploy tree but are **not owned by Site** -- see the respective product manifests.

## MVC separation

| Layer | Files |
|---|---|
| Model | `js/translations.js` (language strings), `js/brand.js` (brand flag) |
| View | `index.html`, `css/style.css` |
| Controller | `js/main.js` -- `ThemeManager` class, `LanguageManager` class |

Initialization in `main.js` constructs both controllers and attaches them to toggle buttons. Theme and language preferences persist in `localStorage`.

## Brand switcher

`js/brand.js` holds a single active-brand flag:

```js
const ACTIVE_BRAND = 'pensoia'; // or 'epbf'
```

**What switches:**
- Tab title and meta tags (description, og:title, twitter:title)
- Logo alt text
- About section text ("A {brand} consolida...")
- Contact section text and email link
  - pensoia → contato@pensoia.com
  - epbf → contato@epbf.com.br

**What never switches:**
- Footer always shows both: `PensoIA / EPBF`

## CSS-filter icon theming

Service and UI icons ship as **black PNGs** and are recolored via CSS filters so a single asset serves both themes.

```css
/* Light mode -- turquoise #14b8a6 */
filter: brightness(0) saturate(100%) invert(44%) sepia(78%) saturate(1157%) hue-rotate(146deg) brightness(91%) contrast(93%);

/* Dark mode -- light turquoise #5eead4 */
filter: brightness(0) saturate(100%) invert(88%) sepia(19%) saturate(1011%) hue-rotate(113deg) brightness(99%) contrast(96%);

/* White (contact icon) */
filter: brightness(0) invert(1);
```

Trade-off: single-color icons only. Multi-color icons require SVG.

## Theme system

CSS variables scoped by `[data-theme]`:

```css
:root { --bg: #fff; --text: #111; --primary: #14b8a6; ... }
[data-theme="dark"] { --bg: #1a1a1a; --text: #eee; ... }
```

`ThemeManager.toggle()` flips `document.documentElement.dataset.theme` between `light` and `dark`; preference saved to `localStorage.theme`.

## Deploy pipeline

| Branch | Target | Hostinger trigger |
|--------|--------|-------------------|
| `dev` | staging.pensoia.com | Webhook on push |
| `master` | pensoia.com | Webhook on push |

Staging webhook URL: `https://webhooks.hostinger.com/deploy/85676e60379c5e9b98d25f798d8317b5`
Production webhook: configured via Hostinger panel.

**Cache busting:** Hostinger CDN serves CSS/JS with `max-age=604800` (7 days) and ignores query strings on HTML. Bump `?v=X.X` on every reference in `index.html` before pushing. For deep cache invalidation (weekly CDN entries), rename the file.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Staging not updating after push | Hostinger webhook didn't fire | Hostinger panel → Git deployments → dev → click "Deploy" manually |
| Production not updating after merge | Same, on master | Same manual-deploy click |
| Icons/CSS not showing after deploy | Browser cache | Hard refresh (Ctrl+Shift+R Windows, Cmd+Shift+R Mac) |
| Staging banner on production | Branch crossed | Verify Hostinger git config: `pensoia.com` → `master` |
| Deploy fails with "divergent branches" | History drift from manual server edits | SSH reset -- see auto-memory `reference_hostinger_deploy_fix.md` |
