---
name: Receipt / KOT thermal format
description: Bilingual TAX INVOICE + per-station KOT design decisions and test gotcha
---

- Customer receipt is a bilingual (EN+AR) TAX INVOICE matching the restaurant's real thermal printer output; business identity (CR no, tax card, phone, legal names AR/EN, Arabic footer) comes from settings keys (`business_*`, `restaurant_name_ar`, `receipt_footer_ar`) — new settings keys must be added to BOTH the route DEFAULTS allowlist and `settingsUpdateSchema`.
- KOT (kitchen ticket) prints one slip per `item.station`, no prices. Station is derived CLIENT-side at order time from menu category (`stationForCategory`: drinks/coffee-tea/juices → 'drinks', else 'kitchen') because menu items have no station column.
- **Why:** matches the restaurant's real printer setup where drinks print on a separate slip; server accepts arbitrary station strings and KDS station filter auto-discovers new stations from data.
- Test gotcha: ReceiptModal renders the active receipt TWICE (hidden print target + visible preview), so text-count assertions in jsdom tests must expect doubled matches.
