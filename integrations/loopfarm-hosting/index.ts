import { completionQuestions, normalizeDecision } from "./clef-decision.mjs"
import { DurableObject, WorkerEntrypoint } from "cloudflare:workers"
interface Env {
  WORKSPACES: DurableObjectNamespace<T3Workspace>
  BACKUPS: R2Bucket
  AI: Ai
  PUBLIC_ORIGIN: string
}
const headers = { "cache-control": "no-store" }
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
export class Control extends WorkerEntrypoint<Env> {
  // Operator-only RPC over a private service binding; never routed by public fetch.
  async checkpoint() {
    return this.env.WORKSPACES.getByName("personal-v1").checkpoint()
  }
  async fetch(request: Request) {
    if (request.method === "POST" && new URL(request.url).pathname === "/checkpoint")
      return Response.json(await this.checkpoint())
    const tenant = request.headers.get("x-loopfarm-tenant")
    if (!tenant || !/^[a-f0-9]{64}$/.test(tenant))
      return new Response("User sign-in required", { status: 403 })
    // The initial workers.dev hostname serves one personal workspace. It cannot
    // silently be reused by a different account. Wildcard hosting can expand it.
    return this.env.WORKSPACES.getByName("personal-v1").provision(tenant)
  }
}
export class T3Workspace extends DurableObject<Env> {
  private setup?: Promise<void>
  private saving = false
  async provision(tenant: string) {
    const allowed = await this.ctx.blockConcurrencyWhile(async () => {
      const owner = await this.ctx.storage.get<string>("owner")
      if (owner && owner !== tenant) return false
      if (!owner)
        await this.ctx.storage.put({
          owner: tenant,
          modelKey: crypto.randomUUID() + crypto.randomUUID(),
        })
      return true
    })
    if (!allowed)
      return Response.json(
        {
          error:
            "This preview host belongs to another account. Additional workspaces require separate hostnames.",
        },
        { status: 409, headers },
      )
    try {
      await this.ensure()
      const response = await this.management("/pair", { method: "POST" })
      if (!response.ok) throw new Error("Pairing failed")
      const { token } = (await response.json()) as { token: string }
      await this.ctx.storage.put("lastActivity", Date.now())
      return Response.json(
        { pairingUrl: `${this.env.PUBLIC_ORIGIN}/pair#token=${encodeURIComponent(token)}` },
        { headers },
      )
    } catch (error) {
      console.error(
        "Workspace provisioning failed",
        error instanceof Error ? error.message : "unknown error",
      )
      return Response.json(
        { error: "Workspace is starting or unavailable. Try again shortly." },
        { status: 503, headers },
      )
    }
  }
  private management(path: string, init?: RequestInit) {
    return this.ctx.container!.getTcpPort(3838).fetch(`http://manager${path}`, init)
  }
  private async ensure() {
    if (this.saving) throw new Error("Workspace is saving")
    if (!this.ctx.container!.running) this.setup = undefined
    if (!this.setup)
      this.setup = this.boot().catch((error) => {
        this.setup = undefined
        throw error
      })
    await this.setup
  }
  private async boot() {
    const container = this.ctx.container!
    if (!container.running) {
      const key = await this.ctx.storage.get<string>("modelKey")
      if (!key) throw new Error("Workspace is not provisioned")
      container.start({
        enableInternet: true,
        env: { LOOPFARM_MODEL_BASE: `${this.env.PUBLIC_ORIGIN}/model`, LOOPFARM_MODEL_KEY: key },
      })
    }
    await container.setInactivityTimeout(10 * 60 * 1000)
    let ready = false
    for (let i = 0; i < 100; i++) {
      try {
        if ((await this.management("/health")).ok) {
          ready = true
          break
        }
      } catch {}
      await pause(300)
    }
    if (!ready) throw new Error("Container startup timed out")
    const status = (await (await this.management("/status")).json()) as {
      running: boolean
      initialized: boolean
    }
    if (!status.running) {
      const backupKey = await this.ctx.storage.get<string>("backupKey")
      if (backupKey && !status.initialized) {
        const backup = await this.env.BACKUPS.get(backupKey)
        if (!backup) throw new Error("Workspace backup missing; refusing to start empty")
        const restored = await this.management("/restore", { method: "POST", body: backup.body })
        if (!restored.ok) throw new Error("Restore failed")
      }
      if (!(await this.management("/start", { method: "POST" })).ok)
        throw new Error("T3 startup failed")
    }
    await this.ctx.storage.put("lastActivity", Date.now())
    await this.ctx.storage.setAlarm(Date.now() + 60000)
  }
  async fetch(request: Request) {
    if (!(await this.ctx.storage.get("owner")))
      return new Response("Workspace is not provisioned", { status: 404 })
    if (new URL(request.url).pathname === "/model/decision") return this.decision(request)
    if (new URL(request.url).pathname === "/model/chat/completions") return this.model(request)
    if (this.saving)
      return new Response("Workspace saving; retry shortly", {
        status: 503,
        headers: { "retry-after": "5" },
      })
    // Public traffic cannot wake sleeping environments. Clerk-authenticated launch
    // does that; this prevents an unauthenticated visitor creating compute bills.
    if (!this.ctx.container?.running) {
      this.setup = undefined
      return new Response("Open Loopfarm and launch your workspace", { status: 503 })
    }
    const url = new URL(request.url)
    url.protocol = "http:"
    const forwarded = new Request(url, request)
    forwarded.headers.set("x-forwarded-proto", "https")
    return this.ctx.container.getTcpPort(3773).fetch(forwarded)
  }
  private async consumeModelBudget() {
    return await this.ctx.blockConcurrencyWhile(async () => {
      const day = new Date().toISOString().slice(0, 10)
      const budget = await this.ctx.storage.get<{ day: string; calls: number }>("model-budget")
      const calls = budget?.day === day ? budget.calls : 0
      if (calls >= 500) return false
      await this.ctx.storage.put("model-budget", { day, calls: calls + 1 })
      return true
    })
  }
  private async decision(request: Request) {
    const key = await this.ctx.storage.get<string>("modelKey")
    if (
      !key ||
      request.method !== "POST" ||
      request.headers.get("authorization") !== `Bearer ${key}`
    )
      return new Response("Unauthorized", { status: 401 })
    const body = await request.text()
    if (body.length > 120000) return new Response("Context too large", { status: 413 })
    let input: { state?: unknown }
    try {
      input = JSON.parse(body)
    } catch {
      return new Response("Invalid JSON", { status: 400 })
    }
    if (!input || typeof input.state !== "object" || input.state === null)
      return new Response("Invalid state", { status: 400 })
    if (!(await this.consumeModelBudget()))
      return new Response("Daily model budget reached", { status: 429 })
    await this.ctx.storage.put("lastActivity", Date.now())
    try {
      // Clef is newer than the checked-in Workers AI model declarations.
      const ai = this.env.AI as unknown as { run(model: string, input: unknown): Promise<unknown> }
      const result = await ai.run("@cf/cloudflare/clef", {
        model: "clef",
        state: input.state,
        questions: completionQuestions,
      })
      return Response.json(normalizeDecision(result), { headers })
    } catch {
      return new Response("Completion judge unavailable", { status: 502, headers })
    }
  }
  private async model(request: Request) {
    const key = await this.ctx.storage.get<string>("modelKey")
    if (request.method !== "POST" || request.headers.get("authorization") !== `Bearer ${key}`)
      return new Response("Unauthorized", { status: 401 })
    const body = await request.text()
    if (body.length > 500000) return new Response("Context too large", { status: 413 })
    let input: Record<string, unknown>
    try {
      input = JSON.parse(body)
    } catch {
      return new Response("Invalid JSON", { status: 400 })
    }
    if (!input || typeof input !== "object") return new Response("Invalid input", { status: 400 })
    if (!Array.isArray(input.messages)) return new Response("Invalid messages", { status: 400 })
    const permitted = await this.consumeModelBudget()
    if (!permitted) return new Response("Daily model budget reached", { status: 429 })
    await this.ctx.storage.put("lastActivity", Date.now())
    return this.env.AI.run(
      "@cf/zai-org/glm-4.7-flash",
      {
        ...input,
        max_tokens: Math.max(1, Math.min(Number(input.max_tokens) || 4096, 8192)),
      } as AiModels["@cf/zai-org/glm-4.7-flash"]["inputs"],
      { returnRawResponse: true },
    )
  }
  async checkpoint() {
    if (this.saving) return { saved: false, reason: "saving" }
    if (!this.ctx.container?.running) return { saved: true, reason: "already asleep" }
    this.saving = true
    try {
      const backup = await this.management("/backup", { method: "POST" })
      if (backup.status === 409) return { saved: false, reason: "active jobs" }
      if (!backup.ok || !backup.body) throw new Error("Backup failed")
      const key = `personal-v1/${crypto.randomUUID()}.tar.gz`
      const previous = await this.ctx.storage.get<string>("backupKey")
      await this.env.BACKUPS.put(key, backup.body)
      await this.ctx.storage.put("backupKey", key)
      await this.ctx.container.destroy()
      this.setup = undefined
      if (previous) await this.env.BACKUPS.delete(previous)
      return { saved: true }
    } catch {
      await this.management("/start", { method: "POST" })
      return { saved: false, reason: "backup failed" }
    } finally {
      this.saving = false
    }
  }
  async alarm() {
    const container = this.ctx.container!
    if (!container.running) {
      this.setup = undefined
      return
    }
    await container.setInactivityTimeout(10 * 60 * 1000)
    const lastActivity = (await this.ctx.storage.get<number>("lastActivity")) ?? Date.now()
    if (Date.now() - lastActivity > 15 * 60 * 1000) {
      const result = await this.checkpoint()
      if (result.saved) return
    }
    await this.ctx.storage.setAlarm(Date.now() + 60000)
  }
}
export default {
  fetch(request: Request, env: Env) {
    return env.WORKSPACES.getByName("personal-v1").fetch(request)
  },
} satisfies ExportedHandler<Env>
