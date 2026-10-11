import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { configurePi } from "./pi-config.mjs"

test("startup adds subagents idempotently and preserves user models and credentials", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "loopfarm-pi-"))
  try {
    await writeFile(
      path.join(dir, "settings.json"),
      JSON.stringify({
        defaultProvider: "other",
        defaultModel: "chosen",
        packages: ["existing"],
        extensions: ["existing-extension"],
        subagents: { defaultModel: "inherit" },
      }),
    )
    await writeFile(
      path.join(dir, "models.json"),
      JSON.stringify({ providers: { other: { baseUrl: "https://example.com", models: [] } } }),
    )
    await writeFile(path.join(dir, "auth.json"), "untouched")
    await configurePi(dir, "https://test/model", "test-key")
    await configurePi(dir, "https://test/model", "rotated-key")
    const settings = JSON.parse(await readFile(path.join(dir, "settings.json")))
    assert.equal(settings.defaultModel, "chosen")
    assert.equal(settings.defaultProvider, "other")
    assert.deepEqual(settings.packages, ["existing", "/usr/local/lib/node_modules/pi-subagents"])
    assert.deepEqual(settings.extensions, ["existing-extension", "/opt/loopfarm/jev-extension.ts"])
    assert.deepEqual(settings.skills, ["/usr/local/lib/node_modules/pi-autoresearch/skills"])
    assert.equal(settings.subagents.defaultModel, "inherit")
    const models = JSON.parse(await readFile(path.join(dir, "models.json")))
    assert.equal(models.providers.other.baseUrl, "https://example.com")
    assert.equal(models.providers.loopfarm.apiKey, "rotated-key")
    assert.equal(await readFile(path.join(dir, "auth.json"), "utf8"), "untouched")
    await writeFile(path.join(dir, "settings.json"), "broken")
    await assert.rejects(configurePi(dir, "https://test/model", "test-key"))
    assert.equal(await readFile(path.join(dir, "settings.json"), "utf8"), "broken")
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
