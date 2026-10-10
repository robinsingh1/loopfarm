import { test } from "node:test"
import assert from "node:assert/strict"
import { installSupervisor } from "./jev-supervisor.mjs"

function harness(evaluate, configured = true) {
  const handlers = {},
    sent = [],
    records = []
  const pi = {
    on: (name, fn) => {
      handlers[name] = fn
    },
    registerCommand() {},
    appendEntry: (_, data) => records.push(data),
    sendUserMessage: (text) => sent.push(text),
  }
  const ctx = { mode: "rpc", hasPendingMessages: () => false, ui: { notify() {} } }
  installSupervisor(pi, { evaluate, isConfigured: () => configured })
  handlers.input({ text: "Implement and test the feature", source: "rpc" }, ctx)
  const end = () =>
    handlers.agent_end(
      {
        messages: [
          {
            role: "assistant",
            stopReason: "stop",
            content: [{ type: "text", text: "Implemented" }],
          },
        ],
      },
      ctx,
    )
  return { handlers, ctx, sent, records, end }
}
const result = (value) => ({ answers: { action: { value } } })
test("continue and verify enqueue work; complete and blocked leave the session idle", async () => {
  for (const action of ["continue", "verify", "complete", "blocked"]) {
    const h = harness(async () => result(action))
    await h.end()
    assert.equal(h.sent.length, ["continue", "verify"].includes(action) ? 1 : 0)
    assert.equal(h.records.at(-1).status, action)
  }
})
test("limits automatic continuations and resets only for real user input", async () => {
  const h = harness(async () => result("continue"))
  for (let i = 0; i < 6; i++) {
    await h.end()
    h.handlers.input({ text: "Continue", source: "extension" }, h.ctx)
  }
  assert.equal(h.sent.length, 4)
  h.handlers.input({ text: "Next task", source: "rpc" }, h.ctx)
  await h.end()
  assert.equal(h.sent.length, 5)
})
test("invalid results and service failures never become completion", async () => {
  for (const evaluate of [
    async () => result("bad"),
    async () => {
      throw Error("offline")
    },
  ]) {
    const h = harness(evaluate)
    await h.end()
    assert.equal(h.sent.length, 0)
    assert.match(h.records.at(-1).status, /unavailable/)
  }
})
test("new input invalidates an in-flight judgment", async () => {
  let resolve
  const h = harness(
    () =>
      new Promise((r) => {
        resolve = r
      }),
  )
  const pending = h.end()
  h.handlers.input({ text: "Stop", source: "rpc" }, h.ctx)
  resolve(result("continue"))
  await pending
  assert.equal(h.sent.length, 0)
})
test("unconfigured service, child processes, pending input and aborted turns do not continue", async () => {
  const h = harness(async () => {
    throw Error("must not call")
  }, false)
  await h.end()
  assert.equal(h.records.at(-1).status, "unconfigured")
  h.ctx.mode = "json"
  await h.end()
  h.ctx.mode = "rpc"
  h.ctx.hasPendingMessages = () => true
  await h.end()
  h.ctx.hasPendingMessages = () => false
  await h.handlers.agent_end({ messages: [{ role: "assistant", stopReason: "aborted" }] }, h.ctx)
  assert.equal(h.sent.length, 0)
})
