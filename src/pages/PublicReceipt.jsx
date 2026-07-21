/**
 * Public receipt page — unauthenticated, read-only
 * Route: /receipt/:token
 * Fetches order data via GET /api/public/receipt/:token
 */
import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import logo from '../assets/brand/logo-full.png'

const hasArabic = s => /[\u0600-\u06FF]/.test(s || '')

function fmt(n, currency = 'OMR') {
  return `${currency} ${parseFloat(n || 0).toFixed(3)}`
}

function InfoRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
      <span style={{ color: '#666', fontSize: 12 }}>{label}</span>
      <span style={{ fontWeight: 600, fontSize: 12 }}>{value}</span>
    </div>
  )
}

function Divider({ dashed }) {
  return (
    <div style={{
      borderTop: dashed ? '1px dashed #ccc' : '1px solid #e0e0e0',
      margin: '10px 0'
    }} />
  )
}

export default function PublicReceipt() {
  const { token }   = useParams()
  const [data, setData]   = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) { setError('Invalid receipt link.'); setLoading(false); return }
    fetch(`/api/public/receipt/${encodeURIComponent(token)}`)
      .then(r => {
        if (!r.ok) throw new Error(r.status === 404 ? 'Receipt not found.' : 'Could not load receipt.')
        return r.json()
      })
      .then(d => setData(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#f8f8f8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#888', fontSize: 14 }}>Loading receipt…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: '#f8f8f8', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <span style={{ fontSize: 40 }}>🧾</span>
        <p style={{ color: '#e53e3e', fontWeight: 600 }}>{error}</p>
        <p style={{ color: '#aaa', fontSize: 12 }}>This link may be invalid or expired.</p>
      </div>
    )
  }

  const { order, items, settings, modifiers } = data
  const currency  = settings?.currency_symbol || 'OMR'
  const restName  = settings?.restaurant_name || 'Automatic'
  const restNameAr = settings?.restaurant_name_ar || 'الأوتوماتيك'
  const taxRate   = parseFloat(settings?.tax_rate || '11')
  const vatNo     = settings?.vat_number || ''
  const phone     = settings?.business_phone || ''

  const dt = new Date(order.paid_at || order.created_at)
  const dateStr = dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const timeStr = dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true })

  const typeLabel = order.type === 'delivery' ? 'Delivery · توصيل'
    : order.type === 'takeaway' ? 'Take Away · اسحب واذهب'
    : order.table_number ? `Dine In · Table ${order.table_number}`
    : 'Dine In · محلي'

  return (
    <div style={{ minHeight: '100vh', background: '#f0f0f0', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 32, paddingBottom: 32, fontFamily: 'Arial, Helvetica, sans-serif' }}>

      {/* Receipt card */}
      <div style={{ background: '#fff', width: '100%', maxWidth: 380, borderRadius: 8, boxShadow: '0 4px 24px rgba(0,0,0,0.12)', overflow: 'hidden' }}>

        {/* Orange header band */}
        <div style={{ background: '#f97316', padding: '16px 20px', textAlign: 'center' }}>
          <img src={logo} alt="" style={{ height: 48, width: 'auto', margin: '0 auto 6px', display: 'block', filter: 'brightness(0) invert(1)' }} />
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 16, letterSpacing: 1 }}>
            {hasArabic(restName) ? restName : restName.toUpperCase()}
          </div>
          {restNameAr && restNameAr !== restName && (
            <div dir="rtl" style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>{restNameAr}</div>
          )}
          {phone && <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2 }}>📞 {phone}</div>}
        </div>

        {/* Receipt body */}
        <div style={{ padding: '16px 20px' }}>

          {/* Title */}
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: 1 }}>TAX INVOICE · فاتورة</div>
            {vatNo && <div style={{ color: '#888', fontSize: 11, marginTop: 2 }}>VAT No: {vatNo}</div>}
          </div>

          <Divider />

          {/* Order meta */}
          <InfoRow label="Order / الطلب" value={`#${String(order.id).padStart(5, '0')}`} />
          <InfoRow label="Date / التاريخ" value={dateStr} />
          <InfoRow label="Time / الوقت" value={timeStr} />
          <InfoRow label="Type / النوع" value={typeLabel} />
          {order.customer_name && <InfoRow label="Customer / العميل" value={order.customer_name} />}

          <Divider dashed />

          {/* Items */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: '#888', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>Item</span>
              <span style={{ color: '#888', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>Amount</span>
            </div>
            {items.map((item, i) => {
              const itemMods = (modifiers || []).filter(m => m.order_item_id === item.id)
              return (
                <div key={i} style={{ marginBottom: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, marginRight: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>
                        {item.quantity > 1 && <span style={{ color: '#f97316', fontWeight: 700, marginRight: 4 }}>{item.quantity}×</span>}
                        {item.name}
                      </div>
                      {item.name_ar && hasArabic(item.name_ar) && (
                        <div dir="rtl" style={{ fontSize: 11, color: '#666' }}>{item.name_ar}</div>
                      )}
                      {itemMods.map((m, mi) => (
                        <div key={mi} style={{ fontSize: 10, color: '#888', paddingLeft: 8 }}>
                          + {m.modifier_name}{m.modifier_price > 0 ? ` (+${fmt(m.modifier_price, currency)})` : ''}
                        </div>
                      ))}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>
                      {fmt(parseFloat(item.price) * item.quantity + (itemMods.reduce((s, m) => s + parseFloat(m.modifier_price || 0), 0)), currency)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          <Divider />

          {/* Totals */}
          <InfoRow label="Subtotal / المجموع" value={fmt(order.subtotal, currency)} />
          {parseFloat(order.discount || 0) > 0 && (
            <InfoRow label="Discount / خصم" value={`-${fmt(order.discount, currency)}`} />
          )}
          <InfoRow label={`VAT ${taxRate}% / ض. ق. م`} value={fmt(order.tax, currency)} />
          {parseFloat(order.loyalty_discount || 0) > 0 && (
            <InfoRow label="Loyalty Discount / خصم ولاء" value={`-${fmt(order.loyalty_discount, currency)}`} />
          )}

          <Divider />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>TOTAL / الإجمالي</span>
            <span style={{ fontWeight: 700, fontSize: 18, color: '#f97316' }}>{fmt(order.total, currency)}</span>
          </div>

          {order.payment_method && (
            <div style={{ textAlign: 'center', marginTop: 6, fontSize: 11, color: '#888' }}>
              Paid via {order.payment_method.replace('_', ' ')}
              {order.paid_at ? ` · ${new Date(order.paid_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true })}` : ''}
            </div>
          )}

          <Divider dashed />

          {/* Footer */}
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: '#888', fontSize: 11, margin: '0 0 4px' }}>
              {settings?.receipt_footer || 'THANK YOU & VISIT AGAIN'}
            </p>
            {settings?.receipt_footer_ar && (
              <p dir="rtl" style={{ color: '#888', fontSize: 11, margin: 0 }}>{settings.receipt_footer_ar}</p>
            )}
          </div>
        </div>
      </div>

      {/* Powered-by label */}
      <p style={{ color: '#bbb', fontSize: 11, marginTop: 16 }}>
        Digital receipt · فاتورة رقمية
      </p>
    </div>
  )
}
