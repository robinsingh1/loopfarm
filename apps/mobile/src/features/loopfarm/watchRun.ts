import type { Run } from "./api"

// A watcher owns one request at a time. Backgrounding or disposing it also
// invalidates responses from transports that do not honor AbortSignal.
export function watchRun(options: {
  load: (signal: AbortSignal) => Promise<Run>
  onRun: (run: Run) => void
  onError: (error: unknown) => void
  onRefreshing?: (refreshing: boolean) => void
  schedule?: (callback: () => void, delay: number) => () => void
}) {
  const schedule =
    options.schedule ??
    ((callback, delay) => {
      const timer = setTimeout(callback, delay)
      return () => clearTimeout(timer)
    })
  let active = false
  let disposed = false
  let generation = 0
  let controller: AbortController | undefined
  let cancelTimer: (() => void) | undefined
  function cancel() {
    generation++
    controller?.abort()
    options.onRefreshing?.(false)
    cancelTimer?.()
    cancelTimer = undefined
  }
  async function refresh() {
    cancel()
    if (!active || disposed) return
    const current = generation
    controller = new AbortController()
    options.onRefreshing?.(true)
    let delay = 30000
    try {
      const run = await options.load(controller.signal)
      if (current !== generation) return
      options.onRun(run)
      if (run.status === "running" || run.operation) delay = 5000
    } catch (error) {
      if (current === generation) options.onError(error)
    } finally {
      if (current === generation) options.onRefreshing?.(false)
      if (current === generation && active && !disposed)
        cancelTimer = schedule(() => void refresh(), delay)
    }
  }
  return {
    refresh,
    setActive(value: boolean) {
      if (active === value || disposed) return
      active = value
      if (active) void refresh()
      else cancel()
    },
    dispose() {
      disposed = true
      cancel()
    },
  }
}
