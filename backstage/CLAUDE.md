# Backstage

> Project memory lives here. Global memory folder is workspace-wide only, if unsure of scope, ask.

## Auth contract

### Rule: Dual-path auth (Google primary + bs_pw_hash fallback)

Backstage's auth gate accepts EITHER a valid Google access token with allowlisted email OR a valid bs_pw_hash. Tools never re-authenticate. They read identity and tokens from `window.BS_GOOGLE`.

Why: lets new Google integrations (Gmail, Calendar, Docs, ...) work without per-tool consent screens. Password path stays as offline-style fallback when Google is unreachable or an account is locked.

### Rule: Adding new scopes

Edit `BS_GOOGLE_SCOPES` in `Site/backstage/js/bs-google.js`. Existing users see a re-consent popup on their next session. The popup lists the new scopes; one click approves.

Why: scope changes are user-visible; document the change in the commit message so future debugging knows when the consent screen changed.

### Rule: Adding new Google service wrappers

New tools call `window.BS_GOOGLE.<service>` (drive, gmail, calendar, ...). If the namespace doesn't exist yet, the first consumer tool's PR adds it to `bs-google.js`. Each wrapper is thin: just typed access to the underlying REST API with the cached token.

Why: keeps tool code clean (no auth ceremony per tool) and centralizes scope management in one file.

### Rule: Allowlist changes

Edit Doppler secret `BACKSTAGE_GOOGLE_ALLOWLIST` (comma-separated emails). Worker picks up at next request, no redeploy needed.

Why: account access is operationally controlled, not in code.

## Client-side storage keys

- Password hash (legacy fallback path): localStorage `bs_pw_hash`
- Session auth flag: sessionStorage `bs_auth` = `'1'`
- Theme: localStorage `bs_theme`
- Reveal theme: localStorage `bs_reveal_theme`
- Custom themes: localStorage `bs_custom_themes`
- Debug mode: localStorage `bs_debug`
- Apps Script URL: localStorage `bs_cf_script_url`

To retrieve `AUTH_TOKEN` (legacy password path): `doppler secrets get AUTH_TOKEN -p backstage -c dev --plain`

**R2 note:** Presentation data (`data.json`) is served from Cloudflare R2 via `get_presentation_json`, NOT from the local git file. To update, call `put_presentation_json` with auth_token.

**Topbar zone:** `bs-topbar` auto-reveals on hover at the top edge (~64px). Never place interactive UI in the top ~64px of any Backstage page or panel. Same applies to the bottom ~64px when the side menu is present.

## Architecture: how Worker verifies a Google session

Frontend sends `Authorization: Bearer <google_access_token>` on Worker requests.

Worker: calls `https://oauth2.googleapis.com/tokeninfo?access_token=...`. If response has a valid email AND email is in `BACKSTAGE_GOOGLE_ALLOWLIST` (case-insensitive), accept. Otherwise fall back to checking the legacy `password_hash` param. If neither path validates, return 401.

Cost: ~50ms per Worker call for tokeninfo. Acceptable for internal tool. If observed latency becomes an issue, add a `caches` API entry keyed by token, TTL 5min.
