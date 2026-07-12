# Contributing to Automatic Restaurant OS

Thank you for your interest in contributing!

## Development Setup

1. Fork the repository and clone your fork
2. Copy `.env.example` to `.env` and fill in the required values
3. Run `npm install`
4. Start the dev server: `npm run dev`

## Branch Strategy

| Branch | Purpose |
|---|---|
| `main` | Production-ready code — protected |
| `dev` | Active development base |
| `feature/xyz` | New features |
| `fix/xyz` | Bug fixes |
| `docs/xyz` | Documentation only |

Always branch from `dev`, not `main`.

## Commit Messages

Use conventional commits:

```
feat: add customer loyalty export
fix: correct tax calculation on split bills
docs: update integration setup guide
chore: bump dependencies
```

## Pull Requests

1. Keep PRs focused — one feature or fix per PR
2. Fill in the PR template completely
3. Ensure `npm run build` passes with no errors
4. Reference any related issues with `Closes #NNN`

## Code Style

- Plain JSX (no TypeScript)
- Tailwind CSS for all styling — no custom CSS files
- One page per file in `src/pages/`
- Server routes in `server/routes/`
- Third-party API clients in `server/integrations/`
- **Secrets must never reach the browser** — all external API calls go through the Express backend

## Reporting Issues

Use the GitHub issue templates:
- 🐛 [Bug report](.github/ISSUE_TEMPLATE/bug_report.md)
- 💡 [Feature request](.github/ISSUE_TEMPLATE/feature_request.md)
