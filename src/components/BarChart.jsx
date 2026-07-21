import React from 'react'

const CHART_H = 128

/**
 * Reusable bar chart component.
 * data      — array of objects
 * valueKey  — key in each object holding the numeric value
 * labelKey  — key in each object holding the x-axis label
 * color     — bar fill color (CSS value, default orange-500)
 * fmt       — optional value formatter for tooltip (defaults to 2-decimal number)
 */
export default function BarChart({ data, valueKey, labelKey, color = '#f97316', fmt }) {
  if (!data || data.length === 0) {
    return <p className="text-slate-500 text-sm text-center py-8">No data</p>
  }
  const vals  = data.map(d => Number(d[valueKey]) || 0)
  const max   = Math.max(...vals, 0.001)
  const hasAny = vals.some(v => v > 0)
  if (!hasAny) {
    return <p className="text-slate-500 text-sm text-center py-8">No data yet today</p>
  }

  const defaultFmt = v => v.toFixed(2)

  return (
    <div className="w-full select-none" style={{ overflowX: 'visible', overflowY: 'visible' }}>
      <div className="overflow-x-auto">
        <div
          className="flex items-end gap-px"
          style={{ height: CHART_H + 'px', minWidth: '100%' }}
        >
          {data.map((d, i) => {
            const val  = Number(d[valueKey]) || 0
            const barH = val > 0 ? Math.max(3, Math.round((val / max) * CHART_H)) : 1
            return (
              <div
                key={i}
                className="group relative flex flex-col justify-end flex-1 min-w-0"
                style={{ height: CHART_H + 'px' }}
              >
                <div
                  className="w-full rounded-t transition-[height] duration-200"
                  style={{
                    height: barH + 'px',
                    backgroundColor: val > 0 ? color : 'rgb(51 65 85 / 0.3)',
                  }}
                />
                {val > 0 && (
                  <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-white text-[9px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                    {fmt ? fmt(val) : defaultFmt(val)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <div className="flex gap-px mt-1" style={{ minWidth: '100%' }}>
          {data.map((d, i) => (
            <div key={i} className="flex-1 min-w-0 text-center">
              <span className="text-slate-600 text-[9px] block truncate leading-tight">
                {d[labelKey]}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
