import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import * as Option from "effect/Option";
import { MessageId, type EnvironmentId } from "@t3tools/contracts";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { clefProgressHistory } from "@t3tools/client-runtime/operations";
import { AppText as Text } from "../../components/AppText";
import { threadEnvironment, useEnvironmentThread } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { uuidv4 } from "../../lib/uuid";

export function ClefControl({
  environmentId,
  thread,
  busy,
  canOperate,
}: {
  environmentId: EnvironmentId;
  thread: EnvironmentThreadShell;
  busy: boolean;
  canOperate: boolean;
}) {
  const insets = useSafeAreaInsets();
  const state = useEnvironmentThread(environmentId, thread.id);
  const projection = Option.getOrNull(state.data);
  const history = useMemo(
    () => clefProgressHistory(projection?.turnItems ?? []),
    [projection?.turnItems],
  );
  const latest = history.at(-1);
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const send = useAtomCommand(threadEnvironment.startTurn, { reportFailure: false });
  useEffect(() => {
    setFeedback("");
  }, [latest?.id]);
  const command = async (action: "on" | "off" | "status") => {
    setPending(true);
    setFeedback("Waiting for Pi confirmation…");
    try {
      const result = await send({
        environmentId,
        input: {
          threadId: thread.id,
          message: {
            messageId: MessageId.make(uuidv4()),
            role: "user",
            text: `/loopfarm-judge ${action}`,
            attachments: [],
          },
          runtimeMode: thread.runtimeMode,
          interactionMode: thread.interactionMode,
          dispatchMode: "queue",
        },
      });
      if (result._tag === "Failure") setFeedback("Could not send. Reconnect and retry.");
    } catch {
      setFeedback("Could not send. Reconnect and retry.");
    } finally {
      setPending(false);
    }
  };
  const disabled = !canOperate || busy || pending;
  return (
    <View
      style={{ flexShrink: 0, alignItems: "flex-end", paddingHorizontal: 16, paddingVertical: 4 }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Clef settings and follow-up history"
        onPress={() => setExpanded(true)}
        className="rounded-full border border-border bg-background px-3 py-2"
      >
        <Text
          numberOfLines={1}
          style={{ lineHeight: 20 }}
          className="text-sm font-t3-medium text-foreground"
        >
          {latest ? `Clef · ${latest.enabled ? "On" : "Off"}` : "Clef"}
        </Text>
      </Pressable>
      <Modal
        visible={expanded}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setExpanded(false)}
      >
        <ScrollView
          className="flex-1 bg-background"
          contentContainerStyle={{
            padding: 24,
            paddingTop: insets.top + 24,
            paddingBottom: insets.bottom + 24,
            gap: 20,
          }}
        >
          <View className="flex-row items-center justify-between gap-4">
            <Text style={{ lineHeight: 30 }} className="text-2xl font-t3-semibold text-foreground">
              Clef
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setExpanded(false)}
              className="p-3"
            >
              <Text className="text-foreground">Done</Text>
            </Pressable>
          </View>
          <Text style={{ lineHeight: 22 }} className="text-foreground">
            Checks whether Pi should continue working, verify its results, or stop.
          </Text>
          <Text style={{ lineHeight: 22 }} className="font-t3-medium text-foreground">
            {latest
              ? `Automatic follow-ups ${latest.enabled ? "on" : "off"}`
              : "Check status to see whether automatic follow-ups are enabled."}
          </Text>
          {latest ? (
            <Text style={{ lineHeight: 22 }} className="text-muted-foreground">
              {latest.attempts} of 4 follow-ups requested for this request.
              {latest.detail || latest.status}
            </Text>
          ) : null}
          <View style={{ gap: 12 }}>
            {latest ? (
              <Pressable
                accessibilityRole="button"
                disabled={disabled}
                onPress={() => void command(latest.enabled ? "off" : "on")}
                className="rounded-xl border border-border p-4"
                style={{ opacity: disabled ? 0.4 : 1 }}
              >
                <Text className="text-foreground">
                  {latest.enabled ? "Turn Clef off" : "Turn Clef on"}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={disabled}
              onPress={() => void command("status")}
              className="rounded-xl border border-border p-4"
              style={{ opacity: disabled ? 0.4 : 1 }}
            >
              <Text className="text-foreground">{latest ? "Refresh status" : "Check status"}</Text>
            </Pressable>
          </View>
          <Text style={{ lineHeight: 20 }} className="text-sm text-muted-foreground">
            {busy
              ? "Wait for Pi to finish, or stop the turn, to change Clef."
              : "Applies to this chat. Enabling does not restart finished work."}
          </Text>
          {feedback ? (
            <Text style={{ lineHeight: 20 }} className="text-sm text-muted-foreground">
              {feedback}
            </Text>
          ) : null}
          <Text className="font-t3-semibold text-foreground">Recent follow-ups</Text>
          {history.filter((row) => row.event !== "status").length === 0 ? (
            <Text className="text-muted-foreground">
              No follow-up activity in loaded chat history yet.
            </Text>
          ) : null}
          {history
            .filter((row) => row.event !== "status")
            .slice(-12)
            .map((row) => (
              <View key={row.id} style={{ gap: 6 }}>
                <Text style={{ lineHeight: 20 }} className="text-sm font-t3-medium text-foreground">
                  {new Date(row.time).toLocaleTimeString()} · {row.event}
                </Text>
                <Text style={{ lineHeight: 22 }} className="text-muted-foreground">
                  {row.detail}
                </Text>
              </View>
            ))}
        </ScrollView>
      </Modal>
    </View>
  );
}
