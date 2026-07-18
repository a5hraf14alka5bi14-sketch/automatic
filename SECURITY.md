# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| 0.13.x | ✅ Yes |
| < 0.13 | ❌ No |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

To report a security issue, email the maintainer directly or use GitHub's private vulnerability reporting feature (Security → Report a vulnerability).

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

You will receive a response within 72 hours. If confirmed, a patch will be released and you will be credited (unless you prefer anonymity).

## Security Practices

- All API keys are stored as server-side environment secrets
- Keys are never sent to the browser or logged
- Passwords are hashed with bcryptjs (cost factor 12); legacy weaker hashes are upgraded transparently on next login
- JWT access tokens are signed with a secret key and expire after 15 minutes; optional two-factor auth (TOTP) and Replit Auth (OIDC) are also available
- Backend-enforced role-based access control across admin / manager / cashier / kitchen / staff
- CORS is configured and restricted on the Express server
- Automated secret scanning runs pre-commit and in CI (`npm run scan:secrets`)
- Semgrep security ruleset enforced as a CI quality gate
