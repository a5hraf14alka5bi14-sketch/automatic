/**
 * SupportTicketButton — floating "Need help?" button visible on every
 * authenticated page.  Opens a slide-up panel where any logged-in user can
 * submit a support ticket.  Admin/manager users also see a "View all tickets"
 * link that opens the Support Tickets tab inside Settings.
 */

import React, { useState } from 'react'
import { apiFetch } from '../utils/api.js'

const TOPICS = [
  'Order Issue',
  'Payment Problem',
  'Technical Support',
  'Menu Inquiry',
  'Staff Concern',
  'Inventory / Stock',
  'Other',
]

const SUPPORT_CONTACTS = [
  { label: 'Operations Manager', number: '+968 9X00 0001' },
  { label: 'Technical Support',  number: '+968 9X00 0002' },
  { label: 'Head Office',        number: '+968 2X00 0003' },
]

export default function SupportTicketButton({ user }) {
  const [open,       setOpen]       = useState(false)
  const [submitted,  setSubmitted]  = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState('')

  const [form, setForm] = useState({
    topic:   '',
    name:    user?.name  || '',
    phone:   '',
    details: '',
  })

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const reset = () => {
    setForm({ topic: '', name: user?.name || '', phone: '', details: '' })
    setError('')
    setSubmitted(false)
  }

  const handleOpen = () => { reset(); setOpen(true) }
  const handleClose = () => { setOpen(false); setSubmitted(false) }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.topic || !form.name.trim() || !form.details.trim()) {
      setError('Please fill in all required fields.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const r = await apiFetch('/api/support', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      if (r.ok) {
        setSubmitted(true)
      } else {
        const d = await r.json().catch(() => ({}))
        setError(d.error || 'Submission failed. Please try again.')
      }
    } catch {
      setError('Network error. Please try again.')
    }
    setSubmitting(false)
  }

  const isManager = user?.role === 'admin' || user?.role === 'manager'

  return (
    <>
      {/* ── Floating trigger button ─────────────────────────────────────── */}
      <button
        onClick={handleOpen}
        aria-label="Open support ticket form"
        className="fixed bottom-20 right-4 md:bottom-6 z-30 flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 hover:text-white text-xs font-medium px-3 py-2 rounded-full shadow-lg transition-all hover:scale-105 active:scale-95"
      >
        <span className="text-sm leading-none">💬</span>
        <span className="hidden sm:inline">Need help?</span>
      </button>

      {/* ── Slide-up panel overlay ──────────────────────────────────────── */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          onClick={e => { if (e.target === e.currentTarget) handleClose() }}
        >
          <div className="absolute inset-0 bg-black/60" onClick={handleClose} />
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-800 flex-shrink-0">
              <div>
                <h2 className="text-white font-bold text-base">Support Request</h2>
                <p className="text-slate-500 text-xs mt-0.5">طلب دعم فني</p>
              </div>
              <button onClick={handleClose} className="text-slate-500 hover:text-white text-xl w-8 h-8 flex items-center justify-center transition-colors">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {submitted ? (
                <div className="p-6 text-center space-y-3">
                  <div className="text-4xl">✅</div>
                  <p className="text-white font-semibold">Ticket submitted!</p>
                  <p className="text-slate-400 text-sm">تم إرسال الطلب — We'll look into it shortly.</p>
                  {isManager && (
                    <a
                      href="/settings"
                      onClick={handleClose}
                      className="inline-block mt-2 text-orange-400 hover:text-orange-300 text-sm underline transition-colors"
                    >
                      View all tickets in Settings →
                    </a>
                  )}
                  <button
                    onClick={handleClose}
                    className="mt-2 w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm transition-colors"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="p-4 space-y-3">
                  {/* Topic */}
                  <div>
                    <label className="block text-slate-300 text-xs font-medium mb-1">
                      Topic <span className="text-red-400">*</span>
                      <span className="text-slate-600 mr-1"> · الموضوع</span>
                    </label>
                    <select
                      value={form.topic}
                      onChange={e => setField('topic', e.target.value)}
                      required
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                    >
                      <option value="">Select a topic…</option>
                      {TOPICS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>

                  {/* Name */}
                  <div>
                    <label className="block text-slate-300 text-xs font-medium mb-1">
                      Your Name <span className="text-red-400">*</span>
                      <span className="text-slate-600 mr-1"> · الاسم</span>
                    </label>
                    <input
                      type="text" value={form.name} onChange={e => setField('name', e.target.value)}
                      required maxLength={120} placeholder="Full name"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                    />
                  </div>

                  {/* Phone */}
                  <div>
                    <label className="block text-slate-300 text-xs font-medium mb-1">
                      Phone Number
                      <span className="text-slate-600 mr-1"> · رقم الهاتف</span>
                      <span className="text-slate-600">(optional)</span>
                    </label>
                    <input
                      type="tel" value={form.phone} onChange={e => setField('phone', e.target.value)}
                      maxLength={40} placeholder="+968 XXXX XXXX"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                    />
                  </div>

                  {/* Details */}
                  <div>
                    <label className="block text-slate-300 text-xs font-medium mb-1">
                      Details <span className="text-red-400">*</span>
                      <span className="text-slate-600 mr-1"> · التفاصيل</span>
                    </label>
                    <textarea
                      value={form.details} onChange={e => setField('details', e.target.value)}
                      required minLength={5} maxLength={2000} rows={3}
                      placeholder="Describe the issue in detail…"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500 resize-none"
                    />
                  </div>

                  {error && (
                    <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
                  )}

                  <button
                    type="submit" disabled={submitting}
                    className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors"
                  >
                    {submitting ? 'Submitting…' : 'Submit Ticket · إرسال'}
                  </button>
                </form>
              )}

              {/* Support contacts */}
              <div className="px-4 pb-5">
                <p className="text-slate-600 text-xs font-medium mb-2 uppercase tracking-wide">Direct Contact · تواصل مباشر</p>
                <div className="space-y-1.5">
                  {SUPPORT_CONTACTS.map(c => (
                    <div key={c.label} className="flex items-center justify-between">
                      <span className="text-slate-500 text-xs">{c.label}</span>
                      <a href={`tel:${c.number.replace(/\s/g, '')}`}
                        className="text-orange-400 hover:text-orange-300 text-xs font-medium transition-colors">
                        {c.number}
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
