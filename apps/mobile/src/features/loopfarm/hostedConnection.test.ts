import assert from "node:assert/strict"
import { test } from "node:test"
import { isHostedWorkspace } from "./hostedConnection.ts"

test("only the saved hosted origin is reused for cloud pairing", () => {
  assert.equal(isHostedWorkspace({ displayUrl: "https://loopfarm-t3.robin-345.workers.dev" }), true)
  assert.equal(
    isHostedWorkspace({ displayUrl: "https://loopfarm-t3.robin-345.workers.dev/" }),
    true,
  )
  for (const displayUrl of [
    "",
    "not a URL",
    "http://loopfarm-t3.robin-345.workers.dev",
    "https://loopfarm-t3.robin-345.workers.dev.other.test",
    "https://other.test",
  ])
    assert.equal(isHostedWorkspace({ displayUrl }), false)
})

import { requestHostedWorkspace, reconnectHostedWorkspace } from "./hostedConnection.ts"

test("temporary cold-start failures retry, while authentication errors do not", async () => {
  let calls = 0
  const request = async () => {
    calls++
    return calls === 1
      ? new Response("starting", { status: 503 })
      : Response.json({ pairingUrl: "https://loopfarm-t3.robin-345.workers.dev/pair#token=test" })
  }
  await requestHostedWorkspace(
    "https://example.test",
    "test",
    new AbortController().signal,
    request,
    async () => {},
  )
  assert.equal(calls, 2)
  calls = 0
  await assert.rejects(
    requestHostedWorkspace(
      "https://example.test",
      "test",
      new AbortController().signal,
      async () => {
        calls++
        return Response.json({ error: "Sign in" }, { status: 401 })
      },
      async () => {},
    ),
    /Sign in/,
  )
  assert.equal(calls, 1)
})

test("accepted retry with no connection repairs saved pairing; healthy reconnect keeps it", async () => {
  for (const connected of [true, false]) {
    let repaired = 0,
      waits = 0
    await reconnectHostedWorkspace({
      reuseSaved: true,
      retry: async () => true,
      repair: async () => {
        repaired++
        return true
      },
      waitConnected: async () => ++waits > 1 || connected,
      onRepair() {},
    })
    assert.equal(repaired, connected ? 0 : 1)
  }
})

test("pairing acknowledgment without a live connection fails rather than reporting success", async () => {
  await assert.rejects(
    reconnectHostedWorkspace({
      reuseSaved: false,
      retry: async () => true,
      repair: async () => true,
      waitConnected: async () => false,
      onRepair() {},
    }),
    /did not connect/,
  )
})
