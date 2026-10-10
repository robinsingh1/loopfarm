export type Run = {
  status: "idle" | "running" | "completed" | "stopped" | "failed"
  config: { question: string; iterations: number } | null
  findings: { iteration: number; text: string; finishedAt: string }[]
  error: string | null
}
export async function requestRun(
  base: string,
  id: string,
  token: string | null,
  method: "GET" | "POST" | "DELETE",
  body?: unknown,
  signal?: AbortSignal,
): Promise<Run> {
  if (!token) throw new Error("Sign in to continue.")
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id))
    throw new Error("Use 1–64 lowercase letters, numbers, or hyphens for the agent ID.")
  const response = await fetch(`${base}/api/agent/${encodeURIComponent(id)}`, {
    method,
    signal,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const data = (await response.json()) as Run & { error?: string }
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`)
  return data
}
