# Changelog

All notable changes to Automatic Restaurant OS are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.0.0] — 2026-06-27

### Added
- Full restaurant management dashboard
- Point of Sale (POS) with order creation and checkout
- Order management — dine-in, takeaway, delivery
- Kitchen Display System with live queue
- Inventory tracking with low-stock alerts
- Customer management and loyalty points
- Sales and revenue reports
- JWT authentication with role-based access
- **GitHub integration** — Personal Access Token, repo sync, local `github_repos` table
- **Notion integration** — bidirectional project and task sync, Arabic status mapping
- **OpenAI integration** — GPT-powered AI chat, server-side proxy
- Unified Integrations hub page with connection testing and masked key display
- CI/CD pipeline via GitHub Actions
- `.env.example`, `CONTRIBUTING.md`, `SECURITY.md`, `docs/` folder

### Security
- All third-party API keys stored as environment secrets
- Keys never sent to the browser — all external calls are server-side
- Passwords hashed with bcryptjs (10 salt rounds)

---

## [Unreleased]

### Planned
- QR code menu for table ordering
- Mobile application (Expo)
- Multi-branch support
- AI sales forecasting
- Customer-facing online ordering portal
