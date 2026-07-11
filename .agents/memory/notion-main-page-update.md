---
name: Notion Main Page Update Strategy
description: How to safely update the 🚀 Automatic Restaurant main Notion page which has embedded databases and child pages
---

When updating the main Notion page (38bb20b8-21e9-8106-b0d7-da20d18e3cb3):
- It has **30 embedded tags = 18 child pages + 12 databases** (as of 2026-07-05). Preserve ALL of them.
- Use `replace_content` (NOT `update_content`) with all database/page tags preserved in new_str
- Include `<database url="..." inline="..." data-source-url="...">Name</database>` tags for each DB
- Include `<page url="...">Title</page>` tags for each child page
- The `allow_deleting_content: false` flag causes it to fail if you miss any — use this as a safety net
- Fetching the page first to extract the exact embedded tags is essential.
- **Fetch shape (MCP):** `res.content[0].text` is a JSON string; parse it and read `.text`. Slice content between `<content>\n` and `\n</content>`, then take from the first `<page url=` to the end — that IS the 30-tag embedded block. Prepend your new narrative markdown and pass the whole thing as `new_str`. A round-trip verify counts 31 `<page`/`<database>` tags because the fetch wraps the whole page in one extra outer `<page>`.
- **Version milestones (v0.x) do NOT live in the Projects/Tasks DBs** — those hold real business/demo data (e.g. "Customer Loyalty Program", "Set up POS system"). Software release history belongs in a "Completed Milestones" table on the main page, not as fabricated DB rows.
- `mcpNotion_notionQueryDataSources` needs `{ data: { data_source_urls:[...], query:"SELECT * FROM \"collection://<id>\" ..." } }` — not a bare data_source_url.

**Why:** `update_content` fails if the old_str contains escaped characters like `\~` (Notion's strikethrough escape) — matching is fragile. `replace_content` with all references included is more reliable.

**How to apply:** Every time the main page text needs refreshing, fetch it first, extract the embedded section from `<database` to end of `</content>`, and append that block to the new content string.

---
## Release Log database (2026-07-05)
Per-release history now lives in a **📦 Release Log** database (data source `collection://e8046695-fe36-4692-8ab3-ae3d4efccbbe`, db page `e81ed09fcd93453388b7fbe6577a604d`) embedded on the **Release Management** child page (`38eb20b821e9815cb105e12b40486960`), NOT on the main page.
- Columns: Version (title), Release Date (date), Summary (text), Type (select Major/Minor/Patch), Status (select Done/In Progress/Planned).
- Append new releases as rows here — no need to touch the main page's 30-tag embedded block. Keep it consistent with the main page's "Completed Milestones" table + CHANGELOG.md.
- The Release Management page was rewritten to real SemVer (v0.9.0–v0.12.0); the old fictional v1.x/v2.x/v3.0 lineage is gone.
- **Automated**: `scripts/sync-release-log.js` (`npm run release:sync-log`) parses CHANGELOG.md and upserts one row per version (Type from SemVer bump, Summary from title + **bold** highlights, Status=Done), skipping versions already present. Idempotent. Documented under "Cutting a Release" in docs/development.md.
- **REST access works here**: unlike the projects/tasks DBs, the REST bot (NOTION_API_KEY) CAN read AND write the Release Log DB via its REST id `e81ed09fcd93453388b7fbe6577a604d` — `/databases/{id}` retrieve, `/databases/{id}/query`, and `POST /pages` all succeed (no MCP needed for this DB).
