// The existing session hook uses Clef while the Jev integration is unfunded.
import { ClefClient } from "./clef-client.mjs"
import { installSupervisor } from "./jev-supervisor.mjs"
// @ts-ignore -- This CLI package is installed inside the hosted container.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
export default function (pi: ExtensionAPI) {
  installSupervisor(pi, new ClefClient())
}
