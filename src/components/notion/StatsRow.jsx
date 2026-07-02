import React from 'react'

export default function StatsRow({ projects, tasks }) {
  const pStatus = { not_started: 0, in_progress: 0, done: 0 }
  projects.forEach(p => { if (pStatus[p.status] !== undefined) pStatus[p.status]++ })
  const tStatus = { not_started: 0, in_progress: 0, done: 0 }
  tasks.forEach(t => { if (tStatus[t.status] !== undefined) tStatus[t.status]++ })

  const stats = [
    { label: 'Projects',    value: projects.length,    icon: '📁' },
    { label: 'In Progress', value: pStatus.in_progress, icon: '🔄', color: 'text-blue-400' },
    { label: 'Completed',   value: pStatus.done,        icon: '✅', color: 'text-green-400' },
    { label: 'Total Tasks', value: tasks.length,        icon: '📋' },
    { label: 'Tasks Done',  value: tStatus.done,        icon: '✓',  color: 'text-green-400' },
    { label: 'Pending',     value: tStatus.not_started, icon: '⏳', color: 'text-slate-400' },
  ]

  return (
    <div className="grid grid-cols-3 gap-3 lg:grid-cols-6">
      {stats.map(s => (
        <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
          <div className="text-xl mb-1">{s.icon}</div>
          <div className={`text-2xl font-bold ${s.color || 'text-white'}`}>{s.value}</div>
          <div className="text-slate-500 text-xs mt-0.5">{s.label}</div>
        </div>
      ))}
    </div>
  )
}
