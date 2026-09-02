import { describe, it, expect, vi } from "vitest";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { createOvGrepTool } from "./ov-grep";
import type { SearchClient } from "../../domain/client/open-viking-client";

function makeClient(overrides?: Partial<SearchClient>): SearchClient {
  return {
    find: vi.fn(),
    search: vi.fn(),
    glob: vi.fn(),
    grep: vi.fn().mockResolvedValue({ matches: [], total: 0 }),
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

describe("ov_grep tool", () => {
  it("has correct name and schema", () => {
    const tool = createOvGrepTool(makeClient());
    expect(tool.name).toBe("ov_grep");
    expect(tool.parameters).toBeDefined();
  });

  it("calls grep with pattern and returns matches", async () => {
    const client = makeClient();
    vi.mocked(client.grep!).mockResolvedValue({
      matches: [{ uri: "viking://a.md", line: 5, content: "hello world", lineNumber: 5 }],
      total: 1,
    });
    const tool = createOvGrepTool(client);
    const result = await executeTool(tool, { pattern: "hello", uri: "viking://", caseInsensitive: true });
    expect(client.grep).toHaveBeenCalledTimes(1);
    expect(client.grep).toHaveBeenCalledWith(
      "hello",
      { uri: "viking://", caseInsensitive: true, levelLimit: undefined, nodeLimit: undefined },
      undefined,
    );
    expect(result.content[0]).toMatchObject({ type: "text" });
  });

  it("handles grep failure", async () => {
    const client = makeClient();
    vi.mocked(client.grep!).mockRejectedValue(new Error("search error"));
    const tool = createOvGrepTool(client);
    const result = await executeTool(tool, { pattern: "broken" });
    const text = result.content[0] as any;
    expect(text.text).toContain("Grep failed");
    expect(text.text).toContain("search error");
  });
});
