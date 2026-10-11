import { Dialog, DialogPopup, DialogTitle, DialogDescription } from "../ui/dialog";
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
  const [open, setOpen] = useState(false);
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
    <div className="shrink-0 border-b border-border px-4 py-2">
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        {latest ? `Clef · ${latest.enabled ? "On" : "Off"}` : "Clef"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPopup>
          <DialogTitle>Clef</DialogTitle>
          <DialogDescription>
            Checks whether Pi should continue working, verify its results, or stop.
          </DialogDescription>
          <div className="mt-2 grid gap-2">
            <p>
              {latest
                ? `Automatic follow-ups ${latest.enabled ? "on" : "off"} · ${latest.attempts} of 4 requested`
                : "Check status to see whether automatic follow-ups are enabled."}
            </p>
            {latest ? <p>{latest.detail || latest.status}</p> : null}
            <div className="flex gap-2">
              {latest ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={disabled}
                  onClick={() => void command(latest?.enabled ? "off" : "on")}
                >
                  {latest?.enabled ? "Turn Clef off" : "Turn Clef on"}
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() => void command("status")}
              >
                {latest ? "Refresh status" : "Check status"}
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
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Done
          </Button>
        </DialogPopup>
      </Dialog>
    </div>
  );
}
