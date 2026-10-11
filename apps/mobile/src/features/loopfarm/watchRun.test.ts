import assert from "node:assert/strict"
import { test } from "node:test"
import type { Run } from "./api.ts"
import { watchRun } from "./watchRun.ts"

const state: Run = { status: "running", config: null, findings: [], error: null }
function fixture() {
  const requests: {
    signal: AbortSignal
    resolve: (run: Run) => void
    reject: (error: Error) => void
  }[] = []
  const timers: { callback: () => void; delay: number; cancelled: boolean }[] = []
  const seen: Run[] = []
  const errors: unknown[] = []
  const loading: boolean[] = []
  const watcher = watchRun({
    load: (signal) =>
      new Promise<Run>((resolve, reject) => requests.push({ signal, resolve, reject })),
    onRun: (run) => seen.push(run),
    onError: (error) => errors.push(error),
    onRefreshing: (value) => loading.push(value),
    schedule: (callback, delay) => {
      const timer = { callback, delay, cancelled: false }
      timers.push(timer)
      return () => {
        timer.cancelled = true
      }
    },
  })
  return { watcher, requests, timers, seen, errors, loading }
}
test("backgrounding aborts the request, ignores its late result, and foregrounding refreshes", async () => {
  const f = fixture()
  f.watcher.setActive(true)
  f.watcher.setActive(true)
  assert.equal(f.requests.length, 1)
  f.watcher.setActive(false)
  assert.equal(f.requests[0]!.signal.aborted, true)
  f.requests[0]!.resolve(state)
  await Promise.resolve()
  assert.equal(f.seen.length, 0)
  assert.equal(f.timers.length, 0)
  f.watcher.setActive(true)
  f.requests[1]!.resolve(state)
  await Promise.resolve()
  assert.deepEqual(f.seen, [state])
  assert.equal(f.timers[0]!.delay, 5000)
  f.watcher.dispose()
  assert.equal(f.timers[0]!.cancelled, true)
})
test("refresh supersedes stale results and inactive runs poll less frequently", async () => {
  const f = fixture()
  f.watcher.setActive(true)
  const refresh = f.watcher.refresh()
  f.requests[1]!.resolve({ ...state, status: "completed" })
  await refresh
  f.requests[0]!.resolve(state)
  await Promise.resolve()
  assert.equal(f.seen.length, 1)
  assert.equal(f.seen[0]!.status, "completed")
  assert.equal(f.timers[0]!.delay, 30000)
  f.watcher.dispose()
})
test("failures retry while active and disposal suppresses late errors", async () => {
  const f = fixture()
  f.watcher.setActive(true)
  f.requests[0]!.reject(new Error("offline"))
  await Promise.resolve()
  assert.equal(f.errors.length, 1)
  f.timers[0]!.callback()
  assert.equal(f.requests.length, 2)
  f.watcher.dispose()
  f.requests[1]!.reject(new Error("late"))
  await Promise.resolve()
  assert.equal(f.errors.length, 1)
  assert.equal(f.timers.length, 1)
})

test("refresh status stays busy until the current request finishes, including failures", async () => {
  const f = fixture()
  f.watcher.setActive(true)
  assert.equal(f.loading.at(-1), true)
  const refresh = f.watcher.refresh()
  f.requests[0]!.resolve(state)
  await Promise.resolve()
  assert.equal(f.loading.at(-1), true)
  f.requests[1]!.reject(new Error("offline"))
  await refresh
  assert.equal(f.loading.at(-1), false)
  f.timers.at(-1)!.callback()
  assert.equal(f.loading.at(-1), true)
  f.watcher.setActive(false)
  assert.equal(f.loading.at(-1), false)
  f.watcher.dispose()
})
