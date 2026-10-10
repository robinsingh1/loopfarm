import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import { requestRun } from "./api.ts"
const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})
test("rejects missing identity and unsafe IDs without sending requests", async () => {
  globalThis.fetch = async () => {
    throw new Error("Network must not be used")
  }
  await assert.rejects(requestRun("https://example.com", "run-1", null, "GET"), /Sign in/)
  await assert.rejects(requestRun("https://example.com", "../other", "session", "GET"), /agent ID/)
})
test("sends the supplied session and surfaces server denial", async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://example.com/api/agent/run-1")
    assert.equal(new Headers(options?.headers).get("authorization"), "Bearer session")
    return Response.json({ error: "This account is not approved" }, { status: 403 })
  }
  await assert.rejects(requestRun("https://example.com", "run-1", "session", "GET"), /not approved/)
})
test("starts a run and returns its persisted state", async () => {
  const state = {
    status: "running",
    config: { question: "Test", iterations: 2 },
    findings: [],
    error: null,
  }
  const body = { question: "Test", iterations: 2, intervalSeconds: 300 }
  globalThis.fetch = async (_url, options) => {
    assert.equal(options?.method, "POST")
    assert.deepEqual(JSON.parse(String(options?.body)), body)
    return Response.json(state, { status: 202 })
  }
  assert.deepEqual(await requestRun("https://example.com", "run-1", "session", "POST", body), state)
})
