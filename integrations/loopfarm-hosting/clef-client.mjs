export class ClefClient {
  name = "Clef"
  constructor(base = process.env.LOOPFARM_MODEL_BASE, key = process.env.LOOPFARM_MODEL_KEY) {
    this.base = base
    this.key = key
  }
  isConfigured() {
    return Boolean(this.base && this.key)
  }
  async evaluate({ state }, signal) {
    if (!this.isConfigured()) throw new Error("Hosted decision gateway is not configured")
    const response = await fetch(`${this.base}/decision`, {
      method: "POST",
      signal,
      headers: { authorization: `Bearer ${this.key}`, "content-type": "application/json" },
      body: JSON.stringify({ state }),
    })
    if (!response.ok) throw new Error(`Completion check returned ${response.status}`)
    return response.json()
  }
}
