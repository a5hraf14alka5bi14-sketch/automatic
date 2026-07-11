import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import logo from '../assets/brand/logo-full.png'

const PAPER_PX = { '58mm': '219px', '80mm': '302px' }

function fmt(n, currency) {
  return `${currency} ${parseFloat(n || 0).toFixed(3)}`
}

// Arabic is cursive — applying letter-spacing / uppercase breaks the glyph
// joining and makes the text look disconnected ("متقطع"), so detect it.
const hasArabic = (s) => /[\u0600-\u06FF]/.test(s || '')

function Divider({ double }) {
  return (
    <div style={{ borderTop: double ? '2px solid #000' : '1px dashed #999', margin: '6px 0' }} />
  )
}

// Order type shown centered, bilingual, like the printed sample
function typeLabels(order) {
  const t = order.type
  if (t === 'takeaway' || t === 'take-away') return { en: 'Take Away', ar: 'اسحب واذهب' }
  if (t === 'delivery') return { en: 'Delivery', ar: 'توصيل' }
  return { en: order.table_number ? `Dine In · Table ${order.table_number}` : 'Dine In', ar: order.table_number ? `محلي · طاولة ${order.table_number}` : 'محلي' }
}

function InfoRow({ label, labelAr, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
      <b style={{ whiteSpace: 'nowrap' }}>{label}</b>
      <span style={{ flex: 1, borderBottom: '1px dotted transparent' }} />
      <span style={{ textAlign: 'right' }}>{value}</span>
    </div>
  )
}

