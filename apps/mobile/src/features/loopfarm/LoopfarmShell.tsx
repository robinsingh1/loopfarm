import { useAuth, useClerk, useSSO } from "@clerk/expo"
import * as SecureStore from "expo-secure-store"
import { AsyncResult } from "effect/reactivity"
import { useConnectionController } from "../connection/useConnectionController"
import { useConnectionsReady } from "../../state/workspace"
import * as Linking from "expo-linking"
import * as WebBrowser from "expo-web-browser"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { ActivityIndicator, Pressable, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { HostedWorkspace } from "./HostedWorkspace"
import { AppRefresh } from "./AppRefresh"

WebBrowser.maybeCompleteAuthSession()

export function LoopfarmShell({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId } = useAuth()
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
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
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
  if (isSignedIn && codingOwner === userId) {
    return (
      <View style={{ flex: 1, paddingTop: inset.top, backgroundColor: "#f5f4ed" }}>
        <HostedWorkspace
          key={userId}
          onSignOut={() => void signOut().catch(() => setError("Could not sign out."))}
          withConnectionLock={(work) => {
            const next = ownerQueue.current.catch(() => {}).then(work)
            ownerQueue.current = next.catch(() => {})
            return next
          }}
        >
          {children}
        </HostedWorkspace>
        {!!error && (
          <Text accessibilityRole="alert" style={{ color: "#a12b23", padding: 12 }}>
            {error}
          </Text>
        )}
      </View>
    )
  }
  return (
    <View style={{ flex: 1, paddingTop: inset.top, backgroundColor: "#f5f4ed" }}>
      <AppRefresh />
      <View style={{ padding: 24, gap: 16 }}>
        <Text style={{ fontSize: 28, color: "#17231a" }}>Your coding and research workspace.</Text>
        {!isLoaded || isSignedIn ? (
          <ActivityIndicator />
        ) : (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void login()}
            style={{ padding: 16, backgroundColor: "#dce8dc", borderRadius: 12 }}
          >
            <Text style={{ color: "#17231a", fontWeight: "600" }}>Continue with Google</Text>
          </Pressable>
        )}
        {!!error && (
          <Text accessibilityRole="alert" style={{ color: "#a12b23" }}>
            {error}
          </Text>
        )}
      </View>
    </View>
  )
}
