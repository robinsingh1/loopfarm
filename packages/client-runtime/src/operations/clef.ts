import type { OrchestrationV2TurnItem } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
export interface ClefProgress {
  enabled: boolean;
  attempts: number;
  limit: number;
  status: string;
  event: string;
  detail: string;
}

/** Only confirmed Pi notify events drive supervisor state, never optimistic UI state. */
export function clefProgressFromItem(value: unknown): ClefProgress | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (item.type !== "dynamic_tool" || item.toolName !== "notify") return null;
  const input = item.input as { message?: unknown } | null;
  if (typeof input?.message !== "string") return null;
  const match =
    /^Clef progress: (On|Off) · ([0-4])\/4 follow-ups requested · (status|queued|started|finished|complete|blocked|paused)\nStatus: ([^\n]*)(?:\n([\s\S]*))?$/.exec(
      input.message,
    );
  if (!match) return null;
  return {
    enabled: match[1] === "On",
    attempts: Number(match[2]),
    limit: 4,
    event: match[3]!,
    status: match[4]!,
    detail: match[5] ?? "",
  };
}

export function clefProgressHistory(items: ReadonlyArray<OrchestrationV2TurnItem>) {
  return items
    .flatMap((item) => {
      const state = clefProgressFromItem(item);
      return state
        ? [
            {
              ...state,
              id: String(item.id),
              time: DateTime.formatIso(item.startedAt ?? item.updatedAt),
            },
          ]
        : [];
    })
    .sort((a, b) => a.time.localeCompare(b.time));
}
