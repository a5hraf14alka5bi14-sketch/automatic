import { useState, useRef, useCallback, useEffect } from 'react'

// Tracks a countdown "cooldown" window used to temporarily disable a button after
// the backend rate-limits a costly integration action (HTTP 429). Call start(seconds)
// with the retry window; `remaining` ticks down to 0 and `cooling` is true meanwhile.
export function useCooldown() {
  const [remaining, setRemaining] = useState(0)
  const timerRef = useRef(null)

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const start = useCallback((seconds) => {
    const secs = Math.max(1, Math.ceil(seconds || 0))
    clear()
    setRemaining(secs)
    timerRef.current = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          clear()
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [clear])

  useEffect(() => clear, [clear])

  return { remaining, cooling: remaining > 0, start }
}
