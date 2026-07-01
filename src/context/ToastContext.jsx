import React, { createContext, useContext, useState, useCallback } from 'react'

const ToastCtx = createContext(null)
let uid = 0

const STYLES = {
  success: { bar: 'bg-green-500',  bg: 'bg-green-500/15 border-green-500/30',   text: 'text-green-300',  icon: '✓' },
  error:   { bar: 'bg-red-500',    bg: 'bg-red-500/15 border-red-500/30',       text: 'text-red-300',    icon: '✕' },
  warning: { bar: 'bg-yellow-500', bg: 'bg-yellow-500/15 border-yellow-500/30', text: 'text-yellow-300', icon: '⚠' },
  info:    { bar: 'bg-blue-500',   bg: 'bg-blue-500/15 border-blue-500/30',     text: 'text-blue-300',   icon: 'ℹ' },
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => setToasts(p => p.filter(t => t.id !== id)), [])

  const showToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = ++uid
    setToasts(p => [...p.slice(-4), { id, message, type }])
    if (duration > 0) setTimeout(() => dismiss(id), duration)
  }, [dismiss])

  return (
    <ToastCtx.Provider value={showToast}>
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(110%); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
      {children}
      <div
        className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none"
        style={{ maxWidth: 360 }}
      >
        {toasts.map(t => {
          const s = STYLES[t.type] || STYLES.info
          return (
            <div
              key={t.id}
              className={`flex items-start gap-3 p-3.5 rounded-xl border ${s.bg} shadow-2xl backdrop-blur-md pointer-events-auto`}
              style={{ animation: 'toastIn 0.25s cubic-bezier(0.34,1.56,0.64,1) both' }}
            >
              <span className={`flex-shrink-0 w-5 h-5 rounded-full ${s.bar} flex items-center justify-center text-white text-[10px] font-black mt-0.5`}>
                {s.icon}
              </span>
              <p className={`flex-1 text-sm leading-snug ${s.text}`}>{t.message}</p>
              <button
                onClick={() => dismiss(t.id)}
                className="flex-shrink-0 text-slate-500 hover:text-slate-300 text-xs mt-0.5 leading-none transition-colors"
              >✕</button>
            </div>
          )
        })}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastCtx)
  if (!ctx) return () => {}
  return ctx
}
