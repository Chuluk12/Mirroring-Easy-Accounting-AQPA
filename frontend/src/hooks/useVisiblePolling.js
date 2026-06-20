import { useEffect, useRef } from 'react'

export default function useVisiblePolling(callback, delay, enabled = true, runImmediately = false) {
  const callbackRef = useRef(callback)

  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    if (!enabled || !delay) return undefined

    let intervalId = null

    const stop = () => {
      if (intervalId) {
        clearInterval(intervalId)
        intervalId = null
      }
    }

    const start = () => {
      stop()
      if (document.hidden) return
      if (runImmediately) callbackRef.current()
      intervalId = setInterval(() => {
        callbackRef.current()
      }, delay)
    }

    start()
    document.addEventListener('visibilitychange', start)

    return () => {
      stop()
      document.removeEventListener('visibilitychange', start)
    }
  }, [delay, enabled, runImmediately])
}
