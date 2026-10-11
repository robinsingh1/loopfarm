import Constants from "expo-constants"
import * as Updates from "expo-updates"
import IconRefresh from "@tabler/icons-react-native/IconRefresh"
import { useRef, useState } from "react"
import { ActivityIndicator, Pressable, Text, View } from "react-native"
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

export function AppRefresh() {
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
  return (
    <View
      style={{
        paddingHorizontal: 20,
        paddingVertical: 8,
        gap: 4,
        borderBottomWidth: 1,
        borderColor: "#d6d3c9",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <Text selectable style={{ color: "#45483c", flex: 1, fontSize: 12 }}>
          {Constants.expoConfig?.version ?? "Loopfarm"} ·{" "}
          {Updates.isEmbeddedLaunch
            ? "Built-in version"
            : `OTA ${Updates.updateId?.slice(-8) ?? "unknown"}`}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh app update"
          accessibilityHint="Checks for an update, downloads it, and restarts the app if one is available."
          accessibilityState={{ disabled: busy || !available, busy }}
          disabled={busy || !available}
          onPress={() => void refresh()}
          style={{
            minHeight: 44,
            flexDirection: "row",
            gap: 6,
            alignItems: "center",
            opacity: available ? 1 : 0.5,
          }}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#45483c" />
          ) : (
            <IconRefresh size={18} color="#45483c" />
          )}
          <Text style={{ color: "#45483c", fontWeight: "600" }}>Refresh app</Text>
        </Pressable>
      </View>
      <Text
        accessibilityLiveRegion="polite"
        style={{ color: error ? "#a12b23" : "#45483c", fontSize: 12 }}
      >
        {!available
          ? "App updates unavailable in this build"
          : error
            ? `Refresh failed: ${error}`
            : labels[state]}
        {checkedAt && !busy ? ` · Last successful check ${checkedAt.toLocaleTimeString()}` : ""}
      </Text>
    </View>
  )
}
