import { useAuth } from "@clerk/expo"
import Constants from "expo-constants"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { AppState, Modal, Pressable, ScrollView, Text, View } from "react-native"
import { AsyncResult } from "effect/reactivity"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useConnectionController } from "../connection/useConnectionController"
import { AppRefresh } from "./AppRefresh"
import {
  isHostedWorkspace,
  requestHostedWorkspace,
  reconnectHostedWorkspace,
} from "./hostedConnection"

export function HostedWorkspace({
  withConnectionLock,
  children,
  onSignOut,
}: {
  children: ReactNode
  withConnectionLock: (work: () => Promise<void>) => Promise<void>
  onSignOut: () => void
}) {
  const { getToken } = useAuth()
  const connections = useConnectionController()
  const saved = connections.connectedEnvironments.find(isHostedWorkspace)
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState("Starting workspace…")
  const [open, setOpen] = useState(false)
  const [error, setError] = useState("")
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null)
  const insets = useSafeAreaInsets()
  const mounted = useRef(false)
  const inFlight = useRef(false)
  const controller = useRef<AbortController | null>(null)
  async function launch(repair = false) {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setPhase("Starting workspace…")
    setError("")
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      await withConnectionLock(async () => {
        if (!mounted.current) return
        const token = await getToken()
        if (!token) throw new Error("Sign in to continue")
        controller.current = new AbortController()
        const currentController = controller.current
        timeout = setTimeout(() => currentController.abort(), 150000)
        const data = await requestHostedWorkspace(
          `${Constants.expoConfig?.extra?.loopfarm?.apiUrl}/api/workspace`,
          token,
          currentController.signal,
        )
        if (!mounted.current) return
        if (saved && !saved.isEnabled) {
          const enabled = await connections.setEnvironmentEnabled(saved.environmentId, true)
          if (!AsyncResult.isSuccess(enabled))
            throw new Error("Could not enable the saved connection.")
        }
        setPhase("Reconnecting to T3…")
        await reconnectHostedWorkspace({
          reuseSaved: Boolean(saved && !repair),
          retry: async () =>
            Boolean(
              saved &&
              AsyncResult.isSuccess(await connections.retryEnvironment(saved.environmentId)),
            ),
          repair: async () => {
            if (currentController.signal.aborted) throw new Error("Connection cancelled")
            return AsyncResult.isSuccess(
              await connections.connectPairingUrl(data.pairingUrl, saved?.environmentId),
            )
          },
          onRepair: () => setPhase("Repairing workspace pairing…"),
          waitConnected: async () => {
            const deadline = Date.now() + 15000
            while (Date.now() < deadline) {
              if (currentController.signal.aborted) throw new Error("Connection cancelled")
              if (latest.current.saved?.connectionState === "connected") return true
              await new Promise((resolve) => setTimeout(resolve, 250))
            }
            return false
          },
        })
      })
    } catch (cause) {
      if (mounted.current)
        setError(
          controller.current?.signal.aborted
            ? "Workspace connection timed out. Tap Connect to try again."
            : cause instanceof Error
              ? cause.message
              : "Could not connect",
        )
    } finally {
      clearTimeout(timeout)
      inFlight.current = false
      if (mounted.current) setBusy(false)
    }
  }
  const latest = useRef({ launch, saved })
  latest.current = { launch, saved }
  useEffect(() => {
    mounted.current = true
    if (latest.current.saved?.connectionState !== "connected") void latest.current.launch()
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && latest.current.saved?.connectionState !== "connected")
        void latest.current.launch()
    })
    return () => {
      mounted.current = false
      controller.current?.abort()
      subscription.remove()
    }
  }, [])
  useEffect(() => {
    if (saved?.connectionState === "connected") {
      setRefreshedAt(new Date())
      setError("")
    }
  }, [saved?.connectionState])
  const state = busy ? phase : (saved?.connectionState ?? "Not connected")
  const button = (label: string, action: () => void, disabled = busy) => (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={action}
      style={{
        padding: 14,
        borderWidth: 1,
        borderColor: "#d6d3c9",
        borderRadius: 10,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text style={{ color: "#17231a", fontWeight: "600" }}>{label}</Text>
    </Pressable>
  )
  return (
    <>
      <AppRefresh
        onConnect={() => setOpen(true)}
        onRefreshWorkspace={() => launch()}
        connectionBusy={busy}
        connectionStatus={error ? "Connection failed · tap Connect" : state}
      />
      {!!error && (
        <Text accessibilityRole="alert" style={{ color: "#a12b23", padding: 10 }}>
          {error}
        </Text>
      )}
      <View style={{ flex: 1 }}>{children}</View>
      <Modal
        visible={open}
        onRequestClose={() => setOpen(false)}
        presentationStyle="pageSheet"
        animationType="slide"
      >
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingTop: Math.max(20, insets.top), gap: 16 }}
          style={{ backgroundColor: "#f5f4ed" }}
        >
          <Text style={{ fontSize: 22, fontWeight: "700", color: "#17231a" }}>
            Workspace connection
          </Text>
          <Text style={{ color: "#45483c" }}>
            {state}
            {refreshedAt ? ` · Connected at ${refreshedAt.toLocaleTimeString()}` : ""}
          </Text>
          <Text style={{ color: "#45483c" }}>
            Your pairing is saved securely on this device for your signed-in account. Loopfarm
            reconnects when you return.
          </Text>
          {connections.connectedEnvironments.map((environment) => (
            <View key={environment.environmentId} style={{ gap: 4 }}>
              <Text style={{ color: "#17231a", fontWeight: "600" }}>
                {environment.environmentLabel} · {environment.connectionState}
              </Text>
              <Text style={{ color: "#45483c" }}>{environment.displayUrl}</Text>
            </View>
          ))}
          {!!(error || saved?.connectionError) && (
            <Text accessibilityRole="alert" style={{ color: "#a12b23" }}>
              {error || saved?.connectionError}
            </Text>
          )}
          {button(
            saved ? "Reconnect saved workspace" : "Connect hosted workspace",
            () => void launch(),
          )}
          {!!saved && button("Repair pairing", () => void launch(true))}
          {button("Sign out and clear connections", onSignOut)}
          {button("Done", () => setOpen(false), false)}
        </ScrollView>
      </Modal>
    </>
  )
}
