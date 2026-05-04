import { describe, test, expect, vi, beforeEach } from "vitest";
import type { OpenVikingClient, SearchResult } from "../src/client";
import { registerMemsearchTool } from "../src/tools";

function mockClient(overrides: Partial<OpenVikingClient> = {}): OpenVikingClient {
  return {
    createSession: vi.fn(async () => "sess-1"),
    sendMessage: vi.fn(async () => {}),
    search: vi.fn(async () => ({
      memories: [],
      resources: [],
      total: 0,
    } as SearchResult)),
    read: vi.fn(async () => ({ content: "mock content" })),
    browse: vi.fn(async () => ({ uri: "viking://resources/", children: [] })),
    commit: vi.fn(async () => "task-1"),
    ...overrides,
  };
}

interface ToolResult {
  content: Array<{ type: string; text: string }>;
  details: Record<string, unknown>;
  isError?: boolean;
}

interface ToolDef {
  name: string;
  promptSnippet?: string;
  promptGuidelines?: string[];
  execute: (id: string, params: Record<string, unknown>, signal?: AbortSignal, onUpdate?: unknown, ctx?: unknown) => Promise<ToolResult>;
}

function createMockPi() {
  const tools: ToolDef[] = [];
  return {
    registerTool: vi.fn((def: ToolDef) => {
      tools.push(def);
    }),
    get tools() {
      return tools;
    },
  };
}

describe("memsearch tool", () => {
  let pi: ReturnType<typeof createMockPi>;

  beforeEach(() => {
    pi = createMockPi();
  });

  test("registers with promptSnippet and promptGuidelines", () => {
    const client = mockClient();
    registerMemsearchTool(pi as any, client);

    expect(pi.registerTool).toHaveBeenCalledOnce();
    const tool = pi.tools[0];
    expect(tool.name).toBe("memsearch");
    expect(tool.promptSnippet).toBeDefined();
    expect(tool.promptGuidelines).toBeDefined();
    expect(tool.promptGuidelines!.length).toBeGreaterThan(0);
    for (const g of tool.promptGuidelines!) {
      expect(g).toContain("memsearch");
    }
  });

  test("creates session on first call, reuses on subsequent", async () => {
    const client = mockClient({
      search: vi.fn(async () => ({
        memories: [{ text: "hello world", score: 0.95 }],
        resources: [],
        total: 1,
      } as SearchResult)),
    });
    registerMemsearchTool(pi as any, client);

    const tool = pi.tools[0];

    const result1 = await tool.execute("tc-1", { query: "hello" });
    expect(client.createSession).toHaveBeenCalledTimes(1);
    expect(result1.content[0].text).toContain("hello world");

    await tool.execute("tc-2", { query: "world" });
    expect(client.createSession).toHaveBeenCalledTimes(1);
  });

  test("returns 'No results found' when empty", async () => {
    const client = mockClient();
    registerMemsearchTool(pi as any, client);

    const tool = pi.tools[0];
    const result = await tool.execute("tc-1", { query: "nothing" });
    expect(result.content[0].text).toBe("No results found.");
  });

  test("returns isError on client failure", async () => {
    const client = mockClient({
      createSession: vi.fn(async () => {
        throw new Error("OpenViking createSession failed: server error (HTTP 500)");
      }),
    });
    registerMemsearchTool(pi as any, client);

    const tool = pi.tools[0];
    const result = await tool.execute("tc-1", { query: "test" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("HTTP 500");
  });

  test("notifies on first failure when ctx.hasUI is true", async () => {
    const client = mockClient({
      createSession: vi.fn(async () => {
        throw new Error("OpenViking createSession failed: server error (HTTP 500)");
      }),
    });
    registerMemsearchTool(pi as any, client);

    const tool = pi.tools[0];
    const notify = vi.fn();
    const ctx = { hasUI: true, ui: { notify } } as any;

    await tool.execute("tc-1", { query: "test" }, undefined, undefined, ctx);
    expect(notify).toHaveBeenCalledOnce();
    expect(notify.mock.calls[0][0]).toContain("HTTP 500");

    // Second failure — no additional notification (debounced)
    await tool.execute("tc-2", { query: "test2" }, undefined, undefined, ctx);
    expect(notify).toHaveBeenCalledOnce();
  });

  test("skips notification when ctx.hasUI is false", async () => {
    const client = mockClient({
      createSession: vi.fn(async () => {
        throw new Error("OpenViking createSession failed: server error (HTTP 500)");
      }),
    });
    registerMemsearchTool(pi as any, client);

    const tool = pi.tools[0];
    const ctx = { hasUI: false, ui: { notify: vi.fn() } } as any;

    await tool.execute("tc-1", { query: "test" }, undefined, undefined, ctx);
    expect(ctx.ui.notify).not.toHaveBeenCalled();
  });
});
