import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
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
    <View className="border-b border-border px-4 py-2 gap-2">
      <Pressable accessibilityRole="button" onPress={() => setExpanded(!expanded)}>
        <Text className="font-t3-medium text-foreground">
          Clef · {latest ? (latest.enabled ? "On" : "Off") : "Not checked"} ·{" "}
          {latest ? `${latest.attempts}/4 follow-ups requested` : "Check status"}
        </Text>
        <Text className="text-xs text-muted-foreground">
          {latest
            ? `${latest.event}: ${latest.detail || latest.status}`
            : "Completion supervisor for this Pi chat"}{" "}
          · {expanded ? "Hide" : "Details"}
        </Text>
      </Pressable>
      {expanded ? (
        <>
          <View className="flex-row gap-4">
            <Pressable
              accessibilityRole="button"
              disabled={disabled}
              onPress={() => void command(latest?.enabled ? "off" : "on")}
              style={{ opacity: disabled ? 0.4 : 1 }}
            >
              <Text className="text-foreground">
                {latest?.enabled ? "Turn Clef off" : "Turn Clef on"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={disabled}
              onPress={() => void command("status")}
              style={{ opacity: disabled ? 0.4 : 1 }}
            >
              <Text className="text-foreground">Refresh status</Text>
            </Pressable>
          </View>
          <Text className="text-xs text-muted-foreground">
            {busy
              ? "Wait for Pi to finish, or stop the turn, to change Clef."
              : "Applies to this chat. Up to four follow-ups per request. Enabling does not restart finished work."}
          </Text>
          {feedback ? <Text className="text-xs text-muted-foreground">{feedback}</Text> : null}
          <ScrollView style={{ maxHeight: 160 }} nestedScrollEnabled>
            {history
              .filter((row) => row.event !== "status")
              .slice(-12)
              .map((row) => (
                <Text key={row.id} className="text-xs text-foreground py-1">
                  {new Date(row.time).toLocaleTimeString()} · {row.attempts}/4 · {row.event} —{" "}
                  {row.detail}
                </Text>
              ))}
            <Text className="text-xs text-muted-foreground">
              Recent activity from loaded chat history. Work details remain in the conversation.
            </Text>
          </ScrollView>
        </>
      ) : null}
    </View>
  );
}
