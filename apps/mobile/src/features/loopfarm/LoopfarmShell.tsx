import { useAuth, useClerk, useSSO } from "@clerk/expo"
import * as SecureStore from "expo-secure-store"
import { AsyncResult } from "effect/reactivity"
import { useConnectionController } from "../connection/useConnectionController"
import { useConnectionsReady } from "../../state/workspace"
import Constants from "expo-constants"
import * as Linking from "expo-linking"
import * as WebBrowser from "expo-web-browser"
import { useEffect, useRef, useState, type ReactNode } from "react"
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { HostedWorkspace } from "./HostedWorkspace"
import { CloudChats } from "./CloudChats"
import { AppRefresh } from "./AppRefresh"
import { requestRun, type Run } from "./api"

WebBrowser.maybeCompleteAuthSession()
const apiUrl = Constants.expoConfig?.extra?.loopfarm?.apiUrl as string

export function LoopfarmShell({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken, userId } = useAuth()
  const { signOut } = useClerk()
  const { startSSOFlow } = useSSO()
  const inset = useSafeAreaInsets()
  const connections = useConnectionController()
  const connectionsReady = useConnectionsReady()
  const connectionsRef = useRef(connections)
  connectionsRef.current = connections
  const [codingOwner, setCodingOwner] = useState<string | null>(null)
  const ownerQueue = useRef(Promise.resolve())
  useEffect(() => {
    if (!isLoaded || !connectionsReady) return
    let cancelled = false
    setCodingOwner(null)
    ownerQueue.current = ownerQueue.current
      .catch(() => {})
      .then(async () => {
        const previous = await SecureStore.getItemAsync("loopfarm-coding-owner")
        if (previous !== (userId ?? null)) {
          for (const environment of connectionsRef.current.connectedEnvironments) {
            const result = await connectionsRef.current.removeEnvironment(environment.environmentId)
            if (!AsyncResult.isSuccess(result))
              throw new Error("Could not clear the previous account's coding connection")
          }
          if (userId) await SecureStore.setItemAsync("loopfarm-coding-owner", userId)
          else await SecureStore.deleteItemAsync("loopfarm-coding-owner")
        }
        if (!cancelled) setCodingOwner(userId ?? null)
      })
      .catch(() => {
        if (!cancelled)
          setError(
            "Could not secure coding connections for this account. Restart the app and try again.",
          )
      })
    return () => {
      cancelled = true
    }
  }, [isLoaded, connectionsReady, userId])
  const [tab, setTab] = useState<"research" | "chats" | "cloud">("research")
  const [id, setId] = useState("")
  const [question, setQuestion] = useState("")
  const [iterations, setIterations] = useState("3")
  const [run, setRun] = useState<Run | null>(null)
  const [watchId, setWatchId] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const generation = useRef(0)
  const tokenReader = useRef(getToken)
  tokenReader.current = getToken
  useEffect(() => {
    generation.current++
    setBusy(false)
    setRun(null)
    setWatchId(null)
    setError("")
    setQuestion("")
    setId("")
  }, [userId])
  useEffect(() => {
    if (!watchId || run?.status !== "running" || !isSignedIn) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    async function refresh() {
      try {
        const next = await requestRun(
          apiUrl,
          watchId!,
          await tokenReader.current(),
          "GET",
          undefined,
          controller.signal,
        )
        if (!controller.signal.aborted) {
          setRun(next)
          setError("")
        }
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "Could not refresh.")
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(refresh, 5000)
      }
    }
    timer = setTimeout(refresh, 5000)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [watchId, run?.status, isSignedIn])
  async function login() {
    setBusy(true)
    setError("")
    try {
      const result = await startSSOFlow({
        strategy: "oauth_google",
        redirectUrl: Linking.createURL("oauth-native-callback"),
      })
      if (result.createdSessionId && result.setActive)
        await result.setActive({ session: result.createdSessionId })
      else if (
        result.authSessionResult?.type !== "cancel" &&
        result.authSessionResult?.type !== "dismiss"
      )
        setError("Sign-in needs another step. Complete signup on the website, then try again.")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in.")
    } finally {
      setBusy(false)
    }
  }
  async function action(method: "GET" | "POST" | "DELETE") {
    const current = ++generation.current
    setBusy(true)
    setError("")
    try {
      const count = Number(iterations)
      if (
        method === "POST" &&
        (!question.trim() || !Number.isInteger(count) || count < 1 || count > 10)
      )
        throw new Error("Enter a question and 1–10 iterations.")
      const next = await requestRun(
        apiUrl,
        id.trim(),
        await getToken(),
        method,
        method === "POST"
          ? { question: question.trim(), iterations: count, intervalSeconds: 300 }
          : undefined,
      )
      if (current === generation.current) {
        setRun(next)
        setWatchId(id.trim())
      }
    } catch (cause) {
      if (current === generation.current)
        setError(cause instanceof Error ? cause.message : "Request failed.")
    } finally {
      if (current === generation.current) setBusy(false)
    }
  }
  const button = (label: string, onPress: () => void, disabled = false) => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[s.button, disabled && s.disabled]}
    >
      <Text style={s.buttonText}>{label}</Text>
    </Pressable>
  )
  return (
    <View style={[s.root, { paddingTop: inset.top }]}>
      <View style={s.header}>
        <Text style={s.brand}>LOOPFARM</Text>
        <View style={s.tabs}>
          {button("Research", () => setTab("research"))}
          {button("Cloud Pi", () => setTab("cloud"))}
          {button("Coding", () => setTab("chats"))}
        </View>
      </View>
      <AppRefresh />
      {tab === "cloud" && isSignedIn ? (
        <CloudChats key={userId} />
      ) : tab === "chats" && isSignedIn && codingOwner === userId ? (
        <View style={s.chat}>
          <HostedWorkspace
            key={userId}
            withConnectionLock={(work) => {
              const next = ownerQueue.current.catch(() => {}).then(work)
              ownerQueue.current = next.catch(() => {})
              return next
            }}
          >
            {children}
          </HostedWorkspace>
        </View>
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[s.content, { paddingBottom: inset.bottom + 24 }]}
        >
          <Text style={s.title}>A question. A persistent pursuit.</Text>
          {!isLoaded ? (
            <ActivityIndicator />
          ) : !isSignedIn ? (
            <>
              <Text style={s.text}>Sign in with the same Google account as the website.</Text>
              {button("Continue with Google", () => void login(), busy)}
            </>
          ) : (
            <>
              {button(
                "Sign out",
                () => {
                  void signOut().catch(() => setError("Could not sign out. Try again."))
                },
                busy,
              )}
              <Text style={s.label}>Agent ID</Text>
              <TextInput
                accessibilityLabel="Agent ID"
                autoCapitalize="none"
                autoCorrect={false}
                value={id}
                onChangeText={setId}
                placeholder="walkability-research"
                style={s.input}
              />
              <Text style={s.text}>Use the same ID on the website to view this run.</Text>
              <Text style={s.label}>Research question</Text>
              <TextInput
                accessibilityLabel="Research question"
                multiline
                value={question}
                onChangeText={setQuestion}
                style={[s.input, { minHeight: 100 }]}
              />
              <Text style={s.label}>Iterations (1–10)</Text>
              <TextInput
                accessibilityLabel="Iterations"
                keyboardType="number-pad"
                value={iterations}
                onChangeText={setIterations}
                style={s.input}
              />
              <Text style={s.text}>Five minutes between rounds. You can stop at any time.</Text>
              {button("Start research", () => void action("POST"), busy || !id || !question)}
              {button("Load run", () => void action("GET"), busy || !id)}
              {run?.status === "running" &&
                button(
                  "Stop run",
                  () =>
                    Alert.alert("Stop research?", "Completed findings will remain saved.", [
                      { text: "Cancel", style: "cancel" },
                      { text: "Stop", style: "destructive", onPress: () => void action("DELETE") },
                    ]),
                  busy || id.trim() !== watchId,
                )}
              {busy && <ActivityIndicator />}
              {run && (
                <>
                  <Text style={s.heading}>
                    {run.status.toUpperCase()} · {run.findings.length} rounds
                  </Text>
                  {run.error && (
                    <Text accessibilityRole="alert" style={s.error}>
                      {run.error}
                    </Text>
                  )}
                  {run.findings.map((f) => (
                    <View style={s.finding} key={f.iteration}>
                      <Text style={s.heading}>Round {f.iteration}</Text>
                      <Text selectable style={s.text}>
                        {f.text}
                      </Text>
                    </View>
                  ))}
                </>
              )}
            </>
          )}
          {error ? (
            <Text accessibilityRole="alert" style={s.error}>
              {error}
            </Text>
          ) : null}
          {button("Open website", () => void Linking.openURL(apiUrl + "/app"))}
        </ScrollView>
      )}
    </View>
  )
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f7f5ed" },
  header: { padding: 16, borderBottomWidth: 1, borderColor: "#d5dccd" },
  brand: { color: "#254b35", fontSize: 20, fontWeight: "700", letterSpacing: 2 },
  tabs: { flexDirection: "row", gap: 8, marginTop: 10 },
  chat: { flex: 1 },
  content: { padding: 20, gap: 12 },
  title: { fontSize: 32, fontWeight: "600", color: "#254b35", marginBottom: 16 },
  heading: { fontSize: 19, fontWeight: "600", color: "#254b35" },
  label: { fontSize: 16, fontWeight: "600", color: "#254b35", marginTop: 10 },
  text: { fontSize: 16, lineHeight: 24, color: "#344337" },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#b7c4b5",
    borderRadius: 12,
    padding: 14,
    color: "#203827",
    fontSize: 16,
  },
  button: { backgroundColor: "#254b35", padding: 13, borderRadius: 12, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  disabled: { opacity: 0.45 },
  finding: { padding: 16, backgroundColor: "#fff", borderRadius: 12, gap: 10 },
  error: { color: "#9b2626", fontSize: 16, lineHeight: 23 },
})
