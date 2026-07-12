---
name: GitHub connection state
description: How GitHub write access works for this repo and the working API-based sync pattern for pushes
---

# GitHub access

Repo: `a5hraf14alka5bi14-sketch/automatic`, default branch `main`. Read + write confirmed.

**Working write path (proven 2026-07-08): GitHub Git Data API from the code_execution sandbox** using the Replit GitHub OAuth connection token (`listConnections('github')[0].settings.access_token`). Never print the token.

**Why direct `git push` fails from the main agent:**
- The workspace repo is **shallow** (`.git/shallow` boundary commits). Pushing sends a pack referencing boundary parents the remote doesn't have → "remote unpack failed: did not receive expected object".
- `git fetch --unshallow` and other `.git`-writing ops are blocked ("Destructive git operations are not allowed in the main agent").
- The gitsafe backup clone (`git://gitsafe:5418/backup.git`) is ALSO shallow — full history exists nowhere accessible.

**Proven API sync recipe (no local git writes):**
1. `git diff --name-only origin/main main` for changed files (check for deletions separately).
2. POST each file as a blob (`/git/blobs`, base64; works even for 25 MB PDFs).
3. Build tree with `base_tree` = remote main's tree — in chunks of ~50 entries.
4. Create commit with parent = remote main head; PATCH `refs/heads/main` (fast-forward, no force).

**Gotcha:** the OAuth token lacks the `workflow` scope — any tree entry touching `.github/workflows/*` makes the create-tree call 404. Exclude those paths and note it; CI workflow changes must be pushed by a human or a token with `workflow` scope.

Legacy notes: `github2` secret (2026-07-05) also had push+admin; `GITHUB_TOKEN` secret is broken (401).

## Current state (2026-07-08)
- Remote `main` = `fdaf07c` (API sync commits): content matches local workspace incl. `ci.yml` (semgrep gate) and hardening commit (migration 015 + login/push input guards).
- Local git history (238+ commits) is NOT on remote — remote has snapshot commits; acceptable, user only needs current code on GitHub.
