# System Architecture

## Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (React 18)                   │
│   Dashboard · POS · Orders · Kitchen · Inventory ···    │
│                     port 5000 (Vite)                    │
└────────────────────────┬────────────────────────────────┘
                         │ REST API (JSON)
                         ▼
┌─────────────────────────────────────────────────────────┐
│               Express Backend (Node.js ESM)             │
│                     port 3001                           │
│                                                         │
│  /api/auth          JWT authentication                  │
│  /api/menu          Menu items CRUD                     │
│  /api/orders        Order management                    │
│  /api/inventory     Stock tracking                      │
│  /api/customers     Customer profiles                   │
│  /api/dashboard     Aggregated stats                    │
│  /api/reports       Sales & revenue reports             │
│  /api/notion        Notion project/task sync            │
│  /api/integrations  GitHub · Notion · OpenAI hub        │
└──────┬───────────────────────┬──────────────────────────┘
       │                       │
       ▼                       ▼
┌──────────────┐    ┌──────────────────────────────────────┐
│  PostgreSQL  │    │     External APIs (server-side only)  │
│              │    │                                        │
│  users       │    │  api.github.com   ← GITHUB_TOKEN      │
│  orders      │    │  api.notion.com   ← NOTION_API_KEY    │
│  inventory   │    │  api.openai.com   ← OPENAI_API_KEY    │
│  customers   │    │                                        │
│  settings    │    └──────────────────────────────────────┘
│  github_repos│
│  notion_*    │
└──────────────┘
```

## Security Boundary

API keys for GitHub, Notion, and OpenAI are only accessed inside the Express process. The React frontend never receives or stores these keys — it calls `/api/integrations/*` endpoints which proxy the external requests server-side.

## Data Flow — Notion Sync

```
Agent (MCP)
    │
    │ mcpNotion_notionQueryDataSources (full workspace access)
    ▼
Notion Workspace
    │
    │ rows (projects / tasks)
    ▼
POST /api/notion/projects/ingest
POST /api/notion/tasks/ingest
    │
    │ upsert
    ▼
PostgreSQL (notion_projects, notion_tasks)
    │
    │ READ
    ▼
React UI ←── GET /api/notion/projects
              GET /api/notion/tasks

Status updates (UI → Notion):
React UI → PUT /api/notion/tasks/:id/status
              → client.pages.update() via REST API
```

Note: The Notion REST API key does not have direct database-query access (databases must be shared with the integration in the Notion UI). The MCP server has full workspace access through a different auth path and is used for bulk sync reads.

## Data Flow — GitHub Sync

```
Click "Sync repos" in UI
    │
    POST /api/integrations/github/sync
    │
    │ fetch /user/repos (paginated)   ← GITHUB_TOKEN
    ▼
GitHub API
    │
    │ repo metadata
    ▼
PostgreSQL (github_repos) — upsert on github_id
    │
    GET /api/integrations/github/repos
    ▼
React UI (repo list)
```

## Authentication

JWT tokens are issued on login, stored in `localStorage`, and sent as `Authorization: Bearer <token>` headers. Tokens are signed with `SESSION_SECRET` and expire after 7 days. The server validates tokens on protected routes.
