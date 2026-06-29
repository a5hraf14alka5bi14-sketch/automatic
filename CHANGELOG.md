# Changelog

All notable changes to Automatic Restaurant OS are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.0.0-beta] — 2026-06-29

### Added — Menu & Recipes Module
- Full Lebanese restaurant menu management page (41 items, 9 categories)
- Lebanese categories: Shawarma 🌯, Grills 🔥, Appetizers 🥙, Salads 🥗, Sandwiches 🥪, Meals 🍱, Manakish 🫓, Desserts 🍮, Drinks 🥤
- Item images (URL), preparation time, tags, food cost fields
- Recipe ingredients system — link menu items to inventory for automatic cost calculation
- Grid and list views with search, category filter, availability filter
- Per-item margin % display with color coding (green ≥70%, yellow ≥50%, red <50%)
- Add/Edit modal with three tabs: Basic Info, Details, Recipe

### Added — Inventory Integration
- **Automatic stock deduction**: completing an order deducts recipe ingredients from inventory
- Re-stock logic: cancelling a previously-completed order restores deducted quantities
- `recipe_ingredients` table with full CRUD API
- Inventory full PATCH (all fields), DELETE, and `PATCH ?adjust=` for relative stock changes
- `GET /api/inventory/stats` and `GET /api/inventory/low-stock` endpoints
- Inventory page: edit modal, delete with FK guard, quick stock-adjust modal, mini stock bars per row

### Added — Profitability Reports
- Food cost tracking per completed order (via recipe → inventory cost chain)
- Gross profit and gross margin % calculations
- Profitability tab: P&L summary, margin gauge, category profitability table
- Menu Performance tab: best sellers by quantity and revenue, category revenue bars
- Stock Alerts tab: low-stock items with percentage-of-minimum indicator
- `categoryPerf`, `topByRevenue`, `lowStock` fields added to reports API

### Improved — POS
- Lebanese category emoji pills (🌯🔥🥙🥗🥪🍱🫓🍮🥤)
- In-cart item count badge on menu cards
- Order type icons (🍴 dine-in, 🥡 takeaway, 🛵 delivery)
- Cart hover-to-remove, clear-order button, animated place-order spinner

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
