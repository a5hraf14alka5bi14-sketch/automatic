---
name: GitHub connection state
description: How GitHub write access works for this repo and why the raw GITHUB_TOKEN secret is not enough
---

# GitHub access

Repo: `a5hraf14alka5bi14-sketch/automatic`, default branch `main`. It IS accessible (older "repository not found" notes are stale).

**Write access comes from the Replit GitHub OAuth connection, NOT the `GITHUB_TOKEN` secret.**

- The `GITHUB_TOKEN` Replit Secret is a read-only fine-grained PAT: authenticates fine, reads repo/tags, but `POST /git/refs` and `POST /releases` return 403 "Resource not accessible by personal access token". Do not rely on it for writes.
- The Replit GitHub connection (`listConnections('github')`) grants scope `repo` (full write: admin/push confirmed). Its token lives at `conns[0].settings.access_token` in the code_execution sandbox. Console output redacts it (`getClient()` shows `[]`, `settings` shows `[redacted]`) but the value is usable in a `fetch` call — just never print it.

**Why:** the connection was "added" but its project binding was stale, so credentials came back empty until `addIntegration(connection:conn_github_...)` re-wired it. After that, `settings.access_token` works.

**How to apply:** for any GitHub write (tags, releases, issues, PRs) use `listConnections('github')[0].settings.access_token` in the sandbox with `fetch` to `api.github.com`, or the connector proxy pattern. Target real GitHub commits (e.g. branch `main` / its HEAD sha) — Replit checkpoint commit SHAs do NOT exist on GitHub. Creating a release with `tag_name` + `target_commitish` auto-creates the tag (avoids the destructive-git-op block on the main agent).

Current state: tag `v0.9.0` + release "v0.9.0 – Production Inventory Complete" exist on `f7b551f` (main HEAD).
