# Repository Migration Instructions
## From klogins-hash/hosted-cloud-scaleway (with exposed patterns) to New Clean Repository

**Status**: Mirror created locally, ready for GitHub push

---

## PREREQUISITE: GitHub Authentication

First, ensure `gh` CLI is authenticated with your GitHub account:

```bash
gh auth login
# Follow prompts to authenticate
# Choose GitHub.com
# Choose HTTPS
# Choose yes for git credential helper
```

---

## STEP 1: Create New GitHub Repository

Choose a new repository name (e.g., `hosted-cloud-scaleway-v2` or `opencloud`), then create it:

```bash
# Option A: Create via gh CLI (requires auth)
gh repo create klogins-hash/NEWREPONAME --private --source=. --description "OpenNebula Hosted Cloud on Scaleway (Clean)"

# Option B: Create manually on GitHub.com
# 1. Go to https://github.com/new
# 2. Owner: klogins-hash
# 3. Repository name: [your-new-name]
# 4. Description: OpenNebula Hosted Cloud on Scaleway (Clean) - Incident-remediated version
# 5. PRIVATE (select this instead of Public)
# 6. Create repository (DO NOT initialize with README)
```

**Keep the new repository URL handy** (e.g., `https://github.com/klogins-hash/NEWREPONAME.git`)

---

## STEP 2: Push Mirror to New Repository

Replace `NEW_REPO_URL` with your new repository URL:

```bash
cd /Users/franksimpson/Desktop

# Push the mirror to the new repository
git push --mirror NEW_REPO_URL

# Example:
# git push --mirror https://github.com/klogins-hash/hosted-cloud-scaleway-clean.git
```

**Output should show**: `Fetching source, pushing to destination...`

---

## STEP 3: Verify New Repository

```bash
# Clone the new repository to verify
git clone https://github.com/klogins-hash/NEWREPONAME.git /tmp/verify-repo
cd /tmp/verify-repo

# Verify the problematic file is gone
git log --all --full-history -- DOMAIN_SETUP_COMPLETE.md
# Should show the removal commit (69381d7)

# Verify security documents are present
ls -la SECURITY_*.md TEAM_NOTIFICATION.md
# Should show all 3 files

# Check commit history
git log --oneline | head -5
# Should show removal commit at top

echo "✅ New repository verified clean!"
```

---

## STEP 4: Delete Old Fork from GitHub

**Important: Do this AFTER verifying the new repository is complete**

```bash
# Via gh CLI (requires auth)
gh repo delete klogins-hash/hosted-cloud-scaleway

# OR manually:
# 1. Go to https://github.com/klogins-hash/hosted-cloud-scaleway
# 2. Settings > Danger zone > Delete this repository
# 3. Type the repository name to confirm
# 4. Delete
```

**⚠️ WARNING**: This cannot be undone. Ensure new repository is complete first.

---

## STEP 5: Update Team References

Update any documentation or scripts that reference the old URL:

```bash
# Find all references to old repository
grep -r "hosted-cloud-scaleway" /Users/franksimpson/Desktop --exclude-dir=.git

# Update to new repository URL where needed
```

---

## STEP 6: Clean Up Local Files

After verifying everything is in the new repository:

```bash
cd /Users/franksimpson/Desktop

# Remove old repository (now at new URL)
rm -rf hosted-cloud-scaleway

# Remove mirror
rm -rf hosted-cloud-scaleway-clean.git

# Clone from new repository
git clone https://github.com/klogins-hash/NEWREPONAME.git hosted-cloud-scaleway
cd hosted-cloud-scaleway

# Verify you're on new repository
git remote -v
# Should show new repository URL
```

---

## COMPLETE CHECKLIST

### Before Deletion
- [ ] Read and understand these instructions
- [ ] New GitHub repository created
- [ ] Mirror pushed to new repository
- [ ] New repository verified complete and clean
- [ ] DOMAIN_SETUP_COMPLETE.md is gone from new repo
- [ ] Security documents (3 files) are in new repo
- [ ] All commits are present in new repo
- [ ] Team members have been notified

### After Deletion
- [ ] Old fork deleted from GitHub
- [ ] All references updated to new URL
- [ ] Old local repository removed
- [ ] New repository cloned and tested
- [ ] Team updated with new repository URL

---

## SUMMARY

**Mirror Created**: ✅
**Local Location**: `/Users/franksimpson/Desktop/hosted-cloud-scaleway-clean.git`

**Next Steps**:
1. Create new GitHub repository (or use existing public repo if you prefer)
2. Push mirror: `git push --mirror NEW_REPO_URL`
3. Verify new repository is complete and clean
4. Delete old fork from GitHub
5. Update team with new URL

---

## TROUBLESHOOTING

### Mirror push fails with authentication error
```bash
# Ensure gh is authenticated
gh auth login

# Or use direct git credentials
git push --mirror https://USERNAME:TOKEN@github.com/klogins-hash/NEWREPONAME.git
```

### Need to verify mirror completeness
```bash
cd /Users/franksimpson/Desktop/hosted-cloud-scaleway-clean.git
git log --oneline | wc -l
# Should show 78 commits (77 original + 1 removal)
```

### Accidentally deleted old repo?
The mirror at `hosted-cloud-scaleway-clean.git` can be pushed to a new repository to restore.

---

## SECURITY NOTES

- ✅ New repository is PRIVATE (no public exposure of infrastructure details)
- ✅ New repository starts with DOMAIN_SETUP_COMPLETE.md already removed
- ✅ All security documents are included
- ✅ Complete commit history is preserved (including removal commit)
- ✅ No actual credentials ever existed to expose
- ✅ Migration is simply a "fresh start" for better organization with restricted access

---

**Created**: November 10, 2025
**Status**: Ready for migration
**Mirror Location**: `/Users/franksimpson/Desktop/hosted-cloud-scaleway-clean.git`
