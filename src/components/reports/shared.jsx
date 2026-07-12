import React from 'react'

export const fmtN = (val, dec = 0) => Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })

export const CAT_EMOJI = {
  soups: '🍲', appetizers: '🥟', 'hot-maza': '🍢', 'cold-maza': '🧆',
  grills: '🔥', manakish: '🫓', shawarma: '🌯', sandwiches: '🥪',
  salads: '🥗', desserts: '🍮', drinks: '🥤', 'coffee-tea': '☕', juices: '🧃',
  // legacy categories still present on retired items in historical data
  meals: '🍱', sides: '🍟', pastries: '🥐', seafood: '🦐',
}

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function StatCard({ label, value, sub, color, icon }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-slate-400 text-xs">{label}</p>
        {icon && <span className="text-lg">{icon}</span>}
      </div>
      <p className={`text-2xl font-bold ${color || 'text-white'}`}>{value}</p>
      {sub && <p className="text-slate-500 text-xs mt-1">{sub}</p>}
    </div>
  )
}

export function Bar({ label, value, max, color = 'bg-orange-500', suffix = '' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="text-slate-400 text-sm w-32 truncate">{label}</span>
      <div className="flex-1 bg-slate-800 rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-white text-sm font-medium w-20 text-right">{suffix}{fmtN(value, 2)}</span>
    </div>
  )
}

export function marginColor(pct) {
  if (pct >= 65) return 'text-green-400'
  if (pct >= 45) return 'text-yellow-400'
  return 'text-red-400'
}

export const QUADRANT_STYLE = {
  star:      { label: 'Stars',      emoji: '⭐', color: 'text-green-400',  border: 'border-green-500/30',  bg: 'bg-green-500/10' },
  plowhorse: { label: 'Plowhorses', emoji: '🐴', color: 'text-blue-400',   border: 'border-blue-500/30',   bg: 'bg-blue-500/10'  },
  puzzle:    { label: 'Puzzles',    emoji: '❓', color: 'text-yellow-400', border: 'border-yellow-500/30', bg: 'bg-yellow-500/10'},
  dog:       { label: 'Dogs',       emoji: '🐕', color: 'text-red-400',    border: 'border-red-500/30',    bg: 'bg-red-500/10'  },
}
