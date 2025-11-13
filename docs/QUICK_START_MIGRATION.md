# Quick Start: Repository Migration to Private Repo
## Ready-to-Execute Steps

---

## STEP 1: Create Private Repository on GitHub.com

Since `gh` CLI authentication is having issues, create the repo manually:

**Go to**: https://github.com/new

**Fill in**:
- **Owner**: klogins-hash
- **Repository name**: `hosted-cloud-scaleway-clean`
- **Description**: OpenNebula Hosted Cloud on Scaleway - Clean (Incident Remediated)
- **Privacy**: ⚫ Private
- **Initialize**: DO NOT initialize with README, .gitignore, or license

**Click**: Create repository

---

## STEP 2: Get Your New Repository URL

After creating, you'll see a quick setup page. Copy the URL shown:

Example: `https://github.com/klogins-hash/hosted-cloud-scaleway-clean.git`

---

## STEP 3: Push the Mirror (Copy-Paste Ready)

```bash
cd /Users/franksimpson/Desktop

git push --mirror https://github.com/klogins-hash/hosted-cloud-scaleway-clean.git
```

**What to watch for**:
- It will ask for authentication (use your GitHub username and a personal access token or SSH key)
- Output should show: `Fetching source, pushing to destination...`
- Completion message about refs being pushed

---

## STEP 4: Verify the New Repository

```bash
# Open new private repo
git clone https://github.com/klogins-hash/hosted-cloud-scaleway-clean.git /tmp/verify-repo-clean
cd /tmp/verify-repo-clean

# Verify file is gone
git log --all --full-history -- DOMAIN_SETUP_COMPLETE.md
# Should show deletion in commit 69381d7

# Verify security docs present
ls -la SECURITY_*.md TEAM_NOTIFICATION.md
# Should show all 3 files

# Count commits
git log --oneline | wc -l
# Should be 78 commits

echo "✅ New repository verified!"
```

---

## STEP 5: Delete Old Public Fork

**Go to**: https://github.com/klogins-hash/hosted-cloud-scaleway/settings

**Scroll to**: Danger zone

**Click**: Delete this repository

**Type**: `hosted-cloud-scaleway` to confirm

**Click**: Delete

---

## STEP 6: Clean Up Local Files

```bash
cd /Users/franksimpson/Desktop

# Remove old repo
rm -rf hosted-cloud-scaleway

# Remove mirror
rm -rf hosted-cloud-scaleway-clean.git

# Clone fresh from new private repo
git clone https://github.com/klogins-hash/hosted-cloud-scaleway-clean.git hosted-cloud-scaleway
cd hosted-cloud-scaleway

# Verify you're on new repo
git remote -v
# Should show hosted-cloud-scaleway-clean.git URL
```

---

## Summary

**Files Ready**:
- ✅ Mirror clone: `/Users/franksimpson/Desktop/hosted-cloud-scaleway-clean.git`
- ✅ Migration instructions: `/Users/franksimpson/Desktop/MIGRATION_INSTRUCTIONS.md`
- ✅ Security documents: In `hosted-cloud-scaleway/` folder

**Status**: Ready to execute

**Time estimate**: 5-10 minutes

**Risk**: None (mirror is clean, credentials not exposed)

---

## Complete Checklist

- [ ] Created private repo on GitHub.com
- [ ] Pushed mirror: `git push --mirror [URL]`
- [ ] Verified new repo is clean and complete
- [ ] Deleted old public fork from GitHub
- [ ] Cleaned up local files
- [ ] New private repo is ready for team use

---

**Need more details?** See `MIGRATION_INSTRUCTIONS.md` for full instructions with troubleshooting.
