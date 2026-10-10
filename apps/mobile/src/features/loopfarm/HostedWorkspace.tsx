import { useAuth } from "@clerk/expo"
import Constants from "expo-constants"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { Pressable, Text, View } from "react-native"
import { AsyncResult } from "effect/reactivity"
import { useConnectionController } from "../connection/useConnectionController"
export function HostedWorkspace({
  withConnectionLock,
  children,
}: {
  children: ReactNode
  withConnectionLock: (work: () => Promise<void>) => Promise<void>
}) {
  const { getToken } = useAuth()
  const { connectPairingUrl } = useConnectionController()
  const [busy, setBusy] = useState(true)
  const [connected, setConnected] = useState(false)
  const mounted = useRef(false)
  const inFlight = useRef(false)
  const [message, setMessage] = useState("")
  async function launch() {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setMessage("Starting your private workspace…")
    try {
      await withConnectionLock(async () => {
        if (!mounted.current) return
        const token = await getToken()
        if (!token) throw new Error("Sign in to continue")
        const response = await fetch(
          `${Constants.expoConfig?.extra?.loopfarm?.apiUrl}/api/workspace`,
          { method: "POST", headers: { authorization: `Bearer ${token}` } },
        )
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "Could not start workspace")
        if (!mounted.current) return
        const result = await connectPairingUrl(data.pairingUrl)
        if (!AsyncResult.isSuccess(result))
          throw new Error("Workspace started, but connection failed. Tap again to reconnect.")
        if (mounted.current) {
          setConnected(true)
          setMessage("Connected. Create a new task and select Pi.")
        }
      })
    } catch (e) {
      if (mounted.current) setMessage(e instanceof Error ? e.message : "Could not connect")
    } finally {
      inFlight.current = false
      if (mounted.current) setBusy(false)
    }
  }
  const launchRef = useRef(launch)
  launchRef.current = launch
  useEffect(() => {
    mounted.current = true
    void launchRef.current()
    return () => {
      mounted.current = false
    }
  }, [])
  return (
    <>
      <View style={{ padding: 12, backgroundColor: "#edf4ed", gap: 6 }}>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void launch()}>
          <Text style={{ color: "#176130", fontWeight: "700", textAlign: "center", padding: 8 }}>
            {busy
              ? "Connecting your cloud workspace…"
              : connected
                ? "Reconnect workspace"
                : "Retry connection"}
          </Text>
        </Pressable>
        {!!message && <Text style={{ color: "#17231a", textAlign: "center" }}>{message}</Text>}
      </View>
      {connected && children}
    </>
  )
}
