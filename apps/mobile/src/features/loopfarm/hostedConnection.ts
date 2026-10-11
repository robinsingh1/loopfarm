const hostedOrigin = "https://loopfarm-t3.robin-345.workers.dev"
export function isHostedWorkspace(environment: { displayUrl: string }): boolean {
  try {
    return new URL(environment.displayUrl).origin === hostedOrigin
  } catch {
    return false
  }
}
