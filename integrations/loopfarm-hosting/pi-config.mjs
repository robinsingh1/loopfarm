// Loopfarm hosted Pi runtime.
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"))
  } catch (error) {
    if (error.code === "ENOENT") return {}
    throw error
  }
}
export async function configurePi(agentDir, modelBase, modelKey) {
  await mkdir(agentDir, { recursive: true })
  const settingsFile = path.join(agentDir, "settings.json")
  const settings = await readJson(settingsFile)
  const extension = "/usr/local/lib/node_modules/pi-subagents"
  settings.packages = [...new Set([...(settings.packages ?? []), extension])]
  settings.extensions = [
    ...new Set([...(settings.extensions ?? []), "/opt/loopfarm/jev-extension.ts"]),
  ]
  settings.defaultProvider ??= "loopfarm"
  settings.defaultModel ??= "@cf/zai-org/glm-4.7-flash"
  await writeFile(settingsFile, JSON.stringify(settings, null, 2), { mode: 0o600 })
  if (modelKey) {
    const file = path.join(agentDir, "models.json")
    const models = await readJson(file)
    models.providers = {
      ...models.providers,
      loopfarm: {
        baseUrl: modelBase,
        apiKey: modelKey,
        api: "openai-completions",
        models: [
          {
            id: "@cf/zai-org/glm-4.7-flash",
            name: "Loopfarm GLM",
            reasoning: false,
            input: ["text"],
            contextWindow: 65536,
            maxTokens: 8192,
            cost: { input: 0.06, output: 0.4, cacheRead: 0, cacheWrite: 0 },
          },
        ],
      },
    }
    await writeFile(file, JSON.stringify(models, null, 2), { mode: 0o600 })
  }
}
