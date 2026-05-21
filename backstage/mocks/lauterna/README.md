# LaudoAI — Clickable Mockup

Standalone HTML mockup for showing the LaudoAI concept to medical professionals and design partners. No backend, no real data, no build step. Open `index.html` (for the authenticated app) or `marketing.html` (for the public landing) and click around.

> **LaudoAI** is a provisional brand name. See "Rebranding" below to swap it later.

## How to open

Double-click `marketing.html` (or `index.html`). That's it. Works in Chrome, Edge, Firefox, Safari. No HTTP server needed. Tailwind, Inter font, and Heroicons are loaded inline or via CDN.

## Pages

### Public (no sidebar)

| File | What it shows |
|---|---|
| `marketing.html` | **Sales landing page.** Sticky top nav (logo + section links + Login CTA), cyan hero with headline + dual CTAs + stylized dashboard preview with floating ICP-Brasil and PACS pills, logos trust strip, 5-differentiator grid (PACS, Mobile, ICP-Brasil, CFM 2.454/2026, multi-browser) plus a 6th cyan card for inline AI, 8 specialty cards (radiologia, cardio, US OB/Gyn, US geral, patologia, oftalmo, endoscopia, neurofisiologia), 3-step "como funciona" with numbered ghosts, Felipe quote on dark slate, 3-tier pricing teaser (R$149/R$249/R$199), final cyan CTA banner, 4-column footer. |
| `login.html` | Magic-link form. Centered card with email input + submit. Click "Enviar link de acesso" to toggle the "Confira seu e-mail" success state. Trust strip below (ICP-Brasil, CFM 2.454/2026, BR data residency). |
| `onboarding.html` | First-login flow. 4 steps with animated progress dots: welcome → CRM/UF + especialidade → ICP-Brasil cert choice (Vidaas/Bird ID/depois) → terms & responsibility checkboxes → "Vamos começar" links to dashboard. |

### Authenticated app (sidebar shell)

| File | What it shows |
|---|---|
| `index.html` | Dashboard. Greeting, stats (laudos hoje / tempo médio / pendentes), recent laudos table (8 rows), big "Novo Laudo" CTA, ICP-Brasil + PACS status. |
| `empty-state.html` | "Nenhum laudo ainda" UX for a fresh tenant. Hero card with stacked-cards illustration + dual CTA + 3-step onboarding checklist (criar laudo / vincular ICP / conectar PACS). |
| `novo-laudo.html` | Dictation-in-progress. Pulsing red mic, "Gravando 0:47", live PT-BR transcript with blinking caret, Copiloto IA panel, bottom toolbar with "Assinar e emitir". |
| `editor-com-ai.html` | **Strategic — slice 3 UI contract.** Draft editor with inline AI suggestion pills. Click an `.ai-anchor` phrase to open its popover explaining the AI's reasoning. ✓ accept turns the anchor green; ✗ reject removes it. Block-level "IA sugere" boxes accept/dismiss as a whole. Includes missing-field alert, lateralidade-check warning, perfurantes CRIT alert, and side panel listing all 4 pending suggestions. |
| `laudo-view.html` | Read-only saved draft (the `/laudo/[id]` surface). Patient header, máscara title, draft body, status badge, side panel with metadata + ICP-Brasil status + activity log. Edit / Assinar e emitir actions in header. |
| `assinar.html` | Pre-sign review. Faked PDF-style laudo with AI-modified phrases highlighted in soft yellow, version toggle (ditada ↔ final), audit-trail panel, ICP-Brasil widget that animates from "Aguardando aprovação" to "Assinado" after 3 seconds, responsibility checkbox. |
| `mascaras.html` | Templates library. Filter sidebar, 12-card grid covering CT/RM/USG/RX/Mamo/DXA, "Mais usada" starred card, floating "Nova máscara" button. |
| `historico.html` | Past laudos list. Filter sidebar (search, date range, status, máscara, modalidade, instituição), 10-row table with checkboxes, active-filter chips, pagination. |
| `configuracoes.html` | Multi-section settings. Left-rail anchor nav + 7 sections: perfil, segurança (sessions + login method), ICP-Brasil cert detail, integrações (PACS list), notificações (toggle switches), idioma, plano e cobrança, plus a "Zona de perigo" delete-account card. |
| `planos.html` | Pricing. Three tiers (Solo R$ 149 / Pro R$ 249 / Clínica R$ 199-min-5), Hospital as a discreet 4th option, Mensal ↔ Anual toggle, differentiator strip, resident discount banner, 30-day free trial CTA, 5-question FAQ accordion. |

### Error states (sidebar shell, mid-session UX)