function CustomerReceipt({ order, settings, currency }) {
  const taxRate = parseFloat(settings?.tax_rate || '11')
  const name = settings?.restaurant_name || 'Automatic'
  const nameAr = settings?.restaurant_name_ar || 'الأوتوماتيك'
  const legalName = settings?.business_legal_name || ''
  const legalNameAr = settings?.business_legal_name_ar || ''
  const crNo = settings?.business_cr_no || ''
  const taxCard = settings?.business_tax_card || ''
  const phone = settings?.business_phone || ''
  const footer = settings?.receipt_footer || 'THANK YOU & VISIT AGAIN'
  const footerAr = settings?.receipt_footer_ar || ''
  const dt = new Date(order.paid_at || order.created_at || Date.now())
  const dateStr = `${dt.toLocaleDateString('en-GB')}, ${dt.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })}`
  const tl = typeLabels(order)
  const invNo = String(order.id)

  return (
    <div style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 11, color: '#000', lineHeight: 1.45 }}>
      {/* ── Header: logo + business identity ── */}
      <div style={{ textAlign: 'center', marginBottom: 6 }}>
        <img src={logo} alt="" style={{ height: 72, width: 'auto', margin: '0 auto 6px', display: 'block' }} />
        <div dir={hasArabic(name) ? 'rtl' : 'ltr'} style={{ fontWeight: 'bold', fontSize: 16, letterSpacing: hasArabic(name) ? 0 : 2 }}>
          {hasArabic(name) ? name : name.toUpperCase()}
        </div>
        {nameAr && nameAr !== name && <div dir="rtl" style={{ fontSize: 13, fontWeight: 'bold' }}>{nameAr}</div>}
        {legalName && <div style={{ fontWeight: 'bold', fontSize: 11, marginTop: 2 }}>{legalName}</div>}
        {legalNameAr && <div dir="rtl" style={{ fontSize: 11 }}>{legalNameAr}</div>}
        <div style={{ marginTop: 4, fontSize: 10 }}>
          {crNo && <div><b>CR NO:</b> {crNo} <span dir="rtl">· سجل تجاري</span></div>}
          {taxCard && <div><b>Tax Card No:</b> {taxCard}</div>}
          {phone && <div><b>Tel#</b> {phone}</div>}
        </div>
      </div>

      {/* ── TAX INVOICE title ── */}
      <div style={{ textAlign: 'center', margin: '6px 0' }}>
        <div style={{ fontWeight: 'bold', fontSize: 13, letterSpacing: 1 }}>TAX INVOICE</div>
        <div dir="rtl" style={{ fontSize: 11 }}>فاتورة</div>
      </div>

      {/* ── Order type ── */}
      <div style={{ textAlign: 'center', margin: '6px 0' }}>
        <div style={{ fontWeight: 'bold', fontSize: 13 }}>{tl.en}</div>
        <div dir="rtl" style={{ fontSize: 10, color: '#333' }}>{tl.ar}</div>
      </div>

      <Divider double />

      {/* ── Invoice meta ── */}
      <div style={{ marginBottom: 6, fontSize: 11 }}>
        <InfoRow label="Inv No." value={invNo} />
        <InfoRow label="Date" value={dateStr} />
        <InfoRow label="Customer" value={order.customer_name || 'Guest'} />
        {order.table_number && <InfoRow label="Table" value={order.table_number} />}
        {order.payment_method && <InfoRow label="Payment" value={order.payment_method.toUpperCase()} />}
      </div>

      <Divider double />

      {/* ── Items table (bilingual header) ── */}
      <div style={{ marginBottom: 6 }}>
        <div style={{ display: 'flex', fontWeight: 'bold', fontSize: 10, borderBottom: '1px dashed #999', paddingBottom: 3, marginBottom: 4 }}>
          <span style={{ flex: 1 }}>Description<span dir="rtl" style={{ display: 'block', fontWeight: 'normal' }}>الوصف</span></span>
          <span style={{ width: 32, textAlign: 'center' }}>Qty<span dir="rtl" style={{ display: 'block', fontWeight: 'normal' }}>كمية</span></span>
          <span style={{ width: 64, textAlign: 'right' }}>Amount<span dir="rtl" style={{ display: 'block', fontWeight: 'normal' }}>القيمة</span></span>
        </div>
        {(order.items || []).map((item, i) => (
          <div key={i} style={{ marginBottom: 5 }}>
            <div style={{ display: 'flex' }}>
              <span style={{ flex: 1, paddingRight: 4 }}>
                {item.name}
                {item.name_ar ? <span dir="rtl" style={{ display: 'block', fontSize: 10, color: '#333' }}>{item.name_ar}</span> : null}
              </span>
              <span style={{ width: 32, textAlign: 'center' }}>{item.quantity}</span>
              <span style={{ width: 64, textAlign: 'right' }}>{parseFloat(parseFloat(item.price) * item.quantity).toFixed(3)}</span>
            </div>
            {Array.isArray(item.modifiers) && item.modifiers.length > 0 && (
              <div style={{ paddingLeft: 8, fontSize: 9, color: '#555' }}>
                {item.modifiers.map((m, mi) => (
                  <span key={mi}>{mi > 0 ? ', ' : ''}+ {m.name}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <Divider />

      {/* ── Totals (bilingual) ── */}
      <div style={{ marginBottom: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Subtotal <span dir="rtl" style={{ fontSize: 10 }}>(المجموع الفرعي)</span></span>
          <span>{parseFloat(order.subtotal || 0).toFixed(3)}</span>
        </div>
        {parseFloat(order.discount || 0) > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Discount <span dir="rtl" style={{ fontSize: 10 }}>(الخصم)</span></span>
            <span>-{parseFloat(order.discount).toFixed(3)}</span>
          </div>
        )}
        {parseFloat(order.loyalty_discount || 0) > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Loyalty <span dir="rtl" style={{ fontSize: 10 }}>(نقاط الولاء)</span></span>
            <span>-{parseFloat(order.loyalty_discount).toFixed(3)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>VAT {taxRate}% <span dir="rtl" style={{ fontSize: 10 }}>(الضريبة المضافة)</span></span>
          <span>{parseFloat(order.tax || 0).toFixed(3)}</span>
        </div>
        <div style={{ borderTop: '1px dashed #999', borderBottom: '1px dashed #999', margin: '4px 0', padding: '3px 0', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: 13 }}>
          <span>Grand Total <span dir="rtl" style={{ fontSize: 10 }}>(المجموع الاجمالي)</span></span>
          <span>{currency} {parseFloat(order.total || 0).toFixed(3)}</span>
        </div>
      </div>

      <div style={{ textAlign: 'center', margin: '8px 0' }}>
        <img
          src={`https://api.qrserver.com/v1/create-qr-code/?size=72x72&data=${encodeURIComponent(`Order%20%23${order.id}`)}&margin=0&bgcolor=ffffff&color=000000`}
          alt="QR"
          width={72}
          height={72}
          style={{ display: 'inline-block' }}
          onError={e => { e.target.style.display = 'none' }}
        />
        <div style={{ fontSize: 9, color: '#555', marginTop: 2 }}>Scan to verify · Inv No. {invNo}</div>
      </div>

      {/* ── Footer ── */}
      <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: 11 }}>{footer}</div>
      {footerAr && <div dir="rtl" style={{ textAlign: 'center', fontSize: 10 }}>{footerAr}</div>}
    </div>
  )
}

// One KOT ticket per station (kitchen / bar / grill …), like the printed
// sample where drinks print on their own slip for the drinks station.
function KitchenReceipt({ order }) {
  const dt = new Date(order.created_at || Date.now())
  const dateStr = `${dt.toLocaleDateString('en-GB')}, ${dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
  const tl = typeLabels(order)
  const invNo = String(order.id)

  const byStation = {}
  for (const item of (order.items || [])) {
    const st = item.station || 'kitchen'
    if (!byStation[st]) byStation[st] = []
    byStation[st].push(item)
  }
  const stations = Object.keys(byStation)

  return (
    <div style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 12, color: '#000', lineHeight: 1.5 }}>
      {stations.map((st, si) => (
        <div key={st} style={si > 0 ? { borderTop: '2px dashed #000', marginTop: 12, paddingTop: 10 } : undefined}>
          {si > 0 && <div style={{ textAlign: 'center', fontSize: 9, color: '#777', marginTop: -8, marginBottom: 6 }}>✂ — — — — — — — — —</div>}
          <div style={{ textAlign: 'center', marginBottom: 6 }}>
            <div style={{ fontWeight: 'bold', fontSize: 15 }}>{tl.en}</div>
            <div dir="rtl" style={{ fontSize: 10, color: '#333' }}>{tl.ar}</div>
          </div>
          <div style={{ fontSize: 12, marginBottom: 4 }}>
            <div><b>Inv No:</b> {invNo}</div>
            <div><b>KOT:</b> {si + 1}{stations.length > 1 ? ` · ${st.toUpperCase()}` : ''}</div>
            <div><b>Date:</b> {dateStr}</div>
          </div>
          <div style={{ display: 'flex', fontWeight: 'bold', borderTop: '1px solid #000', borderBottom: '1px solid #000', padding: '3px 0', marginBottom: 4 }}>
            <span style={{ flex: 1 }}>Items</span>
            <span style={{ width: 36, textAlign: 'right' }}>Qt.</span>
          </div>
          {byStation[st].map((item, i) => (
            <div key={i} style={{ marginBottom: 6, borderBottom: '1px dashed #bbb', paddingBottom: 4 }}>
              <div style={{ display: 'flex' }}>
                <span style={{ flex: 1, paddingRight: 4 }}>
                  <b style={{ fontSize: 14 }}>{item.name}</b>
                  {item.name_ar ? <span dir="rtl" style={{ display: 'block', fontSize: 12 }}>{item.name_ar}</span> : null}
                </span>
                <span style={{ width: 36, textAlign: 'right', fontWeight: 'bold', fontSize: 14 }}>{item.quantity}</span>
              </div>
              {Array.isArray(item.modifiers) && item.modifiers.length > 0 && (
                <div style={{ fontSize: 11, paddingLeft: 12, color: '#333' }}>
                  {item.modifiers.map((m, mi) => (
                    <div key={mi}>· {m.name}</div>
                  ))}
                </div>
              )}
              {item.notes && (
                <div style={{ fontStyle: 'italic', fontSize: 11, paddingLeft: 12 }}>
                  ↳ {item.notes}
                </div>
              )}
            </div>
          ))}
          {order.notes && (
            <div style={{ fontWeight: 'bold', fontSize: 12, marginTop: 4 }}>⚠ NOTE: {order.notes}</div>
          )}
          {order.rush && (
            <div style={{ fontWeight: 'bold', fontSize: 13, marginTop: 4, textAlign: 'center' }}>★ RUSH — عاجل ★</div>
          )}
        </div>
      ))}
    </div>
  )
}

export default function ReceiptModal({ order, settings, onClose }) {
  const [paperSize, setPaperSize] = useState('80mm')
  const [activeTab, setActiveTab] = useState('customer')
  const currency = settings?.currency_symbol || 'OMR'

  const handlePrint = () => {
    const styleId = '__receipt-print-style'
    let style = document.getElementById(styleId)
    if (!style) {
      style = document.createElement('style')
      style.id = styleId
      document.head.appendChild(style)
    }
    const safeSize = PAPER_PX[paperSize] ? paperSize : '80mm'
    // Hide every other top-level node and let ONLY the receipt render in normal
    // document flow (position: static). A position:fixed/absolute element is
    // clipped to the first printed page by browsers, which cut long receipts
    // off — normal flow lets the receipt paginate across as many pages as it
    // needs. The print target is portaled directly onto <body> so it is a
    // top-level sibling of #root here.
    style.textContent = `
      @media print {
        @page { size: ${safeSize} auto; margin: 4mm; }
        html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
        body > *:not(#receipt-print-target) { display: none !important; }
        #receipt-print-target {
          display: block !important;
          position: static !important;
          width: ${safeSize};
          margin: 0 auto;
          background: #fff;
        }
      }
    `
    window.addEventListener('afterprint', () => { style.textContent = '' }, { once: true })
    window.print()
  }

  const currentReceipt = activeTab === 'customer'
    ? <CustomerReceipt order={order} settings={settings} currency={currency} />
    : <KitchenReceipt order={order} />

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      {createPortal(
        <div id="receipt-print-target" style={{ display: 'none' }}>
          {currentReceipt}
        </div>,
        document.body
      )}

      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md flex flex-col" style={{ maxHeight: '90vh' }}>
        <div className="p-5 border-b border-slate-800 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-white font-bold text-lg">Print Receipt</h2>
            <p className="text-slate-400 text-xs mt-0.5">Order #{String(order.id).padStart(5, '0')}</p>
          </div>
          <div className="flex items-center gap-2">
            {['58mm', '80mm'].map(s => (
              <button key={s} onClick={() => setPaperSize(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${paperSize === s ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
                {s}
              </button>
            ))}
            <button onClick={onClose} className="ml-2 text-slate-500 hover:text-white text-lg leading-none transition-colors">✕</button>
          </div>
        </div>

        <div className="flex border-b border-slate-800 flex-shrink-0">
          {[['customer', '🧾 Customer Copy'], ['kitchen', '👨‍🍳 Kitchen Copy']].map(([k, l]) => (
            <button key={k} onClick={() => setActiveTab(k)}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === k ? 'text-orange-400 border-b-2 border-orange-500' : 'text-slate-500 hover:text-white'}`}>
              {l}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto p-5 flex justify-center items-start bg-slate-950/40">
          <div style={{
            width: PAPER_PX[paperSize],
            background: '#fff',
            padding: '14px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            borderRadius: 2,
            minHeight: 200
          }}>
            {currentReceipt}
          </div>
        </div>

        <div className="p-4 border-t border-slate-800 flex gap-3 flex-shrink-0">
          <button onClick={onClose}
            className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors">
            Close
          </button>
          <button onClick={handlePrint}
            className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2">
            <span>🖨️</span> Print / Save PDF
          </button>
        </div>
      </div>
    </div>
  )
}
