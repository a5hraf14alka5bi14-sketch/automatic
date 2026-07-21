import { useEffect, useRef } from 'react'
import { subscribeMessages } from './wsClient.js'

/**
 * Subscribe to the shared WebSocket singleton for the lifetime of the component.
 * `onEvent(msg)` is called for every incoming message (or only for the listed
 * `types` when that array is provided). Reconnection is handled by wsClient.js.
 */
export function useLiveEvents(onEvent, types = null) {
  const handlerRef = useRef(onEvent)
  handlerRef.current = onEvent
  const typesRef = useRef(types)
  typesRef.current = types

  useEffect(() => {
    return subscribeMessages((msg) => {
      const t = typesRef.current
      if (t && !t.includes(msg.type)) return
      handlerRef.current?.(msg)
    })
  }, [])
}

/** Debounce helper — prevents refetch storms when several events fire quickly. */
export function useDebouncedCallback(fn, delay = 800) {
  const fnRef   = useRef(fn)
  fnRef.current = fn
  const timerRef = useRef(null)

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  return useRef((...args) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      fnRef.current(...args)
    }, delay)
  }).current
}
