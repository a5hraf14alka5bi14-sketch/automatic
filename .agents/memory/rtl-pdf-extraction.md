---
name: RTL Arabic PDF table extraction
description: How to reliably extract tabular data from right-to-left Arabic PDFs
---

Extracting tabular data from RTL (Arabic) PDFs.

**Rule:** `pdf-parse` mangles RTL order (reverses glyphs, splits words across lines, concatenates numbers) — do NOT trust it for Arabic table PDFs. Instead use `pdfjs-dist` legacy build (`pdfjs-dist/legacy/build/pdf.mjs`, `getDocument`) and read each glyph's x/y from `item.transform[4]`/`[5]`.

**How to apply:**
- Cluster text items into rows by y-coordinate (tolerance ~3px).
- Identify columns by x-coordinate ranges — numeric columns are language-independent, just sort ascending by x.
- Assemble Arabic name tokens by sorting the token group's x DESCENDING then joining (RTL reading order = rightmost first). This reconstructs correct word order even when a word is split into multiple glyph runs.
- Separate two adjacent Arabic text columns (e.g. ingredient vs dish) by an x-gap threshold between their clusters.
- `useSystemFonts:true` silences some warnings; DOMMatrix/Path2D polyfill warnings under Node are harmless.

**Why:** Two supplier/menu PDFs (price list ~350 items, menu-costing ~74 dishes) extracted with 0 warnings this way after pdf-parse produced garbage. Numbers always came out in consistent x-order; names only correct via descending-x join.

**Note:** These are one-time import libs — uninstall `pdf-parse`/`pdfjs-dist` after extraction so they don't pollute app runtime deps. Keep the extracted JSON so re-import (via `pg` only) stays reproducible without them.
