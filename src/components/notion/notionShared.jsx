import React from 'react'

export const API = '/api/notion'
export const INT_API = '/api/integrations'

export const STATUS_META = {
  not_started: { label: 'Not Started', ar: 'لم تبدأ', dot: 'bg-slate-400', badge: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
  in_progress:  { label: 'In Progress', ar: 'قيد التنفيذ', dot: 'bg-blue-400',  badge: 'bg-blue-500/15 text-blue-300 border-blue-500/30'  },
  done:         { label: 'Done',        ar: 'تم',         dot: 'bg-green-400', badge: 'bg-green-500/15 text-green-300 border-green-500/30' }
}

export const PRIORITY_META = {
  High:   'text-red-400 bg-red-500/10 border-red-500/20',
  Medium: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  Low:    'text-green-400 bg-green-500/10 border-green-500/20'
}

export function fmt(dateStr) {
  if (!dateStr) return null
  return new Date(dateStr).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function fmtDate(d) {
  if (!d) return null
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.not_started
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border font-medium ${m.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  )
}

export function PriorityBadge({ priority }) {
  if (!priority) return null
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${PRIORITY_META[priority] || 'text-slate-400 border-slate-600'}`}>
      {priority}
    </span>
  )
}

export function StatusSelect({ value, onChange, disabled }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      onClick={e => e.stopPropagation()}
      className="bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-orange-500 disabled:opacity-40 cursor-pointer"
    >
      {Object.entries(STATUS_META).map(([k, v]) => (
        <option key={k} value={k}>{v.label}</option>
      ))}
    </select>
  )
}
