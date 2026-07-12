---
name: Notion SDK compatibility
description: The installed @notionhq/client lacks databases.query; correct API surface documented here
---

The installed `@notionhq/client` in this project is a Replit-customized build.
It does NOT have `client.databases.query()`. The available namespaces are:
`blocks`, `databases` (retrieve/create/update only), `dataSources` (retrieve/query/create/update/listTemplates), `pages`, `users`, `customEmojis`, `comments`, `fileUploads`, `views`, `search`, `oauth`.

`client.dataSources.query({ data_source_id })` exists but returns empty results unless the integration has direct DB access.

**Why:** Replit uses a newer/custom Notion SDK version that diverges from the public npm package.

**How to apply:** Do not call `client.databases.query()` — it will throw "not a function". For reads, use the MCP server (`mcpNotion_notionQueryDataSources`). For writes/updates, `client.pages.update()` and `client.pages.create()` work fine with direct page IDs.
