# LaudoAI — Clickable Mockup

Standalone HTML mockup for showing the LaudoAI concept to medical professionals and design partners. No backend, no real data, no build step. Open `index.html` and click around.

> **LaudoAI** is a provisional brand name. See "Rebranding" below to swap it later.

## How to open

Double-click `index.html`. That's it. Works in Chrome, Edge, Firefox, Safari. No HTTP server needed. Tailwind, Inter font, and Heroicons are loaded inline or via CDN.

## Pages

| File | What it shows |
|---|---|
| `index.html` | Dashboard. Greeting, stats (laudos hoje / tempo médio / pendentes), recent laudos table (8 rows), big "Novo Laudo" CTA, ICP-Brasil + PACS status. |
| `novo-laudo.html` | The hero page. Pulsing red mic, "Gravando 0:47", live PT-BR CT chest transcript with blinking caret, Copiloto IA panel (suggestion, CRIT alert, prior-report comparison), bottom toolbar with auto-loaded template chip and "Assinar e emitir". |
| `assinar.html` | Pre-sign review. Faked PDF-style laudo with AI-modified phrases highlighted in soft yellow, version toggle (ditada ↔ final), audit-trail panel with expandable list of 3 AI inferences, ICP-Brasil widget that animates from "Aguardando aprovação" to "Assinado" after 3 seconds, responsibility checkbox, CFM 2.454/2026 disclaimer. |
| `mascaras.html` | Templates library. Filter sidebar (especialidade, modalidade, instituição), 12-card grid covering CT/RM/USG/RX/Mamo/DXA, "Mais usada" starred card, one card with "Auto-carregada por ditado" badge, floating "Nova máscara" button. |
| `planos.html` | Pricing. Three tiers (Solo R$ 149 / Pro R$ 249 / Clínica R$ 199-min-5), Hospital as a discreet 4th option, Mensal ↔ Anual toggle, differentiator strip, resident discount banner, 30-day free trial CTA, 5-question FAQ accordion. |

## What works (interactivity)

- Sidebar nav highlights the current page (cyan accent on active link)
- Pricing toggle (Mensal ↔ Anual) on `planos.html` swaps prices live
- ICP-Brasil widget on `assinar.html` flips from "Aguardando" to "Assinado" after 3 s on page load
- AI-inferences list on `assinar.html` expands on click
- Version toggle (ditada/final) on `assinar.html` shows/hides the yellow AI highlights
- FAQ accordion on `planos.html` opens/closes
- Mic on `novo-laudo.html` pulses + animated waveform bars

## Visual direction

- Accent: medical teal `#0891b2` (Tailwind `cyan-700`), deliberately NOT green (Laudite's colour)
- Background: `bg-slate-50` with white cards, soft shadows, `rounded-xl`
- Sidebar: dark slate, 240px fixed, white nav items
- Typography: Inter from Google Fonts
- Icons: Heroicons inline SVG, no icon font

## File layout

```
mockup/
├── index.html        Dashboard
├── novo-laudo.html   Dictation
├── assinar.html      Pre-sign review
├── mascaras.html     Templates
├── planos.html       Pricing
├── assets/
│   ├── styles.css    Custom CSS (animations, AI highlight, signing widget, badges)
│   └── script.js     Vanilla JS (nav highlight, signing animation, pricing toggle, version toggle, inference expand)
└── README.md
```

## Rebranding

The brand "LaudoAI" appears in:

- The `<title>` of each HTML page
- The sidebar logo block (search `LaudoAI` in each HTML — the text sits next to a microphone SVG)
- The footer of `planos.html` (final small disclaimer line)
- The footer of each sidebar (`v0.1 · pré-lançamento`)

Find-replace `LaudoAI` across the five HTML files when the real brand is chosen. The logo glyph is a generic mic SVG; swap it in the same block if you have a real mark.

## Limitations

- The ICP-Brasil "Assinado" animation fires once per page load. Refresh to replay.
- No real ASR, no real PDF rendering, no signing back-end. All data is hard-coded.
- Sidebar items "Histórico" and "Configurações" link to `#` (no page built).
- Mobile responsive enough to view at 768px but not optimized for phones. This is for laptop demos.
- Tailwind via CDN, so the first paint shows a brief unstyled flash if the network is slow. Acceptable for demos.
