---
name: Notion REST Sync Module
description: server/integrations/notion.js uses native fetch directly to Notion API v1, bypassing SDK databases.query limitation.
---

# Notion REST Sync Module

## The Rule
Use native `fetch` to `https://api.notion.com/v1` for ALL read operations (databases.query).
The `@notionhq/client` SDK `pages.create` and `pages.update` still work fine and are used in `server/notion.js`.

**Why:** The installed SDK version does not expose `databases.query`. Notion REST API v1 with `Notion-Version: 2022-06-28` header works directly via fetch.

## How to Apply
- Reading from Notion DB → use `queryDatabase(dbId)` in `server/integrations/notion.js`
- Creating/updating pages → use SDK via `server/notion.js` (`createTaskInNotion`, `updateTaskStatusInNotion`, etc.)
- Token resolution: `getNotionToken()` → calls `getNotionConfig()` from `server/notion.js` → DB setting `notion_api_key` > env `NOTION_API_KEY`

## Field Mapping
Project pages: title in `Project` or `Name` field, status via `status.name`, select via `select.name`
Task pages: title in `Task` or `Name`, relation to project via `relation[0].id`
Arabic status values mapped: لم تبدأ→not_started, قيد التنفيذ→in_progress, تم→done

## Pagination
`queryDatabase()` loops with `start_cursor` until `has_more` is false. Page size: 100.
