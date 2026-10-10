// Loopfarm hosted Pi runtime.
import { configurePi } from "./pi-config.mjs"
import http from "node:http"
import { spawn, execFile } from "node:child_process"
import { promisify } from "node:util"
import { mkdir, readFile, writeFile, stat } from "node:fs/promises"
import { DatabaseSync } from "node:sqlite"
import { createReadStream, readdirSync, readFileSync } from "node:fs"
import { pipeline } from "node:stream/promises"
const exec = promisify(execFile)
let server
let changing = false
await mkdir("/workspace/home", { recursive: true })
await mkdir("/workspace/projects", { recursive: true })
const pause = (ms) => new Promise((r) => setTimeout(r, ms))
async function start() {
  if (server && server.exitCode === null && server.signalCode === null) return
  await mkdir("/workspace/t3/userdata", { recursive: true })
  const settingsPath = "/workspace/t3/userdata/settings.json"
  let settings = {}
  try {
    settings = JSON.parse(await readFile(settingsPath, "utf8"))
  } catch {}
  settings.providerInstances = {
    ...settings.providerInstances,
    pi: { driver: "pi", enabled: true, config: {} },
  }
  await writeFile(settingsPath, JSON.stringify(settings))
  await configurePi(
    "/workspace/home/.pi/agent",
    process.env.LOOPFARM_MODEL_BASE,
    process.env.LOOPFARM_MODEL_KEY,
  )
  let spawnError
  server = spawn(
    "t3",
    [
      "serve",
      "--host",
      "0.0.0.0",
      "--port",
      "3773",
      "--base-dir",
      "/workspace/t3",
      "--auto-bootstrap-project-from-cwd",
      "--no-browser",
    ],
    {
      cwd: "/workspace/projects",
      env: { ...process.env, T3CODE_TELEMETRY_ENABLED: "false" },
      stdio: ["ignore", "ignore", "ignore"],
      detached: true,
    },
  )
  server.on("error", (error) => {
    spawnError = error
  })
  for (let i = 0; i < 120; i++) {
    if (spawnError) throw spawnError
    if (server.exitCode !== null || server.signalCode !== null)
      throw new Error("T3 exited during startup")
    try {
      const response = await fetch("http://127.0.0.1:3773/.well-known/t3/environment", {
        signal: AbortSignal.timeout(2000),
      })
      if (response.ok) return
    } catch {}
    await pause(250)
  }
  throw new Error("T3 startup timed out")
}
function groupAlive(group) {
  for (const pid of readdirSync("/proc").filter((name) => /^\d+$/.test(name))) {
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8")
      const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ")
      if (fields[0] !== "Z" && Number(fields[2]) === group) return true
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ESRCH") throw error
    }
  }
  return false
}
async function stop() {
  if (!server?.pid) return
  if (groupAlive(server.pid)) process.kill(-server.pid, "SIGTERM")
  // The npm launcher can exit before the actual T3 child has flushed SQLite.
  for (let i = 0; i < 150 && groupAlive(server.pid); i++) await pause(100)
  if (groupAlive(server.pid))
    throw new Error("T3 is still shutting down; refusing to save an inconsistent workspace")
}

function busy() {
  // Detached subagents can outlive their parent T3 turn. Do not snapshot or
  // stop their container while a background runner still owns work.
  try {
    for (const pid of readdirSync("/proc").filter((name) => /^\d+$/.test(name))) {
      try {
        const args = readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0")
        if (args.some((arg) => /(?:^|\/)subagent-runner\.(?:js|ts|mjs)$/.test(arg))) return true
      } catch (error) {
        if (error.code !== "ENOENT" && error.code !== "ESRCH") return true
      }
    }
  } catch {
    return true
  }
  let db
  try {
    db = new DatabaseSync("/workspace/t3/userdata/statev2.sqlite", { readOnly: true })
    return (
      Number(
        db
          .prepare(
            "SELECT count(*) AS n FROM orchestration_v2_projection_runs WHERE status IN ('queued','preparing','starting','running','waiting')",
          )
          .get().n,
      ) > 0
    )
  } catch {
    return true
  } finally {
    db?.close()
  }
}
http
  .createServer(async (request, response) => {
    try {
      if (request.url === "/health") {
        response.end("ok")
        return
      }
      if (request.url === "/status") {
        response.setHeader("content-type", "application/json")
        response.end(
          JSON.stringify({
            initialized: !!server,
            running: !!server && server.exitCode === null && server.signalCode === null,
            busy: busy(),
          }),
        )
        return
      }
      if (request.method !== "POST" || changing) {
        response.writeHead(changing ? 409 : 405)
        response.end()
        return
      }
      changing = true
      try {
        if (request.url === "/start") {
          await start()
          response.end("ok")
        } else if (request.url === "/pair") {
          await start()
          const { stdout } = await exec(
            "t3",
            ["pair", "--base-dir", "/workspace/t3", "--ttl", "5m"],
            { maxBuffer: 1024 * 1024, timeout: 20000 },
          )
          const token = stdout.match(/Token:\s*(\S+)/)?.[1]
          if (!token) throw new Error("Could not create pairing credential")
          response.setHeader("content-type", "application/json")
          response.end(JSON.stringify({ token }))
        } else if (request.url === "/backup") {
          if (busy()) {
            response.writeHead(409)
            response.end("Workspace has active jobs")
            return
          }
          await stop()
          await exec("tar", ["-czf", "/tmp/workspace-backup.tar.gz", "-C", "/workspace", "."], {
            timeout: 120000,
          })
          response.setHeader("content-type", "application/gzip")
          response.setHeader("content-length", (await stat("/tmp/workspace-backup.tar.gz")).size)
          await pipeline(createReadStream("/tmp/workspace-backup.tar.gz"), response)
        } else if (request.url === "/restore") {
          if (server) throw new Error("Restore is only allowed before T3 starts")
          // Only the private controller can provide this tenant's own archive.
          const tar = spawn("tar", ["-xzf", "-", "-C", "/workspace"], {
            stdio: ["pipe", "ignore", "pipe"],
          })
          const done = new Promise((resolve, reject) => {
            tar.on("error", reject)
            tar.on("exit", (code) => (code === 0 ? resolve() : reject(new Error("Restore failed"))))
          })
          await pipeline(request, tar.stdin)
          await done
          response.end("ok")
        } else {
          response.writeHead(404)
          response.end()
        }
      } finally {
        changing = false
      }
    } catch (error) {
      console.error(
        "Workspace operation failed:",
        error instanceof Error ? error.message : "unknown error",
      )
      if (!response.headersSent) response.writeHead(500)
      response.end("Workspace operation failed")
    }
  })
  .listen(3838, "0.0.0.0")
