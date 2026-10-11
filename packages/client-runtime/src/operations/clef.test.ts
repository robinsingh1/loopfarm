import { describe, expect, it } from "vitest";
import { clefProgressFromItem } from "./clef";
const item = (state: {
  enabled: boolean;
  attempts: number;
  event: string;
  status: string;
  detail: string;
}) => ({
  type: "dynamic_tool",
  toolName: "notify",
  input: {
    message: `Clef progress: ${state.enabled ? "On" : "Off"} · ${state.attempts}/4 follow-ups requested · ${state.event}\nStatus: ${state.status}\n${state.detail}`,
  },
});
const state = {
  enabled: true,
  attempts: 1,
  limit: 4,
  status: "verify",
  event: "queued",
  detail: "Run checks",
};
describe("confirmed Clef progress", () => {
  it("preserves queued versus actually started evidence", () => {
    expect(clefProgressFromItem(item(state))?.event).toBe("queued");
    expect(clefProgressFromItem(item({ ...state, event: "started" }))?.event).toBe("started");
    expect(clefProgressFromItem(item({ ...state, enabled: false }))?.enabled).toBe(false);
  });
  it("rejects unrelated tools, malformed events and impossible counts", () => {
    expect(clefProgressFromItem({ ...item(state), toolName: "bash" })).toBeNull();
    for (const change of [{ attempts: 5 }, { attempts: -1 }, { event: "unknown" }])
      expect(clefProgressFromItem(item({ ...state, ...change }))).toBeNull();
    expect(
      clefProgressFromItem({
        type: "dynamic_tool",
        toolName: "notify",
        input: { message: "Clef state: invalid" },
      }),
    ).toBeNull();
  });
});
