---
name: CI pre-install steps must be dependency-free
description: Why the CI "version sync check" step kept failing and the rule that prevents it recurring
---

# CI steps that run before `npm ci` must not import runtime deps

The CI workflow (`.github/workflows/ci.yml`) runs `secret scan` and
`npm run check:version` (the version-sync release gate) **before** `npm ci`
installs node_modules. Any script executed in those early steps must therefore
import only Node builtins — never anything that transitively pulls in an
installed package.

**The bug this caused:** `scripts/check-version-sync.js` imported
`parseChangelog` from `scripts/sync-release-log.js`, which imports
`../server/db.js` (→ `pg`) and the Notion integration. On CI (deps not yet
installed) this threw `ERR_MODULE_NOT_FOUND: Cannot find package 'pg'`, failing
the version-sync step and skipping every step after it. It passed locally only
because node_modules already existed. This failed on *every* recent CI run.

**The fix / rule:** pure CHANGELOG/version parsing now lives in a
dependency-free module (`scripts/changelog.js`, Node builtins only).
`sync-release-log.js` re-exports it for backward compatibility; the pre-install
tools (`check-version-sync.js`, `set-version.js`) import from it directly.

**How to apply:** before adding/changing any script wired into a CI step that
runs ahead of `npm ci`, verify its full import graph reaches only `node:*`
builtins. Do not import `server/db.js`, integration clients, or anything under
`dependencies`/`devDependencies` from those scripts.

## Related: semgrep WARNING gate blocks CI too

CI runs semgrep at `--severity WARNING --error` over `server src`, so *any*
WARNING finding fails the build. False positives are suppressed with an inline
`// nosemgrep: <full-rule-id> -- <justification>` comment on the line above the
match (the established convention in this repo — see `server/routes/orders.js`,
`server/integrations/sync-engine.js`, `src/utils/countSheet.js`). Because the
version-sync step failed first, the semgrep + test + build steps had not
actually run to green on CI in recent history; validate them locally too.
