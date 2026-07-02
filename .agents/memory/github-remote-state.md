---
name: GitHub remote state
description: origin remote is currently unreachable
---
`git push origin main` fails with "remote: Repository not found" for origin = https://github.com/a5hraf14alka5bi14-sketch/Automatic- (even with GITHUB_TOKEN credential helper).

**Why:** The GitHub repo appears deleted/renamed/made-private, or the token lacks access. Local main is many commits ahead of the last-known origin/main; work is safe locally + on gitsafe-backup remote.

**How to apply:** Before attempting a GitHub sync/push, confirm with the user that the repo exists and the token has access, or update the `origin` remote URL. Do not retry the same failing push.
