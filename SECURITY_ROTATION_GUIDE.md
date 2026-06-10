# Security Credentials Rotation & Git History Cleanup Guide

This guide details the step-by-step instructions to securely rotate all API keys used in **Luxury Authenticator** and completely purge the `.env` file from the repository's historical git history.

---

## Part 1: Credentials Rotation

Since `.env` was historically committed, all active keys are considered compromised. Follow these instructions to replace them:

### 1. Gemini API Key (Google AI Studio)
1. Go to the [Google AI Studio Console](https://aistudio.google.com/).
2. Select your active project.
3. Go to **Get API Key** and create a new key.
4. **Delete** the old compromised API key to block all existing requests using it immediately.
5. Set the new key as the Supabase secret `GEMINI_API_KEY` (server-side only).

> [!CAUTION]
> Do **NOT** set `EXPO_PUBLIC_GEMINI_API_KEY` for any production build. Every
> `EXPO_PUBLIC_*` variable is compiled into the shipped JS bundle and can be
> extracted from the app — a paid API key there is a guaranteed leak. The
> variable exists only for local development with `EXPO_PUBLIC_USE_EDGE_FUNCTIONS=false`.

### 2. Replicate API Token
1. Log in to [Replicate](https://replicate.com/) and go to your **Account Settings** -> **API Tokens**.
2. Generate a new API token (label it `luxury-authenticator-prod-new`).
3. **Delete / Revoke** the old compromised token.
4. Set the new token in:
   - Supabase Secret Vault as `REPLICATE_API_TOKEN` (see below for Edge Function rotation).

> [!CAUTION]
> Do **NOT** set `EXPO_PUBLIC_REPLICATE_API_TOKEN` for any production build —
> it ships inside the app bundle. It exists only for local development with
> `EXPO_PUBLIC_USE_EDGE_FUNCTIONS=false`. The in-app Replicate prewarm now
> routes through the `embed-image` edge function (`warmOnly`), so no client
> token is needed in any mode for prewarming.

### 3. Supabase Keys
Because Supabase handles database connections and edge functions, its keys are critical:
1. Log in to the [Supabase Dashboard](https://supabase.com/).
2. Go to **Project Settings** -> **API**.
3. Under **JWT Settings**, click **Generate new JWT Secret**.
   > [!WARNING]
   > Rotating the JWT Secret will immediately invalidate all existing client sessions and edge function invocation tokens. Users will be logged out, which is expected during rotation.
4. Copy the new **anon** public key and **service_role** secret key.
5. In your local `.env`:
   - Replace `EXPO_PUBLIC_SUPABASE_ANON_KEY` with the new anon key.
   - Replace `SUPABASE_SERVICE_ROLE_KEY` with the new service_role key.
6. Update the Supabase Secrets for Edge Functions:
   ```bash
   # Set the new Replicate token inside Supabase server secrets
   npx supabase secrets set REPLICATE_EMBED_MODEL="1dcb6b130ac6ae0574282178705d0e219526ac6d9276c93eda065dfaacae772f"
   ```

---

## Part 2: Git History Cleanup via `git filter-repo`

Simply deleting `.env` in a new commit does **NOT** remove it from your Git history. Old commits still contain the plain-text file. We must use `git-filter-repo` (the modern, official replacement for `git filter-branch`) to scrub it completely.

### Prerequisites
Make sure `git-filter-repo` is installed on your Mac:
```bash
brew install git-filter-repo
```

### Execution Steps
Run the following commands carefully from the root of your repository (`/Users/kritsada/Desktop/Luxury-authenticator`):

1. **Create a backup clone** of your repository before proceeding, just in case:
   ```bash
   cp -R ../Luxury-authenticator ../Luxury-authenticator-backup
   ```

2. **Scrub the `.env` file** from all commits, branches, and tags:
   ```bash
   git filter-repo --path .env --invert-paths
   ```

3. **Verify the file is deleted from history**:
   Search your commit history to ensure no references to `.env` remain:
   ```bash
   git log --all --full-history -- .env
   ```
   *This command should return zero results, indicating the file is completely gone from the git graph.*

4. **Add your clean local `.env` file back** (it will be ignored going forward as long as it matches your `.gitignore` configuration):
   *Create a new `.env` with your newly rotated keys.*

5. **Force-push the clean history** to your remote repository (e.g., GitHub/GitLab):
   Since the git commit hashes have changed, you must force push:
   ```bash
   git push origin --force --all
   git push origin --force --tags
   ```

---

## Part 3: Local Environment Sanity Checks

After rotating keys and cleaning history:
1. Ensure your local `.env` is **never tracked**:
   ```bash
   git status
   ```
   *(Confirm `.env` is listed under "Untracked files" or is completely ignored, and never appears in changes staged for commit).*
2. Verify type safety:
   ```bash
   npx tsc --noEmit
   ```
3. Test your database connection using our verification script:
   ```bash
   npm run verify:db
   ```
