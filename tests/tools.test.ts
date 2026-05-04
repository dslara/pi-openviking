import { describe, test, expect, vi, beforeEach } from "vitest";
import type { OpenVikingClient, SearchResult } from "../src/client";
import { registerMemsearchTool, registerMemreadTool, registerMembrowseTool, registerMemcommitTool } from "../src/tools";

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
    fsList: vi.fn(async () => ({ uri: "viking://resources/", children: [] })),
    fsTree: vi.fn(async () => ({ uri: "viking://resources/", children: [] })),
    fsStat: vi.fn(async () => ({ uri: "viking://resources/", children: [] })),
    commit: vi.fn(async () => ({ task_id: "task-1", archived: true })),
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
  parameters?: unknown;
  execute: (id: string, params: Record<string, unknown>, signal?: AbortSignal, onUpdate?: unknown, ctx?: unknown) => Promise<ToolResult>;
}

function mockSessionSync(overrides: Partial<{ getOvSessionId(): string | undefined; flush(): Promise<void> }> = {}) {
  return {
    getOvSessionId: vi.fn(() => "ov-sess-1"),
    flush: vi.fn(async () => {}),
    ...overrides,
  };
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

describe("memread tool", () => {
  let pi: ReturnType<typeof createMockPi>;

  beforeEach(() => {
    pi = createMockPi();
  });

  test("registers with promptSnippet and no promptGuidelines", () => {
    const client = mockClient();
    registerMemreadTool(pi as any, client);

    const tool = pi.tools.find((t) => t.name === "memread");
    expect(tool).toBeDefined();
    expect(tool!.promptSnippet).toBeDefined();
    expect(tool!.promptGuidelines).toBeUndefined();
  });

  test("reads content at explicit read level", async () => {
    const client = mockClient({
      read: vi.fn(async () => ({ content: "# Hello\n\nWorld" })),
    });
    registerMemreadTool(pi as any, client);

    const tool = pi.tools.find((t) => t.name === "memread")!;
    const result = await tool.execute("tc-1", { uri: "viking://docs/readme.md", level: "read" });

    expect(client.read).toHaveBeenCalledWith("viking://docs/readme.md", "read", undefined);
    expect(result.content[0].text).toBe("# Hello\n\nWorld");
  });

  test("auto-level resolves to read for files", async () => {
    const client = mockClient({
      fsStat: vi.fn(async () => ({ uri: "viking://docs/readme.md", children: [{ uri: "viking://docs/readme.md", type: "file" }] })),
      read: vi.fn(async () => ({ content: "file content" })),
    });
    registerMemreadTool(pi as any, client);

    const tool = pi.tools.find((t) => t.name === "memread")!;
    const result = await tool.execute("tc-1", { uri: "viking://docs/readme.md", level: "auto" });

    expect(client.fsStat).toHaveBeenCalledWith("viking://docs/readme.md", undefined);
    expect(client.read).toHaveBeenCalledWith("viking://docs/readme.md", "read", undefined);
    expect(result.content[0].text).toBe("file content");
  });

  test("auto-level resolves to overview for directories", async () => {
    const client = mockClient({
      fsStat: vi.fn(async () => ({ uri: "viking://docs/", children: [{ uri: "viking://docs/", type: "directory" }] })),
      read: vi.fn(async () => ({ content: "dir overview" })),
    });
    registerMemreadTool(pi as any, client);

    const tool = pi.tools.find((t) => t.name === "memread")!;
    const result = await tool.execute("tc-1", { uri: "viking://docs/", level: "auto" });

    expect(client.fsStat).toHaveBeenCalledWith("viking://docs/", undefined);
    expect(client.read).toHaveBeenCalledWith("viking://docs/", "overview", undefined);
    expect(result.content[0].text).toBe("dir overview");
  });

  test("returns error for invalid URI prefix", async () => {
    const client = mockClient();
    registerMemreadTool(pi as any, client);

    const tool = pi.tools.find((t) => t.name === "memread")!;
    const result = await tool.execute("tc-1", { uri: "https://example.com", level: "read" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("viking://");
    expect(client.read).not.toHaveBeenCalled();
  });
});

describe("memcommit tool", () => {
  let pi: ReturnType<typeof createMockPi>;

  beforeEach(() => {
    pi = createMockPi();
  });

  test("registers with promptSnippet and promptGuidelines", () => {
    const client = mockClient();
    const sync = mockSessionSync();
    registerMemcommitTool(pi as any, client, sync);

    const tool = pi.tools.find((t) => t.name === "memcommit");
    expect(tool).toBeDefined();
    expect(tool!.promptSnippet).toBeDefined();
    expect(tool!.promptGuidelines).toBeDefined();
    expect(tool!.promptGuidelines!.length).toBeGreaterThan(0);
    expect(tool!.parameters).toBeDefined();
  });

  test("returns error when no session mapped", async () => {
    const client = mockClient();
    const sync = mockSessionSync({ getOvSessionId: () => undefined });
    registerMemcommitTool(pi as any, client, sync);

    const tool = pi.tools.find((t) => t.name === "memcommit")!;
    const result = await tool.execute("tc-1", {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("No OpenViking session mapped");
    expect(client.commit).not.toHaveBeenCalled();
  });

  test("flushes pending messages and calls commit with ovSessionId", async () => {
    const client = mockClient({
      commit: vi.fn(async () => ({ task_id: "task-abc", archived: true })),
    });
    const sync = mockSessionSync({ getOvSessionId: () => "ov-sess-123" });
    registerMemcommitTool(pi as any, client, sync);

    const tool = pi.tools.find((t) => t.name === "memcommit")!;
    const onUpdate = vi.fn();
    const result = await tool.execute("tc-1", {}, undefined, onUpdate);

    expect(sync.flush).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith("Committing session to OpenViking...");
    expect(client.commit).toHaveBeenCalledWith("ov-sess-123", undefined);
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("task-abc");
    expect(result.content[0].text).toContain("Archived");
  });
});

describe("membrowse tool", () => {
  let pi: ReturnType<typeof createMockPi>;

  beforeEach(() => {
    pi = createMockPi();
  });

  test("registers with promptSnippet and no promptGuidelines", () => {
    const client = mockClient();
    registerMembrowseTool(pi as any, client);

    const tool = pi.tools.find((t) => t.name === "membrowse");
    expect(tool).toBeDefined();
    expect(tool!.promptSnippet).toBeDefined();
    expect(tool!.promptGuidelines).toBeUndefined();
  });

  test("lists directory contents", async () => {
    const client = mockClient({
      fsList: vi.fn(async () => ({
        uri: "viking://resources/docs/",
        children: [
          { uri: "viking://resources/docs/api.md", type: "file", abstract: "API ref" },
          { uri: "viking://resources/docs/guides/", type: "directory" },
        ],
      })),
    });
    registerMembrowseTool(pi as any, client);

    const tool = pi.tools.find((t) => t.name === "membrowse")!;
    const result = await tool.execute("tc-1", { uri: "viking://resources/docs/", view: "list" });

    expect(client.fsList).toHaveBeenCalledWith("viking://resources/docs/", undefined);
    expect(result.content[0].text).toContain("api.md");
    expect(result.content[0].text).toContain("guides/");
  });

  test("returns tree view", async () => {
    const client = mockClient({
      fsTree: vi.fn(async () => ({
        uri: "viking://resources/",
        children: [
          { uri: "viking://resources/docs/", type: "directory" },
          { uri: "viking://resources/README.md", type: "file" },
        ],
      })),
    });
    registerMembrowseTool(pi as any, client);

    const tool = pi.tools.find((t) => t.name === "membrowse")!;
    const result = await tool.execute("tc-1", { uri: "viking://resources/", view: "tree" });

    expect(client.fsTree).toHaveBeenCalledWith("viking://resources/", undefined);
    expect(result.content[0].text).toContain("README.md");
  });

  test("returns stat view", async () => {
    const client = mockClient({
      fsStat: vi.fn(async () => ({
        uri: "viking://resources/file.md",
        children: [{ uri: "viking://resources/file.md", type: "file" }],
      })),
    });
    registerMembrowseTool(pi as any, client);

    const tool = pi.tools.find((t) => t.name === "membrowse")!;
    const result = await tool.execute("tc-1", { uri: "viking://resources/file.md", view: "stat" });

    expect(client.fsStat).toHaveBeenCalledWith("viking://resources/file.md", undefined);
    expect(result.content[0].text).toContain("file");
  });

  test("returns error for invalid URI prefix", async () => {
    const client = mockClient();
    registerMembrowseTool(pi as any, client);

    const tool = pi.tools.find((t) => t.name === "membrowse")!;
    const result = await tool.execute("tc-1", { uri: "http://example.com", view: "list" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("viking://");
    expect(client.fsList).not.toHaveBeenCalled();
  });
});
