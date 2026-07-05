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
