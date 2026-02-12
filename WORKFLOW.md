# PensoIA Site - Development Workflow

**Last Updated:** 2026-02-05

---

## Environments

### Staging (Preview)
- **URL:** https://staging.pensoia.com
- **Branch:** `dev`
- **Purpose:** Test and preview new features
- **Identifier:** Orange banner at top

### Production (Live)
- **URL:** https://pensoia.com
- **Branch:** `master`
- **Purpose:** Public-facing live site
- **Identifier:** No banner

---

## Development Workflow

### Step 1: Develop Feature (Claude)

```bash
# Switch to dev branch
git checkout dev

# Make changes...
# (Edit files, add features, etc.)

# Commit and push
git add .
git commit -m "feat: description of feature"
git push origin dev
```

**Result:** Auto-deploys to **staging.pensoia.com**

---

### Step 2: Review (You)

1. Visit **https://staging.pensoia.com**
2. Test the new feature
3. Check on mobile/desktop
4. Test dark mode/language toggle
5. Decision:
   - ✓ **Approve** → Move to Step 3
   - ✗ **Request Changes** → Back to Step 1

---

### Step 3: Deploy to Production (Claude, after approval)

```bash
# Switch to master branch
git checkout master

# Merge dev into master
git merge dev

# Push to production
git push origin master
```

**Result:** Auto-deploys to **pensoia.com** (live)

---

## Quick Reference Commands

### For Claude (Development):

```bash
# Start new feature
git checkout dev

# After changes
git push origin dev
# → Staging updated

# After approval
git checkout master
git merge dev
git push origin master
# → Production updated
```

### For You (Review):

- **Preview:** https://staging.pensoia.com
- **Live:** https://pensoia.com
- **Approve:** Tell Claude "Approved, deploy to production"
- **Changes:** Tell Claude what needs to be fixed

---

## Git Branch Structure

```
master (production)
  ↑
  | (merge after approval)
  |
dev (staging)
  ↑
  | (continuous development)
  |
(feature work)
```

---

## Webhook Configuration

### Staging Webhook (GitHub → Hostinger)
- **Trigger:** Push to `dev` branch
- **Deploys to:** staging.pensoia.com
- **Webhook URL:** `https://webhooks.hostinger.com/deploy/85676e60379c5e9b98d25f798d8317b5`

### Production Webhook (GitHub → Hostinger)
- **Trigger:** Push to `master` branch
- **Deploys to:** pensoia.com
- **Webhook URL:** (Original production webhook - already configured)

---

## Backup to Claude Workspace

The `/gitcommit` command still works and backs up to your private `claude-workspace` repo:

```bash
/gitcommit
```

This syncs the current state to `C:\Users\elder\git-repos\claude-workspace`.

---

## Troubleshooting

### "Staging not updating after push"
- Check Hostinger Git deployments → dev branch status
- Manually click "Deploy" if needed

### "Production not updating after merge"
- Check Hostinger Git deployments → master branch status
- Manually click "Deploy" if needed

### "Icons/CSS not showing correctly"
- Hard refresh: **Ctrl + Shift + R** (Windows) or **Cmd + Shift + R** (Mac)
- Clear browser cache

### "Staging banner showing on production"
- This shouldn't happen - dev and master are separate
- Check which branch is deployed to pensoia.com

---

## Example Feature Development

**Scenario:** Adding a contact form

1. **Claude:** Develop on `dev` branch → push
2. **You:** Visit staging.pensoia.com → test form
3. **You:** "Form looks good, but change button color to green"
4. **Claude:** Fix on `dev` → push
5. **You:** Review staging again → "Perfect, deploy it"
6. **Claude:** Merge to `master` → push
7. **You:** Check pensoia.com → form is live!

---

## Best Practices

- ✓ Always test on staging first
- ✓ Never push directly to master without testing
- ✓ Use meaningful commit messages
- ✓ Hard refresh when checking production
- ✓ Keep dev and master in sync (merge approved changes promptly)

---

**Ready to develop features with confidence!**
