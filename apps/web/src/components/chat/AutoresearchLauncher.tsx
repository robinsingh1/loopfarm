import { useState } from "react";
import { buildAutoresearchPrompt } from "@t3tools/client-runtime/operations";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Dialog, DialogPopup, DialogTitle, DialogDescription } from "../ui/dialog";

export function AutoresearchLauncher({
  enabled,
  onPrepare,
  getPrompt,
}: {
  enabled: boolean;
  getPrompt: () => string;
  onPrepare: (prompt: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [goal, setGoal] = useState("");
  const [metric, setMetric] = useState("");
  const [checks, setChecks] = useState("");
  const [iterations, setIterations] = useState("3");
  const [error, setError] = useState("");
  return (
    <>
      <div className="px-3 pt-3">
        <Button
          variant="outline"
          disabled={!enabled}
          onClick={() => {
            const prompt = getPrompt();
            setGoal(prompt.startsWith("/autoresearch") ? "" : prompt);
            setError("");
            setOpen(true);
          }}
        >
          Autoresearch
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPopup>
          <DialogTitle>New Autoresearch session</DialogTitle>
          <DialogDescription>
            Use a dedicated clean project or worktree. Pi measures experiments; Clef decides whether
            to continue, verify, or stop.
          </DialogDescription>
          <form
            className="mt-4 grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              try {
                onPrepare(
                  buildAutoresearchPrompt({ goal, metric, checks, iterations: Number(iterations) }),
                );
                setOpen(false);
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : "Check session settings.");
              }
            }}
          >
            <label className="grid gap-2 text-sm">
              Goal
              <Input
                required
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
                placeholder="Reduce test runtime"
              />
            </label>
            <label className="grid gap-2 text-sm">
              Metric and direction
              <Input
                required
                value={metric}
                onChange={(event) => setMetric(event.target.value)}
                placeholder="Test duration in seconds; lower is better"
              />
            </label>
            <label className="grid gap-2 text-sm">
              Correctness checks
              <Input
                required
                value={checks}
                onChange={(event) => setChecks(event.target.value)}
                placeholder="All existing tests must pass"
              />
            </label>
            <label className="grid gap-2 text-sm">
              Experiments, including baseline
              <Input
                type="number"
                min={2}
                max={5}
                required
                value={iterations}
                onChange={(event) => setIterations(event.target.value)}
              />
            </label>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <p className="text-sm text-muted-foreground">
              Review the prepared prompt, then Send to start. The thread receives a saved
              Autoresearch label. No search key is required.
            </p>
            <Button type="submit">Use in new thread</Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </form>
        </DialogPopup>
      </Dialog>
    </>
  );
}
