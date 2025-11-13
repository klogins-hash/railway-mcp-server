# Create Private Repository - Step by Step

## Step 1: Go to GitHub New Repository Page

Open in web browser: https://github.com/new

---

## Step 2: Fill In Repository Details

**Repository name**: `hosted-cloud-scaleway-clean`

**Description**: `OpenNebula Hosted Cloud on Scaleway - Clean (Incident Remediated)`

**Privacy**: Select **Private** (not Public)

**Initialize**: Leave all unchecked (DO NOT add README, .gitignore, or license)

---

## Step 3: Click "Create Repository"

The button is at the bottom of the form.

---

## Step 4: After Creation

You'll see a quick setup page. The important part is the repository URL, which should be:

```
git@github.com:klogins-hash/hosted-cloud-scaleway-clean.git
```

Or if you prefer HTTPS:

```
https://github.com/klogins-hash/hosted-cloud-scaleway-clean.git
```

---

## Step 5: Run This Command in Terminal

Once repository is created, run:

```bash
cd /Users/franksimpson/Desktop
git push --mirror git@github.com:klogins-hash/hosted-cloud-scaleway-clean.git
```

This pushes the cleaned mirror to your new private repository.

---

## Done!

After the mirror is pushed, you can:
1. Verify it's complete
2. Delete the old public fork
3. Clean up local files

See MIGRATION_INSTRUCTIONS.md or QUICK_START_MIGRATION.md for verification steps.
