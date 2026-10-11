const hostedOrigin = "https://loopfarm-t3.robin-345.workers.dev"
export function isHostedWorkspace(environment: { displayUrl: string }): boolean {
  try {
    return new URL(environment.displayUrl).origin === hostedOrigin
  } catch {
    return false
  }
}

export async function requestHostedWorkspace(
  url: string,
  token: string,
  signal: AbortSignal,
  request: typeof fetch = fetch,
  pause: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<{ pairingUrl: string }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal.aborted) throw new Error("Connection cancelled")
    const response = await request(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      signal,
    })
    const data = (await response.json().catch(() => ({}))) as {
      pairingUrl?: string
      error?: string
    }
    if ([502, 503, 504].includes(response.status) && attempt < 2) {
      await pause(1500 * (attempt + 1))
      continue
    }
    if (!response.ok) throw new Error(data.error || `Workspace launch failed (${response.status}).`)
    if (typeof data.pairingUrl !== "string" || !isHostedWorkspace({ displayUrl: data.pairingUrl }))
      throw new Error("The server returned an invalid workspace address.")
    return { pairingUrl: data.pairingUrl }
  }
  throw new Error("Workspace is still starting. Please try Connect again.")
}

/** A retry acknowledgment is not a connected socket. Repair only after checking the result. */
export async function reconnectHostedWorkspace(input: {
  reuseSaved: boolean
  retry: () => Promise<boolean>
  repair: () => Promise<boolean>
  waitConnected: () => Promise<boolean>
  onRepair: () => void
}) {
  if (input.reuseSaved && (await input.retry()) && (await input.waitConnected())) return
  input.onRepair()
  if (!(await input.repair())) throw new Error("Pairing failed. Please try Connect again.")
  if (!(await input.waitConnected()))
    throw new Error(
      "Workspace started, but T3 did not connect. Check your network and retry Connect.",
    )
}
