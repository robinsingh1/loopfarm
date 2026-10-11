import { describe, it, expect } from "vitest";
import { buildAutoresearchPrompt, autoresearchTitle, isAutoresearchTitle } from "./autoresearch.ts";
import { deriveThreadTitleSeed } from "./threadTitle.ts";

describe("native autoresearch launch", () => {
  it("builds a bounded command and a durable recognizable title", () => {
    const command = buildAutoresearchPrompt({
      goal: "Reduce test runtime",
      metric: "seconds; lower",
      checks: "pnpm test passes",
      iterations: 3,
    });
    expect(command).toMatch(/^\/autoresearch Goal:/);
    expect(command).toContain("maxIterations to 3");
    expect(command).toContain("pnpm test passes");
    const title = deriveThreadTitleSeed({ text: command, attachments: [] });
    expect(title).toBe("Autoresearch · Reduce test runtime");
    expect(isAutoresearchTitle(title)).toBe(true);
  });
  it("does not label help or control commands as research sessions", () => {
    for (const text of [
      "hello",
      "/autoresearch help",
      "/autoresearch off",
      "/autoresearch",
      "/autoresearch clear",
      "/autoresearch dashboard",
    ])
      expect(autoresearchTitle(text)).toBeNull();
  });
  it("rejects incomplete setup and budgets beyond hosted supervision", () => {
    const input = { goal: "g", metric: "m", checks: "c", iterations: 3 };
    for (const iterations of [0, 1, 6, 2.5, NaN])
      expect(() => buildAutoresearchPrompt({ ...input, iterations })).toThrow();
    expect(() => buildAutoresearchPrompt({ ...input, checks: " " })).toThrow();
  });
});
