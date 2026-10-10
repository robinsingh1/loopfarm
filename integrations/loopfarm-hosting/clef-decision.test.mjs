import test from "node:test"
import assert from "node:assert/strict"
import { normalizeDecision } from "./clef-decision.mjs"
import { ClefClient } from "./clef-client.mjs"
const answer = (choice, probabilities) => ({ answers: { action: { choice, probabilities } } })
test("Clef choices use a bounded confidence threshold", () => {
  for (const action of ["continue", "verify", "complete", "blocked"]) {
    const probabilities = Object.fromEntries(
      ["continue", "verify", "complete", "blocked"].map((key) => [
        key,
        key === action ? 0.85 : 0.05,
      ]),
    )
    assert.equal(normalizeDecision(answer(action, probabilities)).answers.action.value, action)
  }
  assert.equal(
    normalizeDecision(
      answer("complete", { continue: 0.2, verify: 0.2, complete: 0.4, blocked: 0.2 }),
    ).answers.action.value,
    "blocked",
  )
})
test("malformed or inconsistent decisions are not accepted", () => {
  for (const result of [
    null,
    {},
    answer("unknown", {}),
    answer("complete", { complete: 1 }),
    answer("complete", { continue: 0.9, verify: 0.05, complete: 0.05, blocked: 0 }),
    answer("complete", { continue: 1, verify: 1, complete: 1, blocked: 1 }),
  ])
    assert.throws(() => normalizeDecision(result))
})
test("gateway client forwards cancellation and workspace auth without a TypeSafe credential", async () => {
  const original = globalThis.fetch
  try {
    const signal = new AbortController().signal
    globalThis.fetch = async (url, init) => {
      assert.equal(url, "https://workspace.example/model/decision")
      assert.equal(init.headers.authorization, "Bearer test-workspace-key")
      assert.equal(init.signal, signal)
      assert.deepEqual(JSON.parse(init.body), { state: { request: "test" } })
      return Response.json({ answers: { action: { value: "verify" } } })
    }
    const client = new ClefClient("https://workspace.example/model", "test-workspace-key")
    assert.equal(client.isConfigured(), true)
    assert.equal(
      (await client.evaluate({ state: { request: "test" } }, signal)).answers.action.value,
      "verify",
    )
    globalThis.fetch = async () => new Response("Unavailable", { status: 502 })
    await assert.rejects(client.evaluate({ state: {} }, signal), /502/)
  } finally {
    globalThis.fetch = original
  }
})
