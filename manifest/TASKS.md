# Tasks -- PensoIA Site

> Phase mapping: 1 Foundation (done) · 2 Compliance · 3 Conversion · 4 Content · 5 Performance

## Done

[x] 1A -- Dark Mode Toggle
[x] 1B -- Favicon Complete Set + site.webmanifest
[x] 1C -- Language Toggle Redesign (PT / EN text-only)
[x] 1D -- Icon System (themed PNGs replace emojis, CSS-filter colorization)
[x] 1E -- Hostinger Git-Webhook Auto-Deploy (dev → staging, master → production)

## Upcoming

### Phase 2 -- Foundation & Compliance

[ ] 2A -- SEO Meta Tags
      **Problem:** Landing page has no Open Graph / Twitter Card / Schema.org markup; social-share previews are bare and search-engine presentation is minimal.
      **Fix:** Add OG + Twitter Card + Organization/Person/Service Schema.org JSON-LD to `index.html`; add canonical URL, hreflang for PT/EN, meta robots, sitemap.xml, robots.txt.
      **Test:** [VISUAL] Paste pensoia.com into opengraph.xyz and Twitter card validator; confirm preview renders with title, description, image. Inspect page source for schema JSON-LD blocks.

[ ] 2B -- Accessibility (WCAG AA)
      **Problem:** No skip-to-content link, no visible focus indicators, missing ARIA labels on theme/language toggles, no explicit landmarks.
      **Fix:** Add skip-link, focus-ring styles, ARIA labels on all buttons and toggles, main/nav/complementary landmarks, 44x44px minimum touch targets, verify WCAG AA contrast.
      **Test:** [CHECKLIST] Lighthouse accessibility audit ≥95. Tab-navigation reaches every interactive element with visible focus. Screen reader (NVDA) announces both toggles and all service cards.

[ ] 2C -- LGPD Compliance
      **Problem:** No privacy policy, no terms of service, no cookie banner -- required under LGPD for any Brazilian site that collects identifiable visitor data.
      **Fix:** Add `/privacy` and `/terms` pages (PT + EN), LGPD-compliant cookie consent banner with granular categories, link from footer.
      **Test:** [CHECKLIST] Pages reachable from footer. Cookie banner appears on first visit, persists choice, respects denial. Text reviewed for LGPD compliance.

### Phase 3 -- Conversion

[ ] 3A -- Contact Form
      **Problem:** Only a `mailto:` link for contact -- high friction, no lead capture.
      **Fix:** Contact form (name, email, message, service dropdown) wired to Formspree or equivalent no-backend service; client-side validation.
      **Test:** [STAGING] Submit a test lead from staging.pensoia.com; verify email arrives; verify invalid input blocks submit.

[ ] 3B -- Social + WhatsApp
      **Problem:** No social-media links, no click-to-chat option for mobile visitors.
      **Fix:** Add LinkedIn link in footer + floating WhatsApp button (wa.me deep link).
      **Test:** [VISUAL] Both links visible on desktop and mobile; WhatsApp button opens wa.me on tap.

[ ] 3C -- CTAs
      **Problem:** Single "Entre em Contato" button at bottom; no persistent or repeated CTA.
      **Fix:** CTA after About section, sticky header CTA on scroll.
      **Test:** [VISUAL] Scroll through staging page; CTAs visible at 3+ scroll positions.

[ ] 3D -- Testimonials Section
      **Problem:** No social proof on the landing page.
      **Fix:** Testimonials section with quotes from past consulting clients (content pending from Elder).
      **Test:** [VISUAL] Section renders on desktop + mobile with at least 3 testimonials.

[ ] 3E -- FAQ Section
      **Problem:** Visitors have no pre-contact answer path for common questions (pricing, process, scope).
      **Fix:** FAQ section (collapsible items) with 6-10 common questions, PT + EN.
      **Test:** [VISUAL] FAQ items expand/collapse; content localized on language toggle.

### Phase 4 -- Content & Authority

[ ] 4A -- Portfolio / Case Studies -- **Problem:** no proof of past work visible. **Fix:** portfolio section with 2-3 anonymized case studies. **Test:** [VISUAL] section renders with case entries.
[ ] 4B -- About Page Expansion -- **Problem:** About section is brief. **Fix:** dedicated `/about` page with bio, credentials, publications. **Test:** [VISUAL] reachable from nav, renders localized.
[ ] 4C -- Blog Setup (optional) -- **Problem:** no content marketing surface. **Fix:** decide platform (Hostinger-hosted static vs external). **Test:** [CHECKLIST] decision documented; if built, 1 post live.

### Phase 5 -- Performance & Polish

[ ] 5A -- Image Optimization -- **Problem:** images served at full resolution, no lazy load. **Fix:** `loading=lazy`, WebP with fallback, responsive `srcset`. **Test:** [AUTO] Lighthouse performance ≥90 on mobile.
[ ] 5B -- Analytics -- **Problem:** no visitor analytics. **Fix:** GA4 + Microsoft Clarity with LGPD-gated loading (only after cookie consent). **Test:** [CHECKLIST] events arrive in GA4 real-time after consent; no tracking fires before consent.
[ ] 5C -- Error Pages + Security Headers -- **Problem:** generic Hostinger 404, no CSP / X-Frame headers. **Fix:** custom `404.html`, security headers via `.htaccess`. **Test:** [CLI] `curl -I pensoia.com` shows CSP, X-Frame-Options, Referrer-Policy.
[ ] 5D -- Micro-interactions -- **Problem:** basic scroll animations only. **Fix:** hover effects, loading states, scroll progress indicator. **Test:** [VISUAL] interactions visible on staging.

## Bugs

None known.
