import { clefDecisionFromItem } from "./toolPresentation";
import { describe, expect, it } from "@effect/vitest";

import { extractToolActivityPresentation } from "./toolPresentation.ts";

describe("extractToolActivityPresentation", () => {
  it("retains valid image paths independently of redacted output", () => {
    expect(
      extractToolActivityPresentation({ viewedImagePath: " /workspace/reference.webp " }),
    ).toEqual({ viewedImagePath: "/workspace/reference.webp" });
    for (const viewedImagePath of [
      "/workspace/README.md",
      "/workspace/a.png\nother",
      "x".repeat(4097) + ".png",
    ])
      expect(extractToolActivityPresentation({ viewedImagePath })).toEqual({});
  });

  it("reads provider-neutral presentation fields", () => {
    expect(
      extractToolActivityPresentation({
        toolSurface: "browser",
        toolIcon: {
          _tag: "website",
          pageUrl: "https://example.com/docs",
          faviconUrl: "https://example.com/favicon.png",
          faviconUrlDark: "https://example.com/favicon-dark.png",
        },
        toolSource: {
          key: "integration:example",
          name: "Example",
          kind: "integration",
          icon: {
            _tag: "themed-logo",
            logoUrl: "https://example.com/logo-light.png",
            logoUrlDark: "https://example.com/logo-dark.png",
          },
        },
      }),
    ).toEqual({
      toolSurface: "browser",
      toolIcon: {
        _tag: "website",
        pageUrl: "https://example.com/docs",
        faviconUrl: "https://example.com/favicon.png",
        faviconUrlDark: "https://example.com/favicon-dark.png",
      },
      toolSource: {
        key: "integration:example",
        name: "Example",
        kind: "integration",
        icon: {
          _tag: "themed-logo",
          logoUrl: "https://example.com/logo-light.png",
          logoUrlDark: "https://example.com/logo-dark.png",
        },
      },
    });
  });

  it("reads provider-neutral native app icons", () => {
    expect(
      extractToolActivityPresentation({
        toolSurface: "computer",
        toolIcon: {
          _tag: "native-app",
          app: { _tag: "app-id", appId: "com.example.Editor" },
        },
        toolSource: {
          key: "native-app:com.example.editor",
          name: "Editor",
          kind: "computer",
        },
      }),
    ).toEqual({
      toolSurface: "computer",
      toolIcon: {
        _tag: "native-app",
        app: { _tag: "app-id", appId: "com.example.Editor" },
      },
      toolSource: {
        key: "native-app:com.example.editor",
        name: "Editor",
        kind: "computer",
      },
    });
  });

  it("does not infer presentation from provider-specific payload data", () => {
    expect(
      extractToolActivityPresentation({
        data: {
          item: {
            arguments: { code: 'await sky.click({ app: "Finder" })' },
            result: {
              _meta: {
                "codex/toolSurface": {
                  kind: "computerUse",
                  app: { kind: "displayName", displayName: "Finder" },
                },
              },
            },
          },
        },
      }),
    ).toEqual({});
  });
});

describe("Clef decisions", () => {
  it("recognizes only decision notifications and retains the explanation", () => {
    const item = {
      type: "dynamic_tool",
      toolName: "notify",
      input: { message: "Clef decision: verify\nRun checks.\nDecision score: 85%." },
    };
    expect(clefDecisionFromItem(item)).toEqual({
      action: "verify",
      explanation: "Run checks.\nDecision score: 85%.",
    });
    expect(clefDecisionFromItem({ ...item, toolName: "bash" })).toBeNull();
    expect(
      clefDecisionFromItem({ ...item, input: { message: "Clef decision: unknown\nWrong" } }),
    ).toBeNull();
    expect(clefDecisionFromItem(null)).toBeNull();
  });
});
