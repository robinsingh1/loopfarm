// Keep the upstream experiment tools, but let Clef own RPC continuations.
// Pin the package version: its agent_end/session_compact handlers auto-resume.
export function installAutoresearch(pi, extension, supervisor) {
  let suspendedTools
  const restoreTools = () => {
    if (suspendedTools) {
      pi.setActiveTools(suspendedTools)
      suspendedTools = undefined
    }
  }
  pi.on("before_agent_start", restoreTools)
  let loggedThisTurn = false
  let measured = false
  let measurement
  pi.on("agent_start", () => {
    loggedThisTurn = false
    measured = false
    measurement = undefined
  })
  pi.on("tool_call", (event, ctx) => {
    if (
      ctx.mode === "rpc" &&
      measured &&
      !loggedThisTurn &&
      !["log_experiment", "read"].includes(event.toolName)
    ) {
      return {
        block: true,
        reason:
          "Record the finished measurement with log_experiment before changing files or running another experiment. Use discard/crash for a failed candidate; keep only passing results.",
      }
    }
  })
  const reject = (text) => ({ content: [{ type: "text", text }], isError: true })
  const inspectOnly = new Set(["", "help", "--help", "-h", "export", "dashboard"])
  extension({
    ...pi,
    registerTool(tool) {
      pi.registerTool({
        ...tool,
        async execute(id, params, signal, onUpdate, ctx) {
          if (ctx.mode !== "rpc") return tool.execute(id, params, signal, onUpdate, ctx)
          if (loggedThisTurn)
            return reject(
              "This turn already logged an experiment. Report the evidence and end your turn so Clef can decide whether to continue. Do not modify more files.",
            )
          if (tool.name === "log_experiment") {
            if (!measured)
              return reject(
                "Call run_experiment before log_experiment. A manually entered metric is not measurement evidence.",
              )
            if (
              params.status === "keep" &&
              (!measurement.passed || measurement.checksPass === false)
            )
              return reject(
                "The measured experiment or its correctness checks failed. Log discard, crash, or checks_failed; do not keep it.",
              )
            if (
              Number.isFinite(measurement?.parsedPrimary) &&
              params.metric !== measurement.parsedPrimary
            )
              return reject(`Use the measured primary metric: ${measurement.parsedPrimary}.`)
          }
          // Upstream aborts at its iteration limit, hiding the final answer from
          // Clef. Keep the limit and disabled tools; allow a final summary instead.
          const toolCtx = tool.name === "log_experiment" ? { ...ctx, abort() {} } : ctx
          const result = await tool.execute(id, params, signal, onUpdate, toolCtx)
          if (tool.name === "run_experiment") {
            measured = Boolean(result.details && typeof result.details.passed === "boolean")
            measurement = result.details
          }
          if (tool.name === "log_experiment" && result.details?.experiment) {
            supervisor.recordResearchExperiment?.({
              recordedExperiments: result.details.state.results.length,
              maxExperiments: result.details.state.maxExperiments,
              experiments: result.details.state.results.map(({ metric, status, description }) => ({
                metric,
                status,
                description,
              })),
              lastMeasurement: measurement,
            })
            loggedThisTurn = true
            suspendedTools = pi.getActiveTools()
            pi.setActiveTools([])
            result.content.push({
              type: "text",
              text: "Hosted checkpoint: report this experiment's measured result and checks, then end your turn. Clef will decide whether another turn is required.",
            })
          }
          return result
        },
      })
    },
    registerCommand(name, command) {
      if (name !== "autoresearch") return pi.registerCommand(name, command)
      pi.registerCommand(name, {
        ...command,
        async handler(args, ctx) {
          restoreTools()
          const text = (args ?? "").trim()
          if (ctx.mode === "rpc") {
            if (["off", "clear", "finalize"].includes(text.toLowerCase())) {
              supervisor.stopResearch()
            } else if (!inspectOnly.has(text.toLowerCase())) {
              supervisor.startResearch(text)
              ctx.ui.notify(
                "Autoresearch uses Clef to review each turn. Continue and Verify queue work; Complete, Blocked, and Paused stop automatic follow-ups. The hosted limit is four follow-ups. No search API key is required.",
                "info",
              )
            }
          }
          return command.handler(args, ctx)
        },
      })
    },
    on(name, handler) {
      pi.on(name, async (event, ctx) => {
        if (ctx.mode === "rpc" && name === "agent_end") {
          // RPC follow-ups can bypass before_agent_start. Restore the tool
          // inventory after the answer, before Clef's queued turn executes.
          restoreTools()
          loggedThisTurn = false
          measured = false
          measurement = undefined
          return
        }
        if (ctx.mode === "rpc" && name === "session_compact") return
        const result = await handler(event, ctx)
        if (ctx.mode === "rpc" && name === "before_agent_start" && result?.systemPrompt) {
          return {
            ...result,
            systemPrompt:
              result.systemPrompt.replace(
                "NEVER STOP until interrupted.",
                "Run one bounded experiment cycle per turn, then report evidence and yield to Clef.",
              ) +
              "\nHosted autoresearch: the user's objective and iteration budget are authoritative. Never reset a segment or increase the budget to evade a limit. After run_experiment and log_experiment, end the turn so Clef can judge the evidence. Do not start an endless loop inside a tool. Complete means the user's bounded objective was met, not that no further optimization is imaginable.",
          }
        }
        return result
      })
    },
  })
}
