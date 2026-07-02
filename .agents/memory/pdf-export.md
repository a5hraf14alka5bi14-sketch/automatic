---
name: PDF report export
description: How PDF export works in Reports.jsx using jsPDF client-side
---

## Libraries
`jspdf` + `jspdf-autotable` installed as devDependencies. Run client-side — no server binary needed (avoids Puppeteer/Chromium issues on Replit).

## Usage pattern
```js
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
autoTable(doc, { startY: ..., head: [...], body: [...], headStyles: {...}, ... })
doc.lastAutoTable.finalY  // Y position after last table — use to stack tables
doc.save('filename.pdf')
```

## Dark-themed branding
- Background: [15, 23, 42] (slate-950), panel: [30, 41, 59] (slate-800), orange: [249, 115, 22], text: [226, 232, 240]
- Header banner rect drawn manually before tables.

## Data source
Reads from the in-memory `data` state (already fetched from `/api/reports`). The PDF button is disabled while `loading` or when `data` is null.

**Why:** jsPDF is lighter and works without server-side Chromium. The trade-off is the PDF is text/table only (no chart images), which is fine for a financial report.
