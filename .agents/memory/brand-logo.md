---
name: Brand logo / branding assets
description: Where the restaurant logo assets live and how they're used on the dark theme
---

# Restaurant logo assets

The official logo is a color Lebanese-food mark (red food-dome + fork, green spoon, Arabic
"الأوتوماتيك اللبناني" + "مأكولات لبنانية", English "Food LEBANESE"). Source is an Adobe
Illustrator PDF the user uploaded; rendered to PNG with `pdftoppm -r 600` + ImageMagick trim.

- `src/assets/brand/logo-full.png` — full color on white bg. This is the one imported by React
  components (Login, Sidebar, Dashboard, ReceiptModal, NotionIntegration) and the Reports PDF export.
- `src/assets/brand/logo.png` — transparent-background variant (white removed). Not currently
  wired into components; kept for flexibility.
- `public/` holds `favicon.png`, `favicon.ico`, `logo.png`, `logo-full.png`.

**Why the white-plate treatment:** the logo contains black text ("الأوتوماتيك") and a black brush
stroke that vanish on the slate-950 dark theme. Instead of recoloring the brand, every dark-UI
placement wraps the logo in a white rounded container (`bg-white rounded-* ring-1 ring-white/10`)
so all brand colors stay accurate. Print/PDF surfaces (receipt, Reports PDF) are on white paper so
the logo is used directly.

**How to apply:** reuse `logo-full.png` + a white plate for any new dark-theme placement. For
jsPDF, load via a cached `getLogoDataUrl()` (fetch→blob→FileReader dataURL) and `doc.addImage`;
`downloadPDF` is async because of this.
