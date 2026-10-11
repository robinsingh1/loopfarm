import { test } from "node:test"
import assert from "node:assert/strict"
import { installAutoresearch } from "./autoresearch-bridge.mjs"

test("RPC yields to Clef while terminal autoresearch keeps its native resume handlers", async () => {
  const handlers = {},
    commands = {},
    starts = []
  let resumes = 0,
    stops = 0,
    calls = 0
  installAutoresearch(
    { on: (n, f) => (handlers[n] = f), registerCommand: (n, c) => (commands[n] = c) },
    (pi) => {
      pi.on("agent_end", () => resumes++)
      pi.on("session_compact", () => resumes++)
      pi.on("before_agent_start", () => ({ systemPrompt: "NEVER STOP until interrupted." }))
      pi.registerCommand("autoresearch", { handler: () => calls++ })
    },
    { startResearch: (text) => starts.push(text), stopResearch: () => stops++ },
  )
  const ctx = { mode: "rpc", ui: { notify() {} } }
  await commands.autoresearch.handler("optimize with two experiments", ctx)
  assert.deepEqual(starts, ["optimize with two experiments"])
  await handlers.agent_end({}, ctx)
  await handlers.session_compact({}, ctx)
  assert.equal(resumes, 0)
  const prompt = await handlers.before_agent_start({}, ctx)
  assert.doesNotMatch(prompt.systemPrompt, /NEVER STOP/)
  assert.match(prompt.systemPrompt, /one bounded experiment cycle/)
  for (const command of ["help", "export", "dashboard"])
    await commands.autoresearch.handler(command, ctx)
  assert.equal(starts.length, 1)
  await commands.autoresearch.handler("off", ctx)
  assert.equal(stops, 1)
  assert.equal(calls, 5)
  ctx.mode = "interactive"
  await handlers.agent_end({}, ctx)
  await handlers.session_compact({}, ctx)
  assert.equal(resumes, 2)
  assert.equal(
    (await handlers.before_agent_start({}, ctx)).systemPrompt,
    "NEVER STOP until interrupted.",
  )
})

test("experiments require measured metrics, yield after logging, and retain final Clef review", async () => {
  const handlers = {},
    tools = {}
  let active = ["bash", "run_experiment"]
  let aborts = 0,
    logs = 0
  installAutoresearch(
    {
      on: (n, fn) => (handlers[n] = fn),
      registerTool: (t) => (tools[t.name] = t),
      getActiveTools: () => active,
      setActiveTools: (value) => (active = value),
    },
    (pi) => {
      pi.on("agent_end", () => {})
      pi.registerTool({
        name: "run_experiment",
        execute: async () => ({
          content: [],
          details: { exitCode: 0, passed: true, parsedPrimary: 42 },
        }),
      })
      pi.registerTool({
        name: "log_experiment",
        execute: async (_id, _p, _s, _u, ctx) => {
          logs++
          ctx.abort()
          return { content: [], details: { experiment: { metric: 42 } } }
        },
      })
    },
    {},
  )
  const ctx = { mode: "rpc", abort: () => aborts++ }
  const run = (name, params = {}) => tools[name].execute("id", params, undefined, undefined, ctx)
  assert.equal((await run("log_experiment", { metric: 42 })).isError, true)
  await run("run_experiment")
  assert.equal((await run("log_experiment", { metric: 99 })).isError, true)
  const result = await run("log_experiment", { metric: 42 })
  assert.equal(logs, 1)
  assert.equal(aborts, 0)
  assert.match(result.content.at(-1).text, /end your turn/)
  assert.equal((await run("run_experiment")).isError, true)
  assert.deepEqual(active, [])
  await handlers.agent_end({}, ctx)
  assert.deepEqual(active, ["bash", "run_experiment"])
  handlers.agent_start()
  assert.equal((await run("log_experiment", { metric: 42 })).isError, true)
  ctx.mode = "interactive"
  await run("log_experiment", { metric: 42 })
  assert.equal(aborts, 1)
})
