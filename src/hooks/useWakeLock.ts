import { useEffect, useEffectEvent, useRef, useState } from 'react'

type WakeLockState = {
  supported: boolean
  active: boolean
  error: string | null
}

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : '画面保持の取得に失敗しました。'

export const useWakeLock = (enabled: boolean) => {
  const sentinelRef = useRef<WakeLockSentinel | null>(null)
  const [state, setState] = useState<WakeLockState>(() => ({
    supported: typeof navigator !== 'undefined' && 'wakeLock' in navigator,
    active: false,
    error: null,
  }))

  const releaseWakeLock = useEffectEvent(async () => {
    if (!sentinelRef.current) {
      return
    }

    try {
      await sentinelRef.current.release()
    } finally {
      sentinelRef.current = null
      setState((current) => ({
        ...current,
        active: false,
      }))
    }
  })

  const requestWakeLock = useEffectEvent(async () => {
    if (
      !enabled ||
      typeof navigator === 'undefined' ||
      !('wakeLock' in navigator) ||
      document.visibilityState !== 'visible'
    ) {
      return
    }

    if (sentinelRef.current) {
      return
    }

    try {
      const nextSentinel = await navigator.wakeLock.request('screen')
      sentinelRef.current = nextSentinel
      setState({
        supported: true,
        active: true,
        error: null,
      })

      nextSentinel.addEventListener(
        'release',
        () => {
          sentinelRef.current = null
          setState((current) => ({
            ...current,
            active: false,
          }))
        },
        { once: true },
      )
    } catch (error) {
      setState({
        supported: true,
        active: false,
        error: getErrorMessage(error),
      })
    }
  })

  useEffect(() => {
    if (typeof navigator === 'undefined') {
      return
    }

    const supported = 'wakeLock' in navigator

    setState((current) => ({
      ...current,
      supported,
    }))
  }, [])

  useEffect(() => {
    if (!enabled) {
      void releaseWakeLock()
      setState((current) => ({
        ...current,
        error: null,
      }))
      return
    }

    void requestWakeLock()

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void requestWakeLock()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      void releaseWakeLock()
    }
  }, [enabled])

  return state
}
