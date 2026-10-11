import { test } from "node:test"
import assert from "node:assert/strict"
import { installSupervisor } from "./jev-supervisor.mjs"

function harness(evaluate, configured = true) {
  const handlers = {},
    sent = [],
    records = [],
    notifications = [],
    commands = {}
  const pi = {
    on: (name, fn) => {
      handlers[name] = fn
    },
    registerCommand: (name, command) => { commands[name] = command },
    appendEntry: (_, data) => records.push(data),
    sendUserMessage: (text) => sent.push(text),
  }
  const ctx = {
    mode: "rpc",
    hasPendingMessages: () => false,
    ui: { notify: (message) => notifications.push(message) },
  }
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
  return { handlers, ctx, sent, records, notifications, commands, end }
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

test("decisions explain the next action and safety pauses never claim completion", async () => {
  for (const action of ["continue", "verify", "complete", "blocked"]) {
    const h = harness(async () => ({ answers: { action: { value: action, confidence: 0.85 } } }))
    await h.end()
    assert.match(h.notifications[0], new RegExp(`^Clef decision: ${action}\\n`))
    assert.match(h.notifications[0], /Decision score: 85%/)
  }
  const uncertain = harness(async () => ({
    answers: { action: { value: "blocked", confidence: 0.4 } },
  }))
  await uncertain.end()
  assert.match(uncertain.notifications.find(message => message.startsWith("Clef decision:")), /^Clef decision: paused/)
  assert.match(uncertain.notifications.find(message => message.startsWith("Clef decision:")), /below the 60%/)
  assert.equal(uncertain.sent.length, 0)
  const capped = harness(async () => result("continue"))
  for (let i = 0; i < 5; i++) await capped.end()
  assert.match(capped.notifications.findLast(message => message.startsWith("Clef decision:")), /^Clef decision: paused/)
  assert.match(capped.notifications.findLast(message => message.startsWith("Clef decision:")), /four-follow-up limit/)
})

test("low-confidence continue never queues work", async () => {
  const h = harness(async () => ({ answers: { action: { value: "continue", confidence: 0.4 } } }))
  await h.end()
  assert.equal(h.sent.length, 0)
  assert.match(h.notifications[0], /^Clef decision: paused/)
})

test("progress distinguishes queued, started and ended follow-ups", async () => {
  const h = harness(async () => result("verify"))
  await h.end()
  const states = () => h.notifications.filter(s => s.startsWith("Clef progress: ")).map(s => { const m = / · (\d)\/4 follow-ups requested · (\w+)/.exec(s); return { attempts: Number(m[1]), event: m[2] } })
  assert.equal(states().at(-1).event, "queued")
  assert.equal(states().at(-1).attempts, 1)
  h.handlers.agent_start({}, h.ctx)
  assert.equal(states().at(-1).event, "started")
  await h.end()
  assert.ok(states().some(s => s.event === "finished" && s.attempts === 1))
})
test("off is acknowledged, preserved on session resume, and suppresses follow-ups", async () => {
  const h = harness(async () => result("continue"))
  await h.commands["loopfarm-judge"].handler("off", h.ctx)
  assert.ok(h.notifications.some(s => s.startsWith("Clef progress: Off")))
  await h.end()
  assert.equal(h.sent.length, 0)
  h.ctx.sessionManager = { getEntries: () => [{ type: "custom", customType: "loopfarm-clef-settings", data: { enabled: false } }] }
  h.handlers.session_start({}, h.ctx)
  h.handlers.input({ text: "Another task", source: "rpc" }, h.ctx)
  await h.end()
  assert.equal(h.sent.length, 0)
  await h.commands["loopfarm-judge"].handler("on", h.ctx)
  await h.end()
  assert.equal(h.sent.length, 1)
})
