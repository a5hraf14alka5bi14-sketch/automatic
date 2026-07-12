import React, { useState } from 'react'

export default function ModifierSelectModal({ item, groups, currency, onConfirm, onClose }) {
  const fmtDelta = (d) => {
    const n = parseFloat(d || 0)
    if (n === 0) return ''
    return n > 0 ? ` +${currency} ${n.toFixed(3)}` : ` −${currency} ${Math.abs(n).toFixed(3)}`
  }

  const initSelected = () => {
    const s = {}
    for (const g of groups) {
      s[g.id] = g.required && g.modifiers.length > 0 ? new Set([g.modifiers[0].id]) : new Set()
    }
    return s
  }

  const [selected, setSelected] = useState(initSelected)

  const toggle = (group, modId) => {
    setSelected(prev => {
      const cur = new Set(prev[group.id] || [])
      if (group.max_selections === 1) return { ...prev, [group.id]: new Set([modId]) }
      if (cur.has(modId)) { cur.delete(modId) } else if (cur.size < group.max_selections) { cur.add(modId) }
      return { ...prev, [group.id]: cur }
    })
  }

  const isValid = groups.every(g => !g.required || (selected[g.id] && selected[g.id].size > 0))

  const extraPrice = groups.reduce((sum, g) => {
    for (const modId of (selected[g.id] || [])) {
      const mod = g.modifiers.find(m => m.id === modId)
      if (mod) sum += parseFloat(mod.price_delta || 0)
    }
    return sum
  }, 0)

  const totalPrice = parseFloat(item.price || 0) + extraPrice

  const handleConfirm = () => {
    const mods = []
    for (const g of groups) {
      for (const modId of (selected[g.id] || [])) {
        const mod = g.modifiers.find(m => m.id === modId)
        if (mod) mods.push({ id: mod.id, name: mod.name, price_delta: parseFloat(mod.price_delta || 0), group_name: g.name })
      }
    }
    onConfirm(mods)
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm flex flex-col" style={{ maxHeight: '85vh' }}>
        <div className="p-5 border-b border-slate-800 flex-shrink-0">
          <h2 className="text-white font-bold text-lg">Customize</h2>
          <p className="text-slate-400 text-sm mt-0.5">{item.name}</p>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-5">
          {groups.map(g => (
            <div key={g.id}>
              <div className="flex items-center gap-2 mb-2">
                <p className="text-white font-semibold text-sm">{g.name}</p>
                {g.required
                  ? <span className="text-xs bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded font-medium">Required</span>
                  : <span className="text-xs text-slate-500">Optional</span>}
                {g.max_selections > 1 && <span className="text-xs text-slate-500">· up to {g.max_selections}</span>}
              </div>
              <div className="space-y-1.5">
                {g.modifiers.map(m => {
                  const isSelected = (selected[g.id] || new Set()).has(m.id)
                  const isRadio = g.max_selections === 1
                  return (
                    <button key={m.id} onClick={() => toggle(g, m.id)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm transition-all ${
                        isSelected ? 'bg-orange-500/10 border-orange-500/50 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600'
                      }`}>
                      <div className="flex items-center gap-2.5">
                        <div className={`flex-shrink-0 flex items-center justify-center transition-colors ${
                          isRadio ? 'w-4 h-4 rounded-full border-2' : 'w-4 h-4 rounded border-2'
                        } ${isSelected ? 'border-orange-500 bg-orange-500' : 'border-slate-600'}`}>
                          {isSelected && <div className={isRadio ? 'w-1.5 h-1.5 bg-white rounded-full' : 'text-white text-xs leading-none'}>
                            {isRadio ? null : '✓'}
                          </div>}
                        </div>
                        <span>{m.name}</span>
                      </div>
                      {parseFloat(m.price_delta || 0) !== 0 && (
                        <span className={`text-xs font-medium ${parseFloat(m.price_delta) > 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {fmtDelta(m.price_delta)}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-slate-800 flex gap-3 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors">Cancel</button>
          <button onClick={handleConfirm} disabled={!isValid}
            className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold transition-colors">
            Add · {currency} {totalPrice.toFixed(3)}
          </button>
        </div>
      </div>
    </div>
  )
}
