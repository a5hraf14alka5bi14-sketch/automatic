---
name: Notion select option constraint
description: Why create_pages fails on select/status values and how to add options first
---

Creating Notion pages via MCP `create_pages` (or REST) with a `select`/`status` value that is not already defined in the data source returns `validation_error`: "Invalid select value for property … Value must be one of the following … If a new select option is needed, the data source must be updated to add it." Unlike some Notion clients, the API does **not** auto-create the option.

**How to apply:** Before pushing rows whose select values may be new, first `mcpNotion_notionUpdateDataSource({data_source_id, statements: `ALTER COLUMN "Category" SET SELECT('a':red,'b':green,...)`})`. `ALTER … SET` replaces the whole option set, so include every value you need. Do this only when the target data source has no rows depending on options you'd drop.

**Gotcha:** Notion rejects two select options that differ only by case (e.g. `Vegetables` and `vegetables`) — the ALTER fails silently as a failed status. Match the exact casing the local data uses and drop the conflicting variant.

**Note:** `status`-type options behave the same (not auto-created). Safest to omit `status` on bulk create and let Notion apply its default, unless you know the exact existing option name.
