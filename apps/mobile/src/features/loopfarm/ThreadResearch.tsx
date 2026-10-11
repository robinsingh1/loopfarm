import { IconRefresh } from "@tabler/icons-react-native"
import { useAuth } from "@clerk/expo"
import Constants from "expo-constants"
import * as Crypto from "expo-crypto"
import { useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  AppState,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { AppText as Text } from "../../components/AppText"
import { requestRun, type Run } from "./api"
import { watchRun } from "./watchRun"

const base = Constants.expoConfig?.extra?.loopfarm?.apiUrl as string | undefined

// Loopfarm's durable runner adapter is isolated from T3's thread execution service.
export function ThreadResearch({
  environmentId,
  threadId,
}: {
  environmentId: string
  threadId: string
}) {
  const { getToken, userId } = useAuth()
  const insets = useSafeAreaInsets()
  const token = useRef(getToken)
  token.current = getToken
  const [id, setId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [run, setRun] = useState<Run | null>(null)
  const [question, setQuestion] = useState("")
  const [criteria, setCriteria] = useState("")
  const [iterations, setIterations] = useState("3")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [loadError, setLoadError] = useState("")
  const [refreshing, setRefreshing] = useState(false)
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null)
  const refreshRun = useRef<(() => Promise<void>) | null>(null)
  const revision = useRef(0)
  useEffect(() => {
    let cancelled = false
    revision.current++
    setId(null)
    setRun(null)
    setRefreshedAt(null)
    setError("")
    setLoadError("")
    setBusy(false)
    setOpen(false)
    setExpanded(false)
    setQuestion("")
    setCriteria("")
    void Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      JSON.stringify([environmentId, threadId]),
    )
      .then((hash) => {
        if (!cancelled) setId(`t3-${hash.slice(0, 60)}`)
      })
      .catch(() => {
        if (!cancelled) setError("Could not identify this research session.")
      })
    return () => {
      cancelled = true
      revision.current++
    }
  }, [environmentId, threadId, userId])
  useEffect(() => {
    if (!id || !base || !userId || busy) return
    const current = revision.current
    let mounted = true
    const watcher = watchRun({
      onRefreshing: (value) => {
        if (mounted) setRefreshing(value)
      },
      load: async (signal) => requestRun(base, id, await token.current(), "GET", undefined, signal),
      onRun: (next) => {
        if (current !== revision.current) return
        setRun(next)
        setRefreshedAt(new Date())
        setLoadError("")
      },
      onError: (cause) => {
        if (current !== revision.current) return
        setLoadError(cause instanceof Error ? cause.message : "Could not load research.")
      },
    })
    refreshRun.current = watcher.refresh
    watcher.setActive(AppState.currentState === "active")
    const subscription = AppState.addEventListener("change", (state) => {
      watcher.setActive(state === "active")
    })
    return () => {
      mounted = false
      refreshRun.current = null
      watcher.dispose()
      subscription.remove()
    }
  }, [id, userId, busy, open])
  async function act(method: "POST" | "PATCH" | "DELETE", action?: "pause" | "resume") {
    if (!id || !base || busy) return
    const current = ++revision.current
    setBusy(true)
    setRefreshing(false)
    setError("")
    try {
      const count = Number(iterations)
      if (
        method === "POST" &&
        (!question.trim() || !Number.isInteger(count) || count < 1 || count > 20)
      )
        throw new Error("Enter a goal and an iteration limit from 1 to 20.")
      const body =
        method === "POST"
          ? { question, completionCriteria: criteria, iterations: count, intervalSeconds: 300 }
          : method === "PATCH"
            ? { action }
            : undefined
      const next = await requestRun(base, id, await token.current(), method, body)
      if (current === revision.current) {
        setRun(next)
      }
    } catch (cause) {
      if (current === revision.current)
        setError(cause instanceof Error ? cause.message : "Research request failed.")
    } finally {
      if (current === revision.current) {
        revision.current++
        setBusy(false)
      }
    }
  }
  if (!base || !userId) return null
  const button = (label: string, onPress: () => void, disabled = false) => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className="border-border rounded-lg border px-3 py-2"
    >
      <Text className="text-foreground">{label}</Text>
    </Pressable>
  )
  return (
    <>
      <View className="border-border gap-2 border-b px-4 py-2">
        <View className="flex-row items-center justify-between gap-2">
          <Text className="text-foreground-muted flex-1">
            Research
            {run && run.status !== "idle"
              ? ` · ${run.status === "completed" ? "limit reached" : run.status} · ${run.findings.length}/${run.config?.iterations ?? 0}`
              : ""}
          </Text>
          {button(run && run.status !== "idle" ? "Details" : "Research loop", () => setOpen(true))}
        </View>
        <View className="flex-row items-center justify-between gap-2">
          <Text accessibilityLiveRegion="polite" className="text-foreground-muted flex-1 text-xs">
            {refreshing
              ? "Refreshing research…"
              : loadError
                ? "Research refresh failed"
                : refreshedAt
                  ? `Research synced ${refreshedAt.toLocaleTimeString()}`
                  : "Research not synced yet"}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh research data"
            accessibilityState={{ disabled: busy || refreshing || !id, busy: refreshing }}
            disabled={busy || refreshing || !id}
            onPress={() => void refreshRun.current?.()}
            className="min-h-11 min-w-11 items-center justify-center"
          >
            {refreshing ? (
              <ActivityIndicator size="small" />
            ) : (
              <IconRefresh size={20} color="#6b7280" />
            )}
          </Pressable>
        </View>
        {run && run.status !== "idle" && (
          <>
            <Text numberOfLines={2} className="text-foreground">
              {run.config?.question}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {run.status === "running" && button("Pause", () => void act("PATCH", "pause"), busy)}
              {run.status === "paused" && button("Resume", () => void act("PATCH", "resume"), busy)}
              {run.findings.length > 0 &&
                button(expanded ? "Hide finding" : "Latest finding", () => setExpanded(!expanded))}
            </View>
            {run.status === "paused" && run.operation && (
              <Text className="text-foreground-muted">
                Saving the current round before pausing.
              </Text>
            )}
            {expanded && run.findings.length > 0 && (
              <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>
                <Text className="text-foreground-muted">
                  Round {run.findings.at(-1)!.iteration}
                </Text>
                <Text selectable className="text-foreground">
                  {run.findings.at(-1)!.text}
                </Text>
              </ScrollView>
            )}
          </>
        )}
        {!!(error || loadError || run?.error) && (
          <Text accessibilityRole="alert" numberOfLines={2} className="text-foreground">
            {error || loadError || run?.error}
          </Text>
        )}
      </View>
      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          className="bg-screen flex-1"
          contentContainerStyle={{
            padding: 20,
            paddingTop: Math.max(insets.top, 20),
            paddingBottom: insets.bottom + 24,
            gap: 16,
          }}
        >
          <View className="flex-row items-center justify-between">
            <Text className="text-foreground text-xl font-semibold">Thread research</Text>
            {button("Close", () => setOpen(false))}
          </View>
          <Text className="text-foreground-muted">
            This thread's cloud research keeps running when you close the app. Findings are saved
            here separately from coding messages.
          </Text>
          {!run && !error && !loadError && <ActivityIndicator />}
          {run?.status === "idle" && (
            <>
              <Text className="text-foreground">Goal</Text>
              <TextInput
                accessibilityLabel="Research goal"
                multiline
                value={question}
                onChangeText={setQuestion}
                className="border-border text-foreground min-h-24 rounded-lg border p-3"
              />
              <Text className="text-foreground">Completion criteria</Text>
              <TextInput
                accessibilityLabel="Completion criteria"
                multiline
                value={criteria}
                onChangeText={setCriteria}
                placeholder="What evidence would answer your question?"
                className="border-border text-foreground min-h-20 rounded-lg border p-3"
              />
              <Text className="text-foreground">Iteration limit (1–20)</Text>
              <TextInput
                accessibilityLabel="Iteration limit"
                keyboardType="number-pad"
                value={iterations}
                onChangeText={setIterations}
                className="border-border text-foreground rounded-lg border p-3"
              />
              <Text className="text-foreground-muted">
                GLM · five minutes between rounds. The iteration limit caps rounds, not dollar
                spend. This research runner stops at its limit; Clef completion checks currently
                apply to Pi coding chats.
              </Text>
              {button("Start research", () => void act("POST"), busy || !question.trim())}
            </>
          )}
          {run && run.status !== "idle" && (
            <>
              <Text className="text-foreground text-lg font-semibold">{run.config?.question}</Text>
              {!!run.config?.completionCriteria && (
                <Text className="text-foreground-muted">
                  Done when: {run.config.completionCriteria}
                </Text>
              )}
              <Text className="text-foreground">
                {run.status === "completed" ? "Iteration limit reached" : run.status} ·{" "}
                {run.findings.length}/{run.config?.iterations ?? 0} rounds saved
              </Text>
              {run.status === "paused" && run.operation && (
                <Text className="text-foreground-muted">
                  Pausing after the current round finishes and saves.
                </Text>
              )}
              <View className="flex-row flex-wrap gap-2">
                {run.status === "running" &&
                  button("Pause", () => void act("PATCH", "pause"), busy)}
                {run.status === "paused" &&
                  button("Resume", () => void act("PATCH", "resume"), busy)}
                {["running", "paused"].includes(run.status) &&
                  button("Stop", () => void act("DELETE"), busy)}
              </View>
              {run.findings.map((finding) => (
                <View key={finding.iteration} className="border-border gap-2 rounded-lg border p-3">
                  <Text className="text-foreground font-semibold">Round {finding.iteration}</Text>
                  <Text selectable className="text-foreground">
                    {finding.text}
                  </Text>
                </View>
              ))}
            </>
          )}
          {busy && <ActivityIndicator />}
          {!!(error || loadError || run?.error) && (
            <Text accessibilityRole="alert" className="text-foreground">
              {error || loadError || run?.error}
            </Text>
          )}
        </ScrollView>
      </Modal>
    </>
  )
}