| File | What it shows |
|---|---|
| `404.html` | Branded "Página não encontrada". Big gradient 404 with blur halo, friendly PT-BR copy, "Voltar ao dashboard" + browser-back CTAs, 2 helpful link cards (Novo laudo, Histórico). |
| `500.html` | Branded "Algo deu errado". Amber alert icon, "Tentar novamente" + dashboard CTAs, copyable incident ID (`err_3KP8nM2QvR_...`), status-page + suporte links. |

## What works (interactivity)

- Sidebar nav highlights the current page (cyan accent on active link), across all 11 sidebar-shell pages
- `login.html`: submit toggles between the email form and the "Confira seu e-mail" success state; "Usar outro e-mail" returns to the form
- `onboarding.html`: step buttons advance the 4-step flow; progress dot for the active step elongates into a cyan pill, completed dots stay cyan-filled
- `editor-com-ai.html`:
  - Click an `.ai-anchor` phrase → its popover opens with the AI's reasoning, confidence, and rule type; clicking outside or the anchor again closes it
  - Inline `.ai-actions` chip's ✓ accepts the suggestion (anchor goes green, chip disappears) or ✗ rejects (anchor reverts to transparent, chip disappears)
  - Block-level `.ai-proposed` boxes have their own "Aceitar sugestão" / "Descartar" buttons; accept turns the block emerald and replaces the actions row with an "Aceito" badge
- `planos.html`: Mensal ↔ Anual toggle swaps prices live
- `assinar.html`: ICP-Brasil widget flips from "Aguardando" to "Assinado" after 3 s on page load; AI-inferences list expands on click; version toggle (ditada/final) shows/hides the yellow AI highlights
- `novo-laudo.html`: mic pulses with `@keyframes recPulse`, animated waveform bars (`.wave-bar`)
- `historico.html`: filter chips, modalidade pill buttons, table-row hover states

## Visual direction

- Accent: medical teal `#0891b2` (Tailwind `cyan-700`), deliberately NOT green (Laudite's colour)
- Background: `bg-slate-50` with white cards, soft shadows, `rounded-xl`
- Sidebar: dark slate-900, 240px fixed, white nav items, cyan-700 active state
- Typography: Inter from Google Fonts (400/500/600/700, plus 800 on `marketing.html` for the hero)
- Icons: Heroicons inline SVG, no icon font
- Public-page top nav: white with bottom border, sticky, max-w-7xl, logo on left, section links + Login CTA on right

## File layout

```
mockup/
├── marketing.html        Public sales landing (entry point for prospects)
├── login.html            Magic-link auth (public)
├── onboarding.html       First-login 4-step flow (public)
├── index.html            Dashboard (authenticated entry point)
├── empty-state.html      Fresh-tenant "no laudos yet" UX
├── novo-laudo.html       Dictation-in-progress
├── editor-com-ai.html    ★ Inline-AI editor (slice 3 UI contract)
├── laudo-view.html       Read-only saved draft
├── assinar.html          Pre-sign review + ICP-Brasil signing animation
├── mascaras.html         Templates library
├── historico.html        Past laudos with filters + pagination
├── configuracoes.html    Multi-section settings + danger zone
├── planos.html           Pricing
├── 404.html              Branded "Página não encontrada"
├── 500.html              Branded "Algo deu errado" + incident ID
├── assets/
│   ├── styles.css        Custom CSS (animations, AI highlight, signing widget, badges, AI suggestion pills, editable field hover)
│   └── script.js         Vanilla JS (nav highlight, signing animation, pricing toggle, version toggle, inference expand, AI accept/reject, popover toggle, onboarding step transitions)
└── README.md
```

## Rebranding

The brand "LaudoAI" appears in:

- The `<title>` of every HTML page
- The sidebar logo block (search `LaudoAI` in each HTML — the text sits next to a microphone SVG)
- The top nav of `marketing.html`, `login.html`, `onboarding.html`
- The footer of `marketing.html` and `planos.html`
- The sidebar footer of each in-app page (`v0.1 · pré-lançamento`)
- `marketing.html` hero copy ("Bem-vindo ao LaudoAI", etc.)

Find-replace `LaudoAI` across all HTML files when the real brand is chosen. The logo glyph is a generic mic SVG; swap it in the same block if you have a real mark.

## Limitations

- The ICP-Brasil "Assinado" animation on `assinar.html` fires once per page load. Refresh to replay.
- No real ASR, no real PDF rendering, no signing back-end, no real AI inference. All data is hard-coded.
- `editor-com-ai.html` accept/reject actions are visual only — the underlying text in the document doesn't actually get edited.
- Mobile responsive enough to view at 768px but not optimized for phones. This is for laptop demos.
- Tailwind via CDN, so the first paint shows a brief unstyled flash if the network is slow. Acceptable for demos.
