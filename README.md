# PensoIA Site

Static site on Netlify. Serves both `pensoia.com` and `epbf.com.br` from the same repo.

## Deployment

- `dev` branch → `staging.pensoia.com` (auto-deploys)
- `master` branch → `pensoia.com` / `epbf.com.br` (auto-deploys)

Workflow: develop on `dev`, review on staging, cherry-pick or merge to `master` for production.

Always increment `?v=X.X` on CSS/JS files in `index.html` when pushing changes (cache busting).

## Brand Switcher

To switch the site identity between PensoIA and EPBF, change one line in `js/brand.js`:

```js
const ACTIVE_BRAND = 'pensoia'; // or 'epbf'
```

Affects: tab title, meta tags, logo alt text, about text, contact email. Footer always shows both.

---

## Adriana Subproject (`/adriana`)

Family health updates page at `epbf.com.br/adriana`. Google Sheets as backend, Google Apps Script as POST endpoint.

- Public page: `adriana/index.html`
- Admin panel: `adriana/admin/index.html` (dark-only, password-gated)
- Spreadsheet: `14WWz2LsbziG8yXaU9ZzcKGRQXHufZivf7FHsANTRueE`
- Updates posted via `/adriana` Claude skill or directly in Google Sheets

### Push Notifications (OneSignal)

- **App ID:** `89faae5a-ef60-4165-aef4-1c274deea3b4`
- **Site URL in dashboard:** `https://epbf.com.br` (root — cannot be scoped to /adriana/)
- **Service worker:** `OneSignalSDKWorker.js` at repo root
- **SDK:** `OneSignalSDK.page.js` v16, loaded with `defer`, initialized via `OneSignalDeferred` pattern

**Subscribe flow — the working approach:**

`OneSignal.Slidedown.promptPush()` does NOT work (resolves silently). Use native permission + explicit opt-in:

```javascript
function notifBarClick() {
    OneSignalDeferred.push(async function(OneSignal) {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
            await OneSignal.User.PushSubscription.optIn();
        }
    });
}
```

All OneSignal API calls must be inside `OneSignalDeferred.push()` — `OneSignal` is not a global.

**Sending from admin panel:**

```
POST https://api.onesignal.com/notifications
Authorization: Key <REST_API_KEY>
```

- Key format: `os_v2_app_...` from Dashboard > Keys & IDs
- Auth header: `Key` not `Basic`
- Payload: `included_segments: ["Total Subscriptions"]`, `contents/headings: { en: "...", pt: "..." }`

**API key instability:** Keys disappeared repeatedly when account used Google/OAuth login only. Fixed by adding a password login to the OneSignal account. If keys vanish again, regenerate and update `adriana/admin/index.html` (ONESIGNAL_API_KEY) and `~/.claude/skills/adriana-update/skill.md`.
