import React, { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../utils/api.js'
import { useToast  } from '../context/ToastContext.jsx'
import { useLiveEvents } from '../utils/useLiveEvents.js'

const STATUS_META = {
  pending:   { label: 'Pending / انتظار',   dot: 'bg-yellow-500', badge: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  confirmed: { label: 'Confirmed / مؤكد',   dot: 'bg-blue-500',   badge: 'bg-blue-500/15 text-blue-400 border-blue-500/30'   },
  seated:    { label: 'Seated / جالس',      dot: 'bg-green-500',  badge: 'bg-green-500/15 text-green-400 border-green-500/30' },
  cancelled: { label: 'Cancelled / ملغى',   dot: 'bg-slate-500',  badge: 'bg-slate-700/50 text-slate-400 border-slate-600/30' },
  'no-show': { label: 'No-show / لم يحضر', dot: 'bg-red-500',    badge: 'bg-red-500/15 text-red-400 border-red-500/30'       },
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function timeAgo(ts) {
  const m = Math.round((Date.now() - new Date(ts)) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  return `${Math.round(m / 60)}h ago`
}

/* ── Add Reservation Modal ──────────────────────────────────────────────── */
function AddReservationModal({ onClose, onSaved, defaultDate }) {
  const toast = useToast()
  const [form, setForm] = useState({
    customer_name: '', phone: '', party_size: 2,
    reservation_date: defaultDate || today(),
    reservation_time: '19:00',
    table_number: '', notes: '',
  })
  const [saving, setSaving] = useState(false)

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.customer_name.trim()) return toast('Customer name is required', 'error')
    setSaving(true)
    try {
      const r = await apiFetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          party_size: parseInt(form.party_size) || 2,
          table_number: form.table_number ? parseInt(form.table_number) : null,
        }),
      })
      if (!r.ok) {
        const d = await r.json()
        throw new Error(d.error || 'Failed to save')
      }
      const saved = await r.json()
      toast('Reservation added · تمت إضافة الحجز', 'success')
      onSaved(saved)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-white font-bold text-lg">New Reservation · حجز جديد</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl leading-none">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-slate-400 text-xs mb-1">Customer Name *</label>
              <input autoFocus className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" value={form.customer_name}
                onChange={e => set('customer_name', e.target.value)} placeholder="Name / الاسم" required />
            </div>
            <div>
              <label className="block text-slate-400 text-xs mb-1">Phone</label>
              <input className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" value={form.phone}
                onChange={e => set('phone', e.target.value)} placeholder="+968 …" type="tel" />
            </div>
            <div>
              <label className="block text-slate-400 text-xs mb-1">Party Size</label>
              <input className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" value={form.party_size} type="number" min="1" max="100"
                onChange={e => set('party_size', e.target.value)} />
            </div>
            <div>
              <label className="block text-slate-400 text-xs mb-1">Date</label>
              <input className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" type="date" value={form.reservation_date}
                onChange={e => set('reservation_date', e.target.value)} required />
            </div>
            <div>
              <label className="block text-slate-400 text-xs mb-1">Time</label>
              <input className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" type="time" value={form.reservation_time}
                onChange={e => set('reservation_time', e.target.value)} required />
            </div>
            <div>
              <label className="block text-slate-400 text-xs mb-1">Table # (optional)</label>
              <input className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" value={form.table_number} type="number" min="1"
                onChange={e => set('table_number', e.target.value)} placeholder="—" />
            </div>
            <div>
              <label className="block text-slate-400 text-xs mb-1">Notes</label>
              <input className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" value={form.notes}
                onChange={e => set('notes', e.target.value)} placeholder="Allergy, preference…" />
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors">
              {saving ? 'Saving…' : 'Save Reservation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ── Add Waitlist Modal ──────────────────────────────────────────────────── */
function AddWaitlistModal({ onClose, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState({ customer_name: '', phone: '', party_size: 2, quoted_wait: 20, notes: '' })
  const [saving, setSaving] = useState(false)

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.customer_name.trim()) return toast('Customer name is required', 'error')
    setSaving(true)
    try {
      const r = await apiFetch('/api/reservations/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          party_size: parseInt(form.party_size) || 2,
          quoted_wait: parseInt(form.quoted_wait) || null,
        }),
      })
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Failed') }
      const saved = await r.json()
      toast('Added to waitlist · تمت الإضافة للقائمة', 'success')
      onSaved(saved)
    } catch (err) { toast(err.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-white font-bold text-lg">Add to Waitlist · قائمة انتظار</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl leading-none">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-slate-400 text-xs mb-1">Name *</label>
            <input autoFocus className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" value={form.customer_name}
              onChange={e => set('customer_name', e.target.value)} placeholder="Customer name" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 text-xs mb-1">Phone</label>
              <input className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" value={form.phone}
                onChange={e => set('phone', e.target.value)} placeholder="+968 …" />
            </div>
            <div>
              <label className="block text-slate-400 text-xs mb-1">Party Size</label>
              <input className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" type="number" min="1" max="100"
                value={form.party_size} onChange={e => set('party_size', e.target.value)} />
            </div>
            <div>
              <label className="block text-slate-400 text-xs mb-1">Wait (min)</label>
              <input className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" type="number" min="0" max="300"
                value={form.quoted_wait} onChange={e => set('quoted_wait', e.target.value)} />
            </div>
            <div>
              <label className="block text-slate-400 text-xs mb-1">Notes</label>
              <input className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500" value={form.notes}
                onChange={e => set('notes', e.target.value)} placeholder="Special needs…" />
            </div>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors">Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors">
              {saving ? 'Saving…' : 'Add to List'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ── Main Reservations page ─────────────────────────────────────────────── */
export default function Reservations() {
  const toast = useToast()
  const [tab,  setTab]  = useState('reservations')
  const [date, setDate] = useState(today())

  const [reservations, setReservations] = useState([])
  const [waitlist,     setWaitlist]     = useState([])
  const [loading,      setLoading]      = useState(true)
  const [showAddRes,   setShowAddRes]   = useState(false)
  const [showAddWait,  setShowAddWait]  = useState(false)

  const loadReservations = useCallback(async (d) => {
    setLoading(true)
    try {
      const r = await apiFetch(`/api/reservations?date=${d || date}`)
      if (r.ok) setReservations(await r.json())
    } catch (_) {}
    finally { setLoading(false) }
  }, [date])

  const loadWaitlist = useCallback(async () => {
    try {
      const r = await apiFetch('/api/reservations/waitlist')
      if (r.ok) setWaitlist(await r.json())
    } catch (_) {}
  }, [])

  useEffect(() => {
    loadReservations(date)
    loadWaitlist()
  }, [date])

  useLiveEvents(() => {
    loadReservations(date)
    loadWaitlist()
  }, ['reservation_created', 'reservation_updated', 'waitlist_updated'])

  async function updateStatus(id, status) {
    try {
      const r = await apiFetch(`/api/reservations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!r.ok) { const d = await r.json(); throw new Error(d.error) }
      setReservations(prev => prev.map(rv => rv.id === id ? { ...rv, status } : rv))
      toast(`Marked as ${status}`, 'success')
    } catch (err) { toast(err.message, 'error') }
  }

  async function updateWaitlistStatus(id, status) {
    try {
      const r = await apiFetch(`/api/reservations/waitlist/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!r.ok) { const d = await r.json(); throw new Error(d.error) }
      setWaitlist(prev => prev.filter(w => w.id !== id))
      toast(status === 'seated' ? 'Party seated · تم التجليس' : 'Removed from waitlist', 'success')
    } catch (err) { toast(err.message, 'error') }
  }

  const isToday = date === today()
  const active  = reservations.filter(r => !['cancelled','no-show'].includes(r.status))
  const past    = reservations.filter(r =>  ['cancelled','no-show'].includes(r.status))

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Reservations · الحجوزات</h1>
          <p className="text-slate-400 text-sm mt-0.5">Manage table bookings and walk-in waitlist</p>
        </div>
        <button
          onClick={() => tab === 'reservations' ? setShowAddRes(true) : setShowAddWait(true)}
          className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-2">
          <span>+</span>
          {tab === 'reservations' ? 'New Reservation' : 'Add Walk-in'}
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-slate-800 mb-5">
        {[['reservations','📅 Reservations'], ['waitlist','⏳ Waitlist']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 ${
              tab === k ? 'text-orange-400 border-orange-500' : 'text-slate-500 border-transparent hover:text-white'
            }`}>
            {l}
            {k === 'waitlist' && waitlist.length > 0 && (
              <span className="ml-1.5 bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {waitlist.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Reservations tab ──────────────────────────────────────────────── */}
      {tab === 'reservations' && (
        <div className="space-y-5">
          {/* Date picker row */}
          <div className="flex items-center gap-3">
            <input
              type="date" value={date}
              onChange={e => setDate(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
            />
            <div className="flex gap-2">
              {[0,1,2].map(d => {
                const dd = new Date(); dd.setDate(dd.getDate() + d)
                const val = dd.toISOString().slice(0,10)
                const lbl = d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : dd.toLocaleDateString('en-GB',{weekday:'short'})
                return (
                  <button key={d} onClick={() => setDate(val)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      date === val ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}>
                    {lbl}
                  </button>
                )
              })}
            </div>
            <span className="text-slate-500 text-xs ml-auto">
              {active.length} active · {reservations.length} total
            </span>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_,i) => <div key={i} className="h-16 bg-slate-900 rounded-xl animate-pulse" />)}
            </div>
          ) : reservations.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-4xl mb-3">📅</p>
              <p className="text-white font-semibold">No reservations for {isToday ? 'today' : date}</p>
              <p className="text-slate-500 text-sm mt-1">لا توجد حجوزات لهذا اليوم</p>
              <button onClick={() => setShowAddRes(true)}
                className="mt-4 px-5 py-2 bg-orange-500 text-white rounded-xl text-sm font-semibold">
                Add First Reservation
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {[...active, ...past].map(res => {
                const meta = STATUS_META[res.status] || STATUS_META.pending
                const [h, m] = (res.reservation_time || '00:00').split(':')
                const hNum = parseInt(h)
                const timeLabel = `${hNum > 12 ? hNum - 12 : hNum || 12}:${m} ${hNum >= 12 ? 'PM' : 'AM'}`

                return (
                  <div key={res.id}
                    className={`bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-4 ${
                      ['cancelled','no-show'].includes(res.status) ? 'opacity-50' : ''
                    }`}>
                    {/* Time + dot */}
                    <div className="text-center w-14 flex-shrink-0">
                      <p className="text-white font-bold text-sm">{timeLabel}</p>
                      <div className={`w-2 h-2 rounded-full mx-auto mt-1 ${meta.dot}`} />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-semibold text-sm">{res.customer_name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${meta.badge}`}>
                          {STATUS_META[res.status]?.label.split(' / ')[0]}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                        <span>👥 {res.party_size}</span>
                        {res.table_number && <span>🪑 Table {res.table_number}</span>}
                        {res.phone && <span>📞 {res.phone}</span>}
                        {res.notes && <span className="truncate max-w-[120px]">📝 {res.notes}</span>}
                      </div>
                    </div>

                    {/* Actions */}
                    {!['seated','cancelled','no-show'].includes(res.status) && (
                      <div className="flex gap-1.5 flex-shrink-0 flex-wrap justify-end">
                        {res.status === 'pending' && (
                          <button onClick={() => updateStatus(res.id, 'confirmed')}
                            className="px-2.5 py-1.5 bg-blue-500/15 border border-blue-500/30 text-blue-400 rounded-lg text-xs font-medium hover:bg-blue-500/25 transition-colors">
                            Confirm
                          </button>
                        )}
                        <button onClick={() => updateStatus(res.id, 'seated')}
                          className="px-2.5 py-1.5 bg-green-500/15 border border-green-500/30 text-green-400 rounded-lg text-xs font-medium hover:bg-green-500/25 transition-colors">
                          Seat
                        </button>
                        <button onClick={() => updateStatus(res.id, 'no-show')}
                          className="px-2.5 py-1.5 bg-red-500/15 border border-red-500/30 text-red-400 rounded-lg text-xs font-medium hover:bg-red-500/25 transition-colors">
                          No-show
                        </button>
                        <button onClick={() => updateStatus(res.id, 'cancelled')}
                          className="px-2.5 py-1.5 bg-slate-700/50 border border-slate-600/30 text-slate-400 rounded-lg text-xs font-medium hover:bg-slate-700 transition-colors">
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Waitlist tab ──────────────────────────────────────────────────── */}
      {tab === 'waitlist' && (
        <div className="space-y-3">
          {waitlist.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-4xl mb-3">⏳</p>
              <p className="text-white font-semibold">Waitlist is empty</p>
              <p className="text-slate-500 text-sm mt-1">لا أحد في قائمة الانتظار</p>
              <button onClick={() => setShowAddWait(true)}
                className="mt-4 px-5 py-2 bg-orange-500 text-white rounded-xl text-sm font-semibold">
                Add Walk-in Party
              </button>
            </div>
          ) : (
            waitlist.map((w, i) => (
              <div key={w.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-4">
                {/* Position */}
                <div className="w-8 h-8 bg-orange-500/20 rounded-full flex items-center justify-center text-orange-400 text-xs font-bold flex-shrink-0">
                  {i + 1}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm">{w.customer_name}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                    <span>👥 {w.party_size}</span>
                    {w.phone && <span>📞 {w.phone}</span>}
                    {w.quoted_wait && <span>⏱ ~{w.quoted_wait} min wait</span>}
                    <span>{timeAgo(w.joined_at)}</span>
                  </div>
                  {w.notes && <p className="text-slate-500 text-xs mt-1 truncate">📝 {w.notes}</p>}
                </div>

                {/* Actions */}
                <div className="flex gap-1.5 flex-shrink-0">
                  <button onClick={() => updateWaitlistStatus(w.id, 'seated')}
                    className="px-3 py-1.5 bg-green-500/15 border border-green-500/30 text-green-400 rounded-lg text-xs font-medium hover:bg-green-500/25 transition-colors">
                    Seat
                  </button>
                  <button onClick={() => updateWaitlistStatus(w.id, 'removed')}
                    className="px-3 py-1.5 bg-red-500/15 border border-red-500/30 text-red-400 rounded-lg text-xs font-medium hover:bg-red-500/25 transition-colors">
                    Remove
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Modals */}
      {showAddRes && (
        <AddReservationModal
          defaultDate={date}
          onClose={() => setShowAddRes(false)}
          onSaved={res => {
            setReservations(prev => [...prev, res].sort((a,b) => a.reservation_time.localeCompare(b.reservation_time)))
            setShowAddRes(false)
          }}
        />
      )}
      {showAddWait && (
        <AddWaitlistModal
          onClose={() => setShowAddWait(false)}
          onSaved={w => {
            setWaitlist(prev => [...prev, w])
            setShowAddWait(false)
          }}
        />
      )}
    </div>
  )
}
