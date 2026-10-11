// The existing session hook uses Clef while the Jev integration is unfunded.
import { ClefClient } from "./clef-client.mjs"
import { installAutoresearch } from "./autoresearch-bridge.mjs"
// @ts-ignore -- Pinned package installed in the hosted image.
import autoresearch from "/usr/local/lib/node_modules/pi-autoresearch/extensions/pi-autoresearch/index.ts"
import { installSupervisor } from "./jev-supervisor.mjs"
// @ts-ignore -- This CLI package is installed inside the hosted container.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
export default function (pi: ExtensionAPI) {
  const supervisor = installSupervisor(pi, new ClefClient())
  installAutoresearch(pi, autoresearch, supervisor)
}
