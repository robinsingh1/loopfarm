import { useEffect, useMemo, useState } from "react";
import type { OrchestrationV2TurnItem } from "@t3tools/contracts";
import { clefProgressHistory } from "@t3tools/client-runtime/operations";
import { Button } from "../ui/button";

export function ClefControl({
  items,
  busy,
  canOperate,
  send,
}: {
  items: ReadonlyArray<OrchestrationV2TurnItem>;
  busy: boolean;
  canOperate: boolean;
  send: (text: string) => Promise<void>;
}) {
  const history = useMemo(() => clefProgressHistory(items), [items]);
  const latest = history.at(-1);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState("");
  useEffect(() => {
    setFeedback("");
  }, [latest?.id]);
  const command = async (action: "on" | "off" | "status") => {
    setPending(true);
    setFeedback("Waiting for Pi confirmation…");
    try {
      await send(`/loopfarm-judge ${action}`);
    } catch {
      setFeedback("Could not send. Reconnect and retry.");
    } finally {
      setPending(false);
    }
  };
  const disabled = !canOperate || busy || pending;
  return (
    <details className="border-b border-border px-4 py-2 text-sm">
      <summary className="cursor-pointer">
        Clef · {latest ? (latest.enabled ? "On" : "Off") : "Not checked"} ·{" "}
        {latest ? `${latest.attempts}/4 follow-ups requested · ${latest.event}` : "Check status"}
      </summary>
      <div className="mt-2 grid gap-2">
        <p>{latest?.detail || latest?.status || "Completion supervisor for this Pi chat"}</p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => void command(latest?.enabled ? "off" : "on")}
          >
            {latest?.enabled ? "Turn Clef off" : "Turn Clef on"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() => void command("status")}
          >
            Refresh status
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {busy
            ? "Wait for Pi to finish, or stop the turn, to change Clef."
            : "Applies to this chat. Up to four follow-ups per request. Enabling does not restart finished work."}
        </p>
        {feedback ? <p role="status">{feedback}</p> : null}
        <ol className="max-h-40 overflow-y-auto text-xs">
          {history
            .filter((row) => row.event !== "status")
            .slice(-12)
            .map((row) => (
              <li key={row.id}>
                {new Date(row.time).toLocaleTimeString()} · {row.attempts}/4 · {row.event} —{" "}
                {row.detail}
              </li>
            ))}
        </ol>
        <p className="text-xs text-muted-foreground">
          Recent activity from loaded chat history. Work details remain in the conversation.
        </p>
      </div>
    </details>
  );
}
