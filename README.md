# PensoIA Website

Source for the PensoIA marketing site -- live at **https://pensoia.com**.

PensoIA is a consultancy in AI and prompt engineering for legal professionals in Brazil.

## Features

- ✅ Single-page, fully responsive
- ✅ Bilingual (PT-BR default, EN toggle) -- preference persisted
- ✅ Dark / light mode toggle -- preference persisted
- ✅ Green-turquoise brand palette, themed PNG icons via CSS filters
- ✅ Complete favicon set + PWA webmanifest
- ✅ Brand switcher (PensoIA / EPBF) -- single flag in `js/brand.js`
- ✅ Vanilla HTML/CSS/JS, MVC-style separation

## Project Structure

```
Site/
├── index.html              # Main page
├── css/
│   └── style.css           # All styles (theme, components, dark mode)
├── js/
│   ├── main.js             # Controllers (Theme, Language)
│   ├── translations.js     # PT-BR / EN strings
│   └── brand.js            # Brand flag (pensoia | epbf)
├── images/
│   ├── logo.png, profile.jpg
│   └── icons/              # Themed black PNGs
├── favicon*.{ico,png}, apple-touch-icon.png, android-chrome-*.png
├── site.webmanifest        # PWA manifest
├── OneSignalSDKWorker.js   # Push notifications (belongs to Adriana-Updates)
├── backstage/              # Separate project (Backstage) -- see its MANIFEST
├── adriana/                # Separate project (Adriana-Updates) -- see its MANIFEST
├── go/                     # Student-facing part of Backstage
└── MANIFEST.md             # Planning, tasks, architecture, decisions
```

## Deployment

This repo is a **Hostinger deploy target**, not a library. Pushes trigger webhooks that deploy the tree directly to the web host:

- `dev` branch → **staging.pensoia.com**
- `master` branch → **pensoia.com**

**Cache busting:** always increment `?v=X.X` on CSS/JS references in `index.html` before pushing, so the Hostinger CDN serves the new file.

## How to Customize

### Switch brand (PensoIA ↔ EPBF)
Edit `js/brand.js`:
```js
const ACTIVE_BRAND = 'pensoia'; // or 'epbf'
```

### Change content
Edit `js/translations.js` -- both PT-BR and EN strings live there.

### Change colors
Edit the CSS variables at the top of `css/style.css` (`--primary`, `--primary-dark`, `--secondary`, etc.).

### Change contact email
Update the `mailto:` link in `index.html` and the email strings in `js/translations.js`.

## Testing Locally

1. Open `index.html` directly in any browser, or serve the folder with any static server.
2. Test the language toggle, theme toggle, and responsive layout (resize the window).

## Browser Support

- Chrome / Edge (latest)
- Firefox (latest)
- Safari (latest, macOS and iOS)
- Chrome Mobile

## License

© 2026 PensoIA / EPBF Soluções em Tecnologia Ltda. All rights reserved.

---
**Live Site:** https://pensoia.com · **Staging:** https://staging.pensoia.com
**Planning & architecture:** see [MANIFEST.md](./MANIFEST.md)
**Last Updated:** 2026-04-18
