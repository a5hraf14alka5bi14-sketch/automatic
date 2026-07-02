---
name: Reports heatmap and trend data
description: /api/reports now returns heatmap and trend arrays in addition to existing KPIs
---

`GET /api/reports?period=...` response now includes two extra keys:

**heatmap**: `[{ dow, hour, orders, revenue }]` — grouped by day-of-week (0=Sun) and hour-of-day; used to render a 7×24 grid in the Heatmap tab.

**trend**: `[{ date, revenue, foodCost, orders, profit }]` — daily totals; used for the Trends tab bars.

**CSV export**: `GET /api/reports/export?period=...&format=csv` — returns UTF-8 CSV with BOM; triggered by the download button in Reports header.

**Why:** Sprint 5 advanced analytics requirement. Queries added to the existing Promise.all in reports.js to avoid extra round trips.

**How to apply:** Always add new analytics queries to the same Promise.all block in `server/routes/reports.js` to keep it a single DB round trip per page load.
