// Printable stocktake count sheet.
//
// jsPDF's built-in fonts cannot render Arabic, and most inventory item names
// are Arabic — so instead of generating a PDF directly, we build a branded,
// print-optimised HTML document and open it in a new window where the browser
// (which shapes Arabic/RTL text natively) handles Print / Save as PDF.

import logoUrl from '../assets/brand/logo-full.png'

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]))

const fmtQty = (v) => {
  const n = parseFloat(v)
  return Number.isFinite(n) ? String(n) : '—'
}

// Pure builder — returns the full HTML document string (testable in jsdom).
export function buildCountSheetHtml(items, { logoSrc = logoUrl, date = new Date() } = {}) {
  const byCategory = new Map()
  for (const item of items) {
    const cat = item.category || 'uncategorized'
    if (!byCategory.has(cat)) byCategory.set(cat, [])
    byCategory.get(cat).push(item)
  }
  const cats = [...byCategory.keys()].sort()

  const sections = cats.map(cat => {
    const rows = byCategory.get(cat)
      .slice()
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'ar'))
      // nosemgrep: config..semgrep.vendored-rules.javascript.lang.security.html-in-template-string -- every interpolated value is escaped via esc() (or the numeric fmtQty), so no untrusted HTML is injected
      .map(item => `
        <tr${item.last_counted_at ? '' : ' class="uncounted"'}>
          <td class="name" dir="auto">${esc(item.name)}${item.last_counted_at ? '' : ' <span class="badge">لم يُجرد ✱</span>'}</td>
          <td class="unit">${esc(item.unit)}</td>
          <td class="num">${fmtQty(item.quantity)}</td>
          <td class="blank"></td>
          <td class="blank"></td>
        </tr>`).join('')
    // nosemgrep: config..semgrep.vendored-rules.javascript.lang.security.html-in-template-string -- only esc()-escaped category name + a numeric count are interpolated here
    return `
      <section>
        <h2>${esc(cat)} <span class="count">(${byCategory.get(cat).length})</span></h2>
        <table>
          <thead>
            <tr>
              <th class="name">الصنف / Item</th>
              <th class="unit">الوحدة</th>
              <th class="num">رصيد النظام</th>
              <th class="blank">العدد الفعلي ✍</th>
              <th class="blank">حد التنبيه ✍</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </section>`
  }).join('')

  const uncounted = items.filter(i => !i.last_counted_at).length
  const d = date.toLocaleDateString('en-GB')

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<title>ورقة جرد المخزون — ${esc(d)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: system-ui, "Segoe UI", Tahoma, sans-serif; color: #111; margin: 24px; font-size: 12px; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 3px solid #f97316; padding-bottom: 12px; margin-bottom: 12px; }
  header img { height: 56px; }
  h1 { font-size: 18px; margin: 0; }
  .meta { color: #555; font-size: 11px; margin-top: 4px; }
  .legend { font-size: 11px; color: #92400e; background: #fef3c7; border: 1px solid #fcd34d; border-radius: 6px; padding: 6px 10px; margin-bottom: 12px; }
  section { break-inside: avoid-page; margin-bottom: 14px; }
  h2 { font-size: 13px; background: #f97316; color: #fff; padding: 4px 10px; border-radius: 6px 6px 0 0; margin: 0; text-transform: capitalize; }
  h2 .count { font-weight: normal; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #d1d5db; padding: 5px 8px; text-align: right; }
  th { background: #f3f4f6; font-size: 11px; }
  td.name { width: 38%; }
  td.unit, th.unit { width: 10%; text-align: center; }
  td.num, th.num { width: 14%; text-align: center; color: #555; }
  td.blank, th.blank { width: 19%; }
  td.blank { background: #fff; }
  tr.uncounted td { background: #fffbeb; }
  .badge { color: #b45309; font-size: 10px; white-space: nowrap; }
  .sign { margin-top: 20px; display: flex; gap: 40px; font-size: 12px; }
  .sign div { flex: 1; border-top: 1px solid #999; padding-top: 6px; }
  @media print { body { margin: 10mm; } .legend { -webkit-print-color-adjust: exact; print-color-adjust: exact; } h2 { -webkit-print-color-adjust: exact; print-color-adjust: exact; } tr.uncounted td { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
<header>
  <div>
    <h1>ورقة جرد المخزون — Stock Count Sheet</h1>
    <div class="meta">التاريخ: ${esc(d)} · عدد الأصناف: ${items.length}${uncounted ? ` · لم يُجرد بعد: ${uncounted}` : ''}</div>
  </div>
  <img src="${esc(logoSrc)}" alt="">
</header>
${uncounted ? '<div class="legend">✱ الصفوف المظللة أصناف لم تُجرد فعليًا من قبل — ابدأ بها. رصيد النظام تقديري.</div>' : ''}
${sections}
<div class="sign">
  <div>اسم العادّ: ________________</div>
  <div>التوقيع: ________________</div>
  <div>التاريخ والوقت: ________________</div>
</div>
</body>
</html>`
}

// Opens the sheet in a new window and triggers the print dialog.
export function printCountSheet(items) {
  const html = buildCountSheetHtml(items)
  const w = window.open('', '_blank')
  if (!w) return false
  w.document.open()
  w.document.write(html)
  w.document.close()
  // Wait for the logo image to load before printing.
  w.onload = () => setTimeout(() => w.print(), 150)
  return true
}
