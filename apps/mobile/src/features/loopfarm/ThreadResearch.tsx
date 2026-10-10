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
  const [run, setRun] = useState<Run | null>(null)
  const [question, setQuestion] = useState("")
  const [criteria, setCriteria] = useState("")
  const [iterations, setIterations] = useState("3")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const revision = useRef(0)
  useEffect(() => {
    let cancelled = false
    revision.current++
    setId(null)
    setRun(null)
    setError("")
    setBusy(false)
    setOpen(false)
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
    if (!id || !base || !userId || !open) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    async function refresh() {
      const current = revision.current
      try {
        if (AppState.currentState !== "active") return
        const next = await requestRun(
          base!,
          id!,
          await token.current(),
          "GET",
          undefined,
          controller.signal,
        )
        if (!controller.signal.aborted && current === revision.current) setRun(next)
      } catch (cause) {
        if (!controller.signal.aborted && current === revision.current)
          setError(cause instanceof Error ? cause.message : "Could not load research.")
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(refresh, 5000)
      }
    }
    void refresh()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [id, userId, open])
  async function act(method: "POST" | "PATCH" | "DELETE", action?: "pause" | "resume") {
    if (!id || !base || busy) return
    const current = ++revision.current
    setBusy(true)
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
      <View className="border-border flex-row items-center justify-between border-b px-4 py-2">
        <Text className="text-foreground-muted">
          Research
          {run && run.status !== "idle"
            ? ` · ${run.status} · ${run.findings.length}/${run.config?.iterations ?? 0}`
            : ""}
        </Text>
        {button("Open research", () => setOpen(true))}
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
          {!run && !error && <ActivityIndicator />}
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
                spend. Automatic Jev completion checks are not active yet.
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
          {!!(error || run?.error) && (
            <Text accessibilityRole="alert" className="text-foreground">
              {error || run?.error}
            </Text>
          )}
        </ScrollView>
      </Modal>
    </>
  )
}
