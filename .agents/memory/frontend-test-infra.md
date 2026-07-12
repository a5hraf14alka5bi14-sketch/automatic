---
name: Frontend test infra (jsdom + testing-library)
description: How React component/hook tests run in this repo's vitest setup.
---

Frontend (React) unit/component tests live in `tests/` alongside the backend
supertest suite and run under the same `vitest run tests/` command.

- Enable a DOM per-file with a top docblock: `// @vitest-environment jsdom`.
  Do NOT set a global test environment in `vite.config.js` — the backend
  integration tests run in the default node env and share the same run.
- Deps: `jsdom`, `@testing-library/react`, `@testing-library/dom` (devDeps).
  `@testing-library/jest-dom` is NOT installed — use plain assertions
  (`el.textContent`, `el.disabled`) instead of `toHaveTextContent`/`toBeDisabled`.
- Use `.test.jsx` extension for JSX test files; `@vitejs/plugin-react`
  transforms them.
- For hooks with timers (e.g. `useCooldown`), use `vi.useFakeTimers()` +
  `renderHook` + `act(() => vi.advanceTimersByTime(...))`.

**Why:** first React test coverage was added for the integration cooldown
(429) warning path; picking per-file jsdom kept the existing node-based
backend suite untouched.

**Full suite runtime / timeout workaround:** the whole `tests/` run takes
~90s and frequently exceeds the agent bash tool's 120s cap → gets killed
with a silent `exit code -1` and no output (piped output buffers, so nothing
flushes on kill). Don't retry the whole run blindly. Instead split the file
list into batches (e.g. `ls tests/*.test.* | awk 'NR%2==...'`) and run each
batch — the DB-heavy e2e files (`e2e-*`, `integration`, `migrate`,
`factory-reset`, `replit-auth`) are the slow ones, so keep them in a smaller
batch. Run with `NODE_OPTIONS="--max-old-space-size=2048"`.

**Cooldown "no red anywhere" tests couple to the whole Integrations page:**
`tests/cooldown-ui.test.jsx` asserts `querySelectorAll(ERROR_STYLE_SELECTORS)`
(matches `text-red-300`/`bg-red-500`/`border-red-500`) is empty across the
full rendered page. Any NEW integration status card that renders a red
"Not configured" badge/StatusDot when its mock field is absent will break
these. **How to apply:** when adding a service to the `/api/integrations`
status shape, also add it (configured:true) to the mock bodies in
cooldown-ui.test.jsx so the page stays all-green during the toast assertions.
