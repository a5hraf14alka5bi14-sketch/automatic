# Database Schema Reference

The schema is auto-initialized on server start via `initDb()` in `server/db.js`.

All tables use `CREATE TABLE IF NOT EXISTS` and are safe to re-run.

---

## Core Tables

### `users`
| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| name | VARCHAR(255) | |
| email | VARCHAR(255) UNIQUE | Login identifier |
| password | VARCHAR(255) | bcryptjs hash |
| role | VARCHAR(50) | `admin` or `staff` |
| created_at | TIMESTAMP | |

### `menu_items`
| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| name | VARCHAR(255) | |
| category | VARCHAR(100) | mains, starters, drinks, etc. |
| price | DECIMAL(10,2) | |
| description | TEXT | |
| available | BOOLEAN | Default true |
| created_at | TIMESTAMP | |

### `orders`
| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| type | VARCHAR(50) | `dine-in`, `takeaway`, `delivery` |
| table_number | INTEGER | Nullable |
| status | VARCHAR(50) | `pending`, `preparing`, `ready`, `completed` |
| subtotal | DECIMAL(10,2) | |
| tax | DECIMAL(10,2) | |
| total | DECIMAL(10,2) | |
| customer_id | INTEGER | FK → customers.id (nullable) |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### `order_items`
| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| order_id | INTEGER | FK → orders.id ON DELETE CASCADE |
| menu_item_id | INTEGER | FK → menu_items.id |
| quantity | INTEGER | |
| price | DECIMAL(10,2) | Price at time of order |
| name | VARCHAR(255) | Name at time of order |

### `inventory`
| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| name | VARCHAR(255) | |
| category | VARCHAR(100) | proteins, vegetables, etc. |
| quantity | DECIMAL(10,3) | Current stock |
| unit | VARCHAR(50) | kg, pcs, L, etc. |
| min_quantity | DECIMAL(10,3) | Low-stock threshold |
| cost | DECIMAL(10,2) | Cost per unit |
| created_at / updated_at | TIMESTAMP | |

### `customers`
| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| name | VARCHAR(255) | |
| email | VARCHAR(255) UNIQUE | Nullable |
| phone | VARCHAR(50) | Nullable |
| loyalty_points | INTEGER | Default 0 |
| total_orders | INTEGER | Default 0 |
| created_at | TIMESTAMP | |

---

## Integration Tables

### `settings`
Key/value store for integration configuration overrides.

| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| key | VARCHAR(255) UNIQUE | e.g. `github_token`, `notion_api_key` |
| value | TEXT | |
| updated_at | TIMESTAMP | |

Known keys:
- `github_token` — GitHub PAT override
- `notion_api_key` — Notion key override
- `notion_projects_db` — Notion Projects database ID
- `notion_tasks_db` — Notion Tasks database ID
- `openai_api_key` — OpenAI key override

### `notion_projects`
| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| notion_id | VARCHAR(255) UNIQUE | Notion page UUID |
| notion_url | TEXT | |
| name | VARCHAR(500) | |
| status | VARCHAR(50) | `not_started`, `in_progress`, `done` |
| status_label | VARCHAR(100) | Arabic label |
| priority | VARCHAR(50) | |
| start_date | DATE | |
| due_date | DATE | |
| total_tasks | INTEGER | |
| last_synced | TIMESTAMP | |
| created_at | TIMESTAMP | |

### `notion_tasks`
| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| notion_id | VARCHAR(255) UNIQUE | Notion page UUID |
| notion_url | TEXT | |
| name | VARCHAR(500) | |
| status | VARCHAR(50) | `not_started`, `in_progress`, `done` |
| status_label | VARCHAR(100) | Arabic label |
| priority | VARCHAR(50) | |
| due_date | DATE | |
| project_notion_id | VARCHAR(255) | FK → notion_projects.notion_id |
| last_synced | TIMESTAMP | |
| created_at | TIMESTAMP | |

### `github_repos`
| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| github_id | BIGINT UNIQUE | GitHub's numeric repo ID |
| name | VARCHAR(255) | Repo name |
| full_name | VARCHAR(500) | owner/repo |
| description | TEXT | |
| language | VARCHAR(100) | |
| html_url | TEXT | |
| stars | INTEGER | |
| forks | INTEGER | |
| open_issues | INTEGER | |
| is_private | BOOLEAN | |
| is_fork | BOOLEAN | |
| default_branch | VARCHAR(100) | |
| pushed_at | TIMESTAMP | |
| last_synced | TIMESTAMP | |
| created_at | TIMESTAMP | |
