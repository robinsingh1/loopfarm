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
