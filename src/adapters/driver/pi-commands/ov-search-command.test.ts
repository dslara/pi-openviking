import { describe, it, expect, vi } from "vitest";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { createOvSearchCommand } from "./ov-search-command";
import type { SearchResult } from "../../../domain/knowledge/model/search-result";

function mockCtx(): ExtensionCommandContext {
  return {
    ui: { notify: vi.fn(), confirm: vi.fn() } as any,
    cwd: "/test",
    hasUI: false,
    sessionManager: {} as any,
    modelRegistry: {} as any,
    model: undefined,
    isIdle: () => true,
    signal: undefined as any,
    abort: vi.fn(),
    hasPendingMessages: () => false,
    shutdown: vi.fn(),
    getContextUsage: () => undefined,
    compact: vi.fn(),
    getSystemPrompt: () => "",
    waitForIdle: vi.fn(),
    newSession: vi.fn() as any,
    fork: vi.fn() as any,
    navigateTree: vi.fn() as any,
    switchSession: vi.fn() as any,
    reload: vi.fn() as any,
  };
}

const sampleResult: SearchResult = {
  memories: [
    { uri: "viking://kb/foo", text: "foo content", score: 0.95, abstract: "Foo abstract" },
    { uri: "viking://kb/bar", text: "bar content", score: 0.8, abstract: "Bar abstract" },
  ],
  resources: [],
  skills: [],
  total: 2,
};

describe("ov-search command", () => {
  it("calls searchClient.find with query", async () => {
    const find = vi.fn().mockResolvedValue(sampleResult);
    const cmd = createOvSearchCommand({ find } as any);
    const ctx = mockCtx();

    await cmd.handler("find something", ctx);

    expect(find).toHaveBeenCalledWith({ query: "find something" });
  });

  it("formats results as readable table", async () => {
    const find = vi.fn().mockResolvedValue(sampleResult);
    const cmd = createOvSearchCommand({ find } as any);
    const ctx = mockCtx();

    await cmd.handler("test", ctx);

    const msg = (ctx.ui.notify as any).mock.calls[0][0] as string;
    expect(msg).toContain("Results (2)");
    expect(msg).toContain("viking://kb/foo");
    expect(msg).toContain("0.950");
    expect(msg).toContain("Foo abstract");
  });

  it("shows no results message when total is 0", async () => {
    const emptyResult: SearchResult = { memories: [], resources: [], skills: [], total: 0 };
    const find = vi.fn().mockResolvedValue(emptyResult);
    const cmd = createOvSearchCommand({ find } as any);
    const ctx = mockCtx();

    await cmd.handler("nothing", ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith("No results found.", "info");
  });

  it("shows usage for empty query", async () => {
    const find = vi.fn();
    const cmd = createOvSearchCommand({ find } as any);
    const ctx = mockCtx();

    await cmd.handler("  ", ctx);

    expect(find).not.toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenCalledWith("Usage: /ov-search <query>", "warning");
  });

  it("handles search error", async () => {
    const find = vi.fn().mockRejectedValue(new Error("search backend unavailable"));
    const cmd = createOvSearchCommand({ find } as any);
    const ctx = mockCtx();

    await cmd.handler("test", ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("search backend unavailable"),
      "error",
    );
  });

  it("formats resources and skills sections", async () => {
    const multiResult: SearchResult = {
      memories: [],
      resources: [{ uri: "viking://res/doc", score: 0.7, abstract: "Resource doc" }],
      skills: [{ uri: "viking://skill/analyze", score: 0.6, abstract: "Analysis skill" }],
      total: 2,
    };
    const find = vi.fn().mockResolvedValue(multiResult);
    const cmd = createOvSearchCommand({ find } as any);
    const ctx = mockCtx();

    await cmd.handler("multi", ctx);

    const msg = (ctx.ui.notify as any).mock.calls[0][0] as string;
    expect(msg).toContain("viking://res/doc");
    expect(msg).toContain("viking://skill/analyze");
  });
});
