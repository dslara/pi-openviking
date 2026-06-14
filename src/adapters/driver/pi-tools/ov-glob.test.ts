import { describe, it, expect, vi } from "vitest";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { createOvGlobTool } from "./ov-glob";
import type { SearchClient } from "../../../domain/client/open-viking-client";

function makeClient(overrides?: Partial<SearchClient>): SearchClient {
  return {
    find: vi.fn(),
    search: vi.fn(),
    glob: vi.fn().mockResolvedValue({ entries: [], total: 0 }),
    grep: vi.fn(),
    ...overrides,
  };
}

function executeTool(tool: ToolDefinition, params: Record<string, unknown>) {
  return tool.execute("test-call", params as any, undefined, undefined, {
    cwd: "/test",
    hasUI: false,
    ui: {} as any,
    sessionManager: {} as any,
    modelRegistry: {} as any,
    model: undefined,
    isIdle: () => true,
    signal: undefined,
    abort: () => {},
    hasPendingMessages: () => false,
    shutdown: () => {},
    getContextUsage: () => undefined,
    compact: () => {},
    getSystemPrompt: () => "",
  } as any);
}

describe("ov_glob tool", () => {
  it("has correct name and schema", () => {
    const tool = createOvGlobTool(makeClient());
    expect(tool.name).toBe("ov_glob");
    expect(tool.parameters).toBeDefined();
  });

  it("calls glob and returns entries", async () => {
    const client = makeClient();
    vi.mocked(client.glob!).mockResolvedValue({ entries: ["viking://a.md", "viking://b.md"], total: 2 });
    const tool = createOvGlobTool(client);
    const result = await executeTool(tool, { pattern: "viking://**/*.md" });
    expect(client.glob).toHaveBeenCalledTimes(1);
    expect(client.glob).toHaveBeenCalledWith("viking://**/*.md", undefined, undefined, undefined);
    expect(result.content[0]).toMatchObject({ type: "text" });
  });

  it("passes uri and limit through", async () => {
    const client = makeClient();
    vi.mocked(client.glob!).mockResolvedValue({ entries: [], total: 0 });
    const tool = createOvGlobTool(client);
    await executeTool(tool, { pattern: "viking://**/*.ts", uri: "viking://src", limit: 50 });
    expect(client.glob).toHaveBeenCalledWith("viking://**/*.ts", "viking://src", 50, undefined);
  });

  it("handles glob failure", async () => {
    const client = makeClient();
    vi.mocked(client.glob!).mockRejectedValue(new Error("connection error"));
    const tool = createOvGlobTool(client);
    const result = await executeTool(tool, { pattern: "viking://**/*.md" });
    const text = result.content[0] as any;
    expect(text.text).toContain("Glob failed");
    expect(text.text).toContain("connection error");
  });
});
