import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import logoUrl from '../../assets/brand/logo-full.png'

// Cache the logo as a data URL so repeated PDF exports don't re-fetch.
let _logoDataUrl = null
async function getLogoDataUrl() {
  if (_logoDataUrl) return _logoDataUrl
  try {
    const res = await fetch(logoUrl)
    const blob = await res.blob()
    _logoDataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
    return _logoDataUrl
  } catch {
    return null
  }
}

// ── CSV Export ────────────────────────────────────────────────────────────────
export function downloadCSV(period) {
  const url = `/api/reports/export?period=${period}&format=csv`
  const a = document.createElement('a')
  a.href = url
  a.download = `report-${period}-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

// ── PDF Export ────────────────────────────────────────────────────────────────
export async function downloadPDF(data, period, fmtFn) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const periodLabel = { today: 'Today', week: 'Last 7 Days', month: 'This Month' }[period] || period
  const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const dark   = [15,  23,  42]   // slate-950
  const panel  = [30,  41,  59]   // slate-800
  const orange = [249, 115, 22]   // orange-500
  const muted  = [148, 163, 184]  // slate-400
  const light  = [226, 232, 240]  // slate-200

  // Header banner
  doc.setFillColor(...dark)
  doc.rect(0, 0, 210, 38, 'F')

  // Brand logo on a white plate (top-right)
  const logoData = await getLogoDataUrl()
  if (logoData) {
    const props = doc.getImageProperties(logoData)
    const h = 26
    const w = (props.width / props.height) * h
    doc.setFillColor(255, 255, 255)
    doc.roundedRect(210 - w - 12, 6, w + 4, h + 2, 2, 2, 'F')
    doc.addImage(logoData, 'PNG', 210 - w - 10, 7, w, h)
  }

  doc.setTextColor(...orange)
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text('Automatic Restaurant OS', 14, 16)
  doc.setTextColor(...muted)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(`Reports — ${periodLabel}`, 14, 25)
  doc.text(`Generated: ${now}`, 14, 31)

  // KPI Summary table
  autoTable(doc, {
    startY: 44,
    head: [['Metric', 'Value']],
    body: [
      ['Revenue',          fmtFn(data.revenue)],
      ['Total Orders',     String(data.totalOrders  || 0)],
      ['Avg Order Value',  fmtFn(data.avgOrderValue)],
      ['Customers Served', String(data.customersServed || 0)],
      ['Food Cost',        fmtFn(data.totalFoodCost)],
      ['Gross Profit',     fmtFn(data.grossProfit)],
      ['Gross Margin',     `${data.grossMargin || 0}%`],
    ],
    tableWidth: 90,
    headStyles:         { fillColor: panel, textColor: orange, fontStyle: 'bold' },
    bodyStyles:         { fillColor: dark,  textColor: light },
    alternateRowStyles: { fillColor: panel },
    theme: 'grid',
  })

  // Category Profitability
  if (data.categoryPerf?.length > 0) {
    const y1 = doc.lastAutoTable.finalY + 10
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...light)
    doc.text('Category Profitability', 14, y1)
    autoTable(doc, {
      startY: y1 + 4,
      head: [['Category', 'Revenue', 'Food Cost', 'Profit', 'Margin']],
      body: data.categoryPerf.map(c => [
        (c.category || 'Other').charAt(0).toUpperCase() + (c.category || 'Other').slice(1),
        fmtFn(c.revenue),
        fmtFn(c.foodCost),
        fmtFn(c.profit),
        `${c.margin || 0}%`,
      ]),
      headStyles:         { fillColor: panel, textColor: orange, fontStyle: 'bold' },
      bodyStyles:         { fillColor: dark,  textColor: light },
      alternateRowStyles: { fillColor: panel },
      theme: 'grid',
    })
  }

  // Top Menu Items
  if (data.topItems?.length > 0) {
    const y2 = doc.lastAutoTable.finalY + 10
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...light)
    doc.text('Top Menu Items', 14, y2)
    autoTable(doc, {
      startY: y2 + 4,
      head: [['Item', 'Category', 'Qty Sold', 'Revenue']],
      body: data.topItems.slice(0, 10).map(item => [
        item.name,
        item.category || '',
        String(item.totalQty   || 0),
        fmtFn(item.totalRevenue),
      ]),
      headStyles:         { fillColor: panel, textColor: orange, fontStyle: 'bold' },
      bodyStyles:         { fillColor: dark,  textColor: light },
      alternateRowStyles: { fillColor: panel },
      theme: 'grid',
    })
  }

  doc.save(`report-${period}-${new Date().toISOString().slice(0, 10)}.pdf`)
}
