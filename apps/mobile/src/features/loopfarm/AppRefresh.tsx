import Constants from "expo-constants"
import * as Updates from "expo-updates"
import IconRefresh from "@tabler/icons-react-native/IconRefresh"
import { useRef, useState } from "react"
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native"
import {
  isAppUpdateCheckAvailable,
  runAppUpdateCheck,
  type AppUpdateCheckState,
} from "../updates/app-updates"

const labels: Record<AppUpdateCheckState, string> = {
  idle: "Not checked yet",
  checking: "Checking for app update…",
  downloading: "Downloading app update…",
  ready: "Update downloaded · restart to apply",
  restarting: "Restarting with update…",
  current: "Up to date",
}

export function AppRefresh({
  onConnect,
  onRefreshWorkspace,
  connectionStatus = "Signed out",
  connectionBusy = false,
}: {
  onConnect?: () => void
  onRefreshWorkspace?: () => Promise<void>
  connectionStatus?: string
  connectionBusy?: boolean
}) {
  const [state, setState] = useState<AppUpdateCheckState>("idle")
  const [error, setError] = useState("")
  const [checkedAt, setCheckedAt] = useState<Date | null>(null)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const available = isAppUpdateCheckAvailable()
  async function refresh() {
    if (inFlight.current || !available) return
    inFlight.current = true
    setBusy(true)
    setError("")
    try {
      await runAppUpdateCheck({
        applyMode: "immediate",
        onStateChange: (next) => {
          setState(next)
          if (next === "current" || next === "ready") setCheckedAt(new Date())
        },
        onFailure: setError,
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not check for an app update.")
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }
  const version = `${Constants.expoConfig?.version ?? "Loopfarm"} · ${Updates.isEmbeddedLaunch ? "Built-in version" : `OTA ${Updates.updateId?.slice(-8) ?? "unknown"}`}`
  function menu() {
    Alert.alert(
      "Refresh",
      `${version}\n${!available ? "App updates unavailable in this build" : error || labels[state]}${checkedAt ? `\nLast successful check ${checkedAt.toLocaleTimeString()}` : ""}`,
      [
        ...(onRefreshWorkspace
          ? [{ text: "Refresh workspace", onPress: () => void onRefreshWorkspace() }]
          : []),
        ...(available
          ? [{ text: "Check and install app update", onPress: () => void refresh() }]
          : []),
        { text: "Cancel", style: "cancel" },
      ],
    )
  }
  return (
    <View
      style={{
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderColor: "#d6d3c9",
        backgroundColor: "#f5f4ed",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#17231a", fontSize: 17, fontWeight: "700" }}>Loopfarm</Text>
          <Text accessibilityLiveRegion="polite" style={{ color: "#45483c", fontSize: 12 }}>
            {connectionStatus}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Connect workspace"
          disabled={!onConnect}
          onPress={onConnect}
          style={{ minHeight: 44, justifyContent: "center", opacity: onConnect ? 1 : 0.5 }}
        >
          <Text style={{ color: "#176130", fontWeight: "600" }}>Connect</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh workspace or app"
          accessibilityState={{ disabled: busy || connectionBusy, busy: busy || connectionBusy }}
          disabled={busy || connectionBusy}
          onPress={menu}
          style={{ minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" }}
        >
          {busy || connectionBusy ? (
            <ActivityIndicator color="#45483c" />
          ) : (
            <IconRefresh size={22} color="#45483c" />
          )}
        </Pressable>
      </View>
      {(state !== "idle" || error) && (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: error ? "#a12b23" : "#45483c", fontSize: 12 }}
        >
          {error ? `App update failed: ${error}` : labels[state]}
        </Text>
      )}
    </View>
  )
}
