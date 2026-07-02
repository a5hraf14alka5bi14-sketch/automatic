import React, { useState } from 'react'
import logo from '../assets/brand/logo-full.png'

const PAPER_PX = { '58mm': '219px', '80mm': '302px' }

function fmt(n, currency) {
  return `${currency} ${parseFloat(n || 0).toFixed(3)}`
}

function Divider({ double }) {
  return (
    <div style={{ borderTop: double ? '2px solid #000' : '1px dashed #999', margin: '6px 0' }} />
  )
}

function CustomerReceipt({ order, settings, currency }) {
  const taxRate = parseFloat(settings?.tax_rate || '11')
  const name = settings?.restaurant_name || 'Automatic'
  const tagline = settings?.restaurant_tagline || 'Restaurant OS'
  const footer = settings?.receipt_footer || 'Thank you for dining with us!'
  const dt = new Date(order.paid_at || order.created_at || Date.now())
  const dateStr = dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const timeStr = dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{ fontFamily: '"Courier New", Courier, monospace', fontSize: 11, color: '#000', lineHeight: 1.5 }}>
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <img src={logo} alt="" style={{ height: 56, width: 'auto', margin: '0 auto 4px', display: 'block' }} />
        <div style={{ fontWeight: 'bold', fontSize: 15, letterSpacing: 1 }}>{name.toUpperCase()}</div>
        <div style={{ fontSize: 10, color: '#555' }}>{tagline}</div>
        <div style={{ fontSize: 10, marginTop: 4 }}>{dateStr} · {timeStr}</div>
      </div>

      <Divider double />

      <div style={{ marginBottom: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <b>Receipt #</b><span>{String(order.id).padStart(5, '0')}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <b>Type</b><span style={{ textTransform: 'capitalize' }}>{order.type}</span>
        </div>
        {order.table_number && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <b>Table</b><span>{order.table_number}</span>
          </div>
        )}
        {order.customer_name && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <b>Customer</b><span>{order.customer_name}</span>
          </div>
        )}
      </div>

      <Divider />

      <div style={{ marginBottom: 6 }}>
        <div style={{ display: 'flex', fontWeight: 'bold', marginBottom: 3, fontSize: 10 }}>
          <span style={{ flex: 1 }}>ITEM</span>
          <span style={{ width: 28, textAlign: 'center' }}>QTY</span>
          <span style={{ width: 70, textAlign: 'right' }}>AMOUNT</span>
        </div>
        {(order.items || []).map((item, i) => (
          <div key={i} style={{ marginBottom: 4 }}>
            <div style={{ display: 'flex' }}>
              <span style={{ flex: 1, paddingRight: 4 }}>{item.name}</span>
              <span style={{ width: 28, textAlign: 'center' }}>{item.quantity}</span>
              <span style={{ width: 70, textAlign: 'right' }}>{fmt(parseFloat(item.price) * item.quantity, currency)}</span>
            </div>
            {Array.isArray(item.modifiers) && item.modifiers.length > 0 && (
              <div style={{ paddingLeft: 8, fontSize: 9, color: '#777' }}>
                {item.modifiers.map((m, mi) => (
                  <span key={mi}>{mi > 0 ? ', ' : ''}{m.name}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <Divider />

      <div style={{ marginBottom: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Subtotal</span><span>{fmt(order.subtotal, currency)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Tax ({taxRate}%)</span><span>{fmt(order.tax, currency)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: 13, marginTop: 4 }}>
          <span>TOTAL</span><span>{fmt(order.total, currency)}</span>
        </div>
        {order.payment_method && (
          <div style={{ marginTop: 4, fontSize: 10, textAlign: 'right', color: '#555' }}>
            Paid by: {order.payment_method.toUpperCase()}
          </div>
        )}
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
        <div style={{ fontSize: 9, color: '#555', marginTop: 2 }}>Scan to verify · #{String(order.id).padStart(5, '0')}</div>
      </div>

      <Divider />
      <div style={{ textAlign: 'center', fontSize: 10, color: '#555' }}>{footer}</div>
    </div>
  )
}

function KitchenReceipt({ order }) {
  const dt = new Date(order.created_at || Date.now())
  const timeStr = dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return (
    <div style={{ fontFamily: '"Courier New", Courier, monospace', fontSize: 13, color: '#000', lineHeight: 1.6 }}>
      <div style={{ textAlign: 'center', marginBottom: 6 }}>
        <div style={{ fontWeight: 'bold', fontSize: 18, letterSpacing: 2 }}>KITCHEN</div>
        <div style={{ fontSize: 11 }}>{timeStr}</div>
      </div>
      <Divider double />
      <div style={{ fontWeight: 'bold', fontSize: 15 }}>Order #{String(order.id).padStart(5, '0')}</div>
      <div style={{ fontSize: 12, textTransform: 'uppercase', marginBottom: 6 }}>
        {order.type}{order.table_number ? ` · TABLE ${order.table_number}` : ''}
      </div>
      <Divider double />
      <div style={{ marginBottom: 6 }}>
        {(order.items || []).map((item, i) => (
          <div key={i} style={{ marginBottom: 4 }}>
            <div style={{ fontWeight: 'bold', fontSize: 14 }}>
              {item.quantity}× {item.name}
            </div>
            {Array.isArray(item.modifiers) && item.modifiers.length > 0 && (
              <div style={{ fontSize: 11, paddingLeft: 16, color: '#444' }}>
                {item.modifiers.map((m, mi) => (
                  <div key={mi}>· {m.name}</div>
                ))}
              </div>
            )}
            {item.notes && (
              <div style={{ fontStyle: 'italic', fontSize: 11, paddingLeft: 16, color: '#333' }}>
                ↳ {item.notes}
              </div>
            )}
          </div>
        ))}
      </div>
      {order.notes && (
        <>
          <Divider />
          <div style={{ fontWeight: 'bold', fontSize: 12 }}>⚠ NOTE: {order.notes}</div>
        </>
      )}
      <Divider double />
      <div style={{ textAlign: 'center', fontSize: 10, color: '#555' }}>— KITCHEN COPY —</div>
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
    style.innerHTML = `
      @media print {
        @page { size: ${safeSize} auto; margin: 4mm; }
        body > * { visibility: hidden !important; }
        #receipt-print-target, #receipt-print-target * { visibility: visible !important; }
        #receipt-print-target {
          position: fixed !important;
          top: 0; left: 0;
          width: ${safeSize};
          background: white;
          padding: 4mm;
        }
      }
    `
    window.addEventListener('afterprint', () => { style.innerHTML = '' }, { once: true })
    window.print()
  }

  const currentReceipt = activeTab === 'customer'
    ? <CustomerReceipt order={order} settings={settings} currency={currency} />
    : <KitchenReceipt order={order} />

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div id="receipt-print-target" style={{ display: 'none', position: 'absolute', width: PAPER_PX[paperSize] }}>
        {currentReceipt}
      </div>

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

        <div className="flex-1 overflow-auto p-5 flex justify-center bg-slate-950/40">
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
