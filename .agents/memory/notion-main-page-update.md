---
name: Notion Main Page Update Strategy
description: How to safely update the 🚀 Automatic Restaurant main Notion page which has embedded databases and child pages
---

When updating the main Notion page (38bb20b8-21e9-8106-b0d7-da20d18e3cb3):
- It has 11 embedded databases (Projects, Tasks, Inventory, Suppliers, Purchase Orders, Menu & Recipes, Sales, Customers, Staff, Finance, Order Items) and 15 child pages
- Use `replace_content` (NOT `update_content`) with all database/page tags preserved in new_str
- Include `<database url="..." inline="..." data-source-url="...">Name</database>` tags for each DB
- Include `<page url="...">Title</page>` tags for each child page
- The `allow_deleting_content: false` flag causes it to fail if you miss any — use this as a safety net
- Fetching the page first to extract the exact embedded tags is essential (use `txt.indexOf('<database')` to find start of embedded section)

**Why:** `update_content` fails if the old_str contains escaped characters like `\~` (Notion's strikethrough escape) — matching is fragile. `replace_content` with all references included is more reliable.

**How to apply:** Every time the main page text needs refreshing, fetch it first, extract the embedded section from `<database` to end of `</content>`, and append that block to the new content string.
