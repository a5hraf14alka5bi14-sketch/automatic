---
name: Shallow-clone push to GitHub is impossible
description: Why force-pushing this workspace's main to a divergent GitHub remote fails, and what does/doesn't fix it.
---

# Pushing a shallow workspace clone to GitHub

This workspace is a **shallow git clone**. `.git/shallow` pins boundary commits
(their parents are absent). The deepest reachable commits from `main` are shallow
roots whose real parent object (one level below the boundary) exists **nowhere**.

**Symptom:** `git push --force origin main` to a divergent GitHub remote fails with
`remote: fatal: did not receive expected object <sha>` / `index-pack failed`. The
`<sha>` is the parent of the shallowest boundary commit. Deepening the graft by one
level just moves the error to the next missing parent down the chain.

**Why it can't be fixed here:**
- GitHub `receive-pack` requires **complete connectivity to a real root**; it does
  **not** accept shallow-graft pushes.
- The missing ancestry exists nowhere accessible:
  - Not locally (that's what "shallow" means).
  - Not on `origin` — the GitHub history is **fully divergent** (0 shared commits,
    empty merge-base, no shared trees). GitHub genuinely lacks the parent object.
  - Not on the `gitsafe-backup` mirror (`git://gitsafe:5418/backup.git`) — it is
    itself shallow, advertises only the current tip, and `--deepen`/`--unshallow`
    return nothing.
  - Fetching the specific missing SHA is refused: `upload-pack: not our ref`.

**What does NOT help:** `--no-thin`, `git fetch --unshallow` (only pulls the
remote's own divergent history), removing `.git/shallow` entries you can't back with
real parent objects.

**The only real fixes (all out of scope for a plain force-push, and they change the
exact SHA):**
- A human with a **full clone** of the true history pushes it.
- Re-root/rewrite the shallow boundary into a genuine root (git replace/graft +
  filter-repo). This changes the boundary commit SHA and cascades up to HEAD, so the
  original HEAD SHA can no longer be preserved — file *content* can be identical, the
  commit SHA cannot.

**Why:** an isolated Replit task agent works in a shallow clone; the pre-boundary
history was never present in the environment and no reachable remote holds it.

**Resolution that worked (fresh single-root push):** to publish the exact current
file state without the missing ancestry, create a parentless commit from HEAD's
tree and force-push it:
`git commit-tree $(git rev-parse HEAD^{tree}) -m "..."` → `git push --force <url>
<newsha>:refs/heads/main`. The tree closure is fully local, so the pack is complete
and GitHub accepts it. Trade-off: the commit SHA is new (HEAD's exact SHA cannot be
preserved), but file *contents* (the tree) are byte-identical.

