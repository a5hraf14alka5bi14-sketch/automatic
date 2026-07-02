---
name: Notion components split
description: NotionIntegration.jsx was split into 8 sub-components under src/components/notion/
---

The shared utility file **must** use `.jsx` extension (not `.js`) because it exports React components (StatusBadge, PriorityBadge, StatusSelect). Vite's import analysis plugin rejects JSX syntax in `.js` files.

**Files:**
- `src/components/notion/notionShared.jsx` — constants (STATUS_META, PRIORITY_META), helpers (fmt, fmtDate), atoms (StatusBadge, PriorityBadge, StatusSelect)
- `src/components/notion/ConnectionStatus.jsx`
- `src/components/notion/SyncPanel.jsx`
- `src/components/notion/SettingsPanel.jsx`
- `src/components/notion/ProjectForms.jsx` — exports NewProjectForm + NewTaskForm
- `src/components/notion/GitHubLinkTab.jsx`
- `src/components/notion/RecipeIngredientsTab.jsx`
- `src/components/notion/StatsRow.jsx`

**Why:** Original NotionIntegration.jsx was 1193 lines; split reduces it to ~280 lines and makes each concern independently editable.

**How to apply:** Any new Notion UI sub-component should go under this directory and import shared utilities from `notionShared.jsx`.
