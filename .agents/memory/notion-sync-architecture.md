---
name: Notion sync architecture
description: How the bi-directional Notion sync works and all DS IDs
---

## Notion DS IDs (hardcoded defaults in server/notion.js)
| Entity | DS UUID |
|--------|---------|
| Menu & Recipes | 6f3cf08f-3cdf-472b-807d-b4edc27cc13f |
| Sales | ed84c1af-01a7-4a33-8f8e-835997a04094 |
| Projects | bea6bf0f-16f9-455c-b887-dee7b7cba587 |
| Tasks | 2ea23851-9271-456c-bad7-cfa25fa2683d |
| Inventory | fb57f374-c7dd-4c18-ad3c-c601c96b1f91 |
| Customers | ff5b19de-d827-4818-9bee-cea05375fb21 |
| Suppliers | 918d94de-97d9-4422-ac00-3cc41874d3a5 |
| Purchase Orders | 1976152b-9da3-43df-9d8a-af56818067ef |
| Staff | 7bdb3187-d6e4-425c-aea1-ca16d97474e3 |
| Finance | d3de7e73-bef6-430a-9da7-b8451379d436 |
| Order Items | e3e3a62a-e550-40b5-909f-3fa053597bc3 |
| Recipe Ingredients | 8a2c31ac-5244-43ac-b721-d94338e8ded4 |

## Sync flow
- Pull: Notion → PostgreSQL via REST API (direct fetch, NOT @notionhq/client query)
- Push: PostgreSQL rows WHERE notion_id IS NULL → Notion pages.create
- Upsert: ON CONFLICT (notion_id) for menu_items, inventory, customers

## DB columns added
- menu_items.notion_id VARCHAR(255) UNIQUE
- inventory.notion_id VARCHAR(255) UNIQUE  
- customers.notion_id VARCHAR(255) UNIQUE

## Key design decisions
- @notionhq/client SDK cannot query databases → use direct fetch to /databases/{id}/query
- STATUS stored in Arabic in Notion, mapped to English in PostgreSQL
- getExtendedNotionConfig() returns all 12 DB IDs with hardcoded defaults

## Notion DB fixes applied
- Menu & Recipes: removed "Sales 1" duplicate relation, Gross Profit + Gross Margin % → FORMULA
- Sales: removed "Menu Items" duplicate, removed broken "تراكم" rollup, Customer field → RELATION→Customers
- Projects: Total Tasks → ROLLUP(Tasks, Task, count)
- Inventory: Supplier field → RELATION→Suppliers
- Purchase Orders: Supplier field → RELATION→Suppliers
- Created Recipe Ingredients junction DB (DS: 8a2c31ac)
- Added views: Tasks (Kanban+Calendar), Projects (Kanban), Inventory (Gallery), Menu (Gallery), Customers (Table), PO (Board), Staff (Table)

## Auto-sync cadence preference
- User considers frequent Notion auto-sync "too much" (hammers Notion). Default interval is deliberately **60 min**, not 15.
- **Why:** Notion API rate limits + user feedback on 2026-07-05. Do NOT lower the default without asking.
- **How to apply:** Keep the full dropdown range (5min…24h, min/max bounds 5/1440) so users can opt into faster manually, but the fallback/default everywhere (config, startup restore, API PUT/GET, SyncPanel useState, sync-engine startAutoSync param) stays 60.
