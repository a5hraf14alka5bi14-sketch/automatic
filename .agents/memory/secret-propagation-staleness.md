---
name: Secret update propagation is stale mid-session
description: Why a secret rotated mid-session can't be validated from the agent's bash/curl, and how to reason about it
---

# Secrets rotated mid-session are stale in the agent environment

When a user updates a Replit Secret (e.g. `GITHUB_TOKEN`) during an agent session,
the **new value does NOT reach**:
- the agent's `bash` tool shell (it captured env at agent-process startup), nor
- reliably the restarted workflow's process tree.

Observed: after two token rotations, `bash` still saw the ORIGINAL pre-rotation
value; `curl` with it kept returning 401. Reading `/proc/<pid>/environ` of the
`node --watch` server tree was **racy** — different process generations held
different values (old vs new fingerprint) and flipped between checks.

**Why:** child processes inherit the parent agent's environment block, fixed at
boot. `restart_workflow` / `node --watch` reloads don't consistently re-read the
platform secret store into that block.

**How to apply:**
- Do NOT try to validate a just-rotated secret by curl-ing from bash — you're
  testing a stale copy. Don't loop on it.
- A 401 from the *pre-rotation* value is actually useful signal: it confirms the
  OLD credential is revoked/dead.
- Fingerprint safely with `sha256sum | cut -c1-16` (never print the raw secret) to
  detect whether env is stale vs fresh.
- To truly validate a new secret's live auth, defer to the app at runtime (it reads
  `process.env` fresh on a clean restart) or a brand-new repl/agent session — not
  the mid-session bash tool.
