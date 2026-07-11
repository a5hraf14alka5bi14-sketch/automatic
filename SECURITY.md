# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| 1.0.x | ✅ Yes |

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
- Passwords are hashed with bcryptjs (10 salt rounds)
- JWT tokens are signed with a secret key and expire after 7 days
- Role-based access control (admin vs. staff)
- CORS is configured on the Express server
