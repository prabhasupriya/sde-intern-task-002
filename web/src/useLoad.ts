import { useCallback, useEffect, useState } from 'react'
import { errorMessage } from './api'

export type LoadState<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: T; refreshing: boolean; refreshError: string | null }

// Loads data when the component appears, and again when `load` changes or `reload()` is called.
//
// - A newer load cancels the older one, so a slow old answer can never overwrite a new one.
// - When data is reloaded after a change, the old data stays on screen. If that reload fails,
//   the old data stays and `refreshError` tells the person, instead of the page going blank.
export function useLoad<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' })
  const [version, setVersion] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const isReload = version > 0

    setState((previous) =>
      previous.status === 'success' && isReload
        ? { ...previous, refreshing: true, refreshError: null }
        : { status: 'loading' },
    )

    load(controller.signal).then(
      (data) => {
        if (controller.signal.aborted) return
        setState({ status: 'success', data, refreshing: false, refreshError: null })
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        const message = errorMessage(error)
        setState((previous) =>
          previous.status === 'success'
            ? { ...previous, refreshing: false, refreshError: message }
            : { status: 'error', message },
        )
      },
    )

    return () => controller.abort()
  }, [load, version])

  const reload = useCallback(() => setVersion((current) => current + 1), [])
  return { state, reload }
}
