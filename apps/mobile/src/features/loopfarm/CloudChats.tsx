import { useAuth } from "@clerk/expo"
import Constants from "expo-constants"
import * as Crypto from "expo-crypto"
import { useEffect, useRef, useState } from "react"
import {
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native"

const base = Constants.expoConfig?.extra?.loopfarm?.apiUrl as string
export function CloudChats() {
  const { getToken, userId } = useAuth()
  const [sessions, setSessions] = useState<{ id: string; title: string }[]>([])
  const [id, setId] = useState<string | null>(null)
  const [messages, setMessages] = useState<{ id: string; role: string; text: string }[]>([])
  const [prompt, setPrompt] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState(false)
  const [search, setSearch] = useState(false)
  const tokenReader = useRef(getToken)
  tokenReader.current = getToken
  const retry = useRef<{ prompt: string; operationId: string } | null>(null)
  const generation = useRef(0)
  async function api(path: string, method = "GET", body?: unknown, signal?: AbortSignal) {
    const token = await tokenReader.current()
    if (!token) throw new Error("Sign in to continue")
    const response = await fetch(`${base}${path}`, {
      method,
      signal,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`)
    return data
  }
  useEffect(() => {
    const controller = new AbortController()
    generation.current++
    setId(null)
    setMessages([])
    setSessions([])
    setPrompt("")
    setError("")
    retry.current = null
    void api("/api/chats", "GET", undefined, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setSessions(data.sessions)
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message)
      })
    return () => {
      controller.abort()
      generation.current++
    }
  }, [userId])
  useEffect(() => {
    if (!id) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    setMessages([])
    setPending(false)
    setError("")
    async function refresh() {
      try {
        const data = await api(`/api/agent/${id}/chat`, "GET", undefined, controller.signal)
        if (!controller.signal.aborted) {
          setMessages(data.messages)
          setPending(data.pending.length > 0)
          setSearch(data.searchAvailable)
          setError(data.error ?? "")
        }
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Could not refresh")
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(refresh, 2000)
      }
    }
    void refresh()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [id])
  async function send() {
    if (!prompt.trim() || busy || pending) return
    const current = generation.current
    setBusy(true)
    setError("")
    try {
      let session = id
      if (!session) {
        session = Crypto.randomUUID()
        const created = await api("/api/chats", "POST", {
          id: session,
          title: prompt.trim().slice(0, 100),
        })
        if (current !== generation.current) return
        setSessions((items) => [created, ...items])
        setId(session)
      }
      const input =
        retry.current?.prompt === prompt.trim()
          ? retry.current
          : { prompt: prompt.trim(), operationId: Crypto.randomUUID() }
      retry.current = input
      await api(`/api/agent/${session}/chat`, "POST", input)
      if (current !== generation.current) return
      retry.current = null
      setPrompt("")
      setPending(true)
    } catch (e) {
      if (current === generation.current)
        setError(e instanceof Error ? e.message : "Could not send")
    } finally {
      if (current === generation.current) setBusy(false)
    }
  }
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, padding: 16, gap: 12, backgroundColor: "#fff" }}
    >
      <Text style={{ fontSize: 24, fontWeight: "700", color: "#17231a" }}>Cloud Pi chats</Text>
      <Text style={{ color: "#405147" }}>
        Sessions stay in the cloud when you close the app.{" "}
        {search ? "Live web search is available." : "Live web search is not configured yet."}
      </Text>
      <ScrollView horizontal style={{ flexGrow: 0 }}>
        <Pressable
          disabled={busy}
          onPress={() => {
            generation.current++
            setBusy(false)
            setId(null)
            setMessages([])
            setPrompt("")
            setPending(false)
            retry.current = null
          }}
        >
          <Text style={{ padding: 10 }}>＋ New chat</Text>
        </Pressable>
        {sessions.map((session) => (
          <Pressable
            key={session.id}
            disabled={busy}
            onPress={() => {
              generation.current++
              setId(session.id)
              setPrompt("")
              retry.current = null
            }}
          >
            <Text style={{ padding: 10, fontWeight: id === session.id ? "700" : "400" }}>
              {session.title}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 16 }}>
        {messages.map((message) => (
          <View
            key={message.id}
            style={{
              backgroundColor: message.role === "user" ? "#edf4ed" : "#f5f5f5",
              padding: 12,
              borderRadius: 12,
            }}
          >
            <Text style={{ fontWeight: "700" }}>{message.role === "user" ? "You" : "Pi"}</Text>
            <Text selectable style={{ color: "#17231a", lineHeight: 22 }}>
              {message.text}
            </Text>
          </View>
        ))}
        {pending && <ActivityIndicator />}
      </ScrollView>
      {!!error && (
        <Text accessibilityRole="alert" style={{ color: "#a32929" }}>
          {error}
        </Text>
      )}
      <TextInput
        accessibilityLabel="Message Pi"
        multiline
        maxLength={4000}
        value={prompt}
        onChangeText={setPrompt}
        placeholder="Ask Pi a question…"
        style={{
          borderWidth: 1,
          borderColor: "#b7c9b8",
          borderRadius: 12,
          padding: 12,
          maxHeight: 130,
          color: "#17231a",
        }}
      />
      <Pressable disabled={busy || pending || !prompt.trim()} onPress={() => void send()}>
        <Text
          style={{
            padding: 12,
            textAlign: "center",
            color: "#176130",
            fontWeight: "700",
            opacity: busy || pending ? 0.4 : 1,
          }}
        >
          {busy ? "Sending…" : "Send"}
        </Text>
      </Pressable>
      {pending && id && (
        <Pressable
          onPress={() =>
            void api(`/api/agent/${id}/chat`, "DELETE").catch((e) => setError(e.message))
          }
        >
          <Text style={{ textAlign: "center" }}>Stop response</Text>
        </Pressable>
      )}
    </KeyboardAvoidingView>
  )
}
