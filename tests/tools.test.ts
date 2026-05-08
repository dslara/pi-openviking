import { describe, test, expect, vi, beforeEach } from "vitest";
import type { SearchResult } from "../src/client";
import { registerMemsearchTool, registerMemreadTool, registerMembrowseTool, registerMemcommitTool } from "../src/tools";
import { createMockClient, createMockSessionSync } from "./mocks";

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
    const client = createMockClient();
    const sync = createMockSessionSync();
    registerMemsearchTool(pi as any, client, sync);

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

  test("uses sync session and calls search", async () => {
    const client = createMockClient({
      search: vi.fn(async () => ({
        memories: [{ text: "hello world", score: 0.95 }],
        resources: [],
        skills: [],
        total: 1,
      } as SearchResult)),
    });
    const sync = createMockSessionSync({ getOvSessionId: () => "ov-sess-1" });
    registerMemsearchTool(pi as any, client, sync);

    const tool = pi.tools[0];

    const result = await tool.execute("tc-1", { query: "hello" });
    expect(client.createSession).not.toHaveBeenCalled();
    expect(client.search).toHaveBeenCalledWith("ov-sess-1", "hello", 10, "deep", undefined);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.memories[0].text).toBe("hello world");
  });

  test("returns 'No results found' when empty", async () => {
    const client = createMockClient();
    const sync = createMockSessionSync();
    registerMemsearchTool(pi as any, client, sync);

    const tool = pi.tools[0];
    const result = await tool.execute("tc-1", { query: "nothing" });
    expect(result.content[0].text).toBe("No results found.");
  });

  test("returns isError on client failure", async () => {
    const client = createMockClient({
      search: vi.fn(async () => {
        throw new Error("OpenViking search failed: server error (HTTP 500)");
      }),
    });
    const sync = createMockSessionSync();
    registerMemsearchTool(pi as any, client, sync);

    const tool = pi.tools[0];
    const result = await tool.execute("tc-1", { query: "test" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("HTTP 500");
  });

  test("notifies on first failure when ctx.hasUI is true", async () => {
    const client = createMockClient({
      search: vi.fn(async () => {
        throw new Error("OpenViking search failed: server error (HTTP 500)");
      }),
    });
    const sync = createMockSessionSync();
    registerMemsearchTool(pi as any, client, sync);

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
    const client = createMockClient({
      search: vi.fn(async () => {
        throw new Error("OpenViking search failed: server error (HTTP 500)");
      }),
    });
    const sync = createMockSessionSync();
    registerMemsearchTool(pi as any, client, sync);

    const tool = pi.tools[0];
    const ctx = { hasUI: false, ui: { notify: vi.fn() } } as any;

    await tool.execute("tc-1", { query: "test" }, undefined, undefined, ctx);
    expect(ctx.ui.notify).not.toHaveBeenCalled();
  });

  test("auto mode resolves to deep when session available", async () => {
    const search = vi.fn(async () => ({ memories: [], resources: [], skills: [], total: 0 } as SearchResult));
    const client = createMockClient({ search });
    const sync = createMockSessionSync({ getOvSessionId: () => "ov-sess-1" });
    registerMemsearchTool(pi as any, client, sync);

    const tool = pi.tools[0];
    await tool.execute("tc-1", { query: "test", mode: "auto" });
    expect(search).toHaveBeenCalledWith("ov-sess-1", "test", 10, "deep", undefined);
  });

  test("auto mode resolves to fast when no session and simple query", async () => {
    const search = vi.fn(async () => ({ memories: [], resources: [], skills: [], total: 0 } as SearchResult));
    const client = createMockClient({ search });
    const sync = createMockSessionSync({ getOvSessionId: () => undefined });
    registerMemsearchTool(pi as any, client, sync);

    const tool = pi.tools[0];
    await tool.execute("tc-1", { query: "test", mode: "auto" });
    expect(search).toHaveBeenCalledWith(undefined, "test", 10, "fast", undefined);
  });

  test("deep mode without session still passes deep to client fallback", async () => {
    const search = vi.fn(async () => ({ memories: [], resources: [], skills: [], total: 0 } as SearchResult));
    const client = createMockClient({ search });
    const sync = createMockSessionSync({ getOvSessionId: () => undefined });
    registerMemsearchTool(pi as any, client, sync);

    const tool = pi.tools[0];
    await tool.execute("tc-1", { query: "test", mode: "deep" });
    // resolveSearchMode returns "deep"; client.search internally falls back to /find when no session
    expect(search).toHaveBeenCalledWith(undefined, "test", 10, "deep", undefined);
  });

  test("auto mode resolves to deep for complex query without session", async () => {
    const search = vi.fn(async () => ({ memories: [], resources: [], skills: [], total: 0 } as SearchResult));
    const client = createMockClient({ search });
    const sync = createMockSessionSync({ getOvSessionId: () => undefined });
    registerMemsearchTool(pi as any, client, sync);

    const tool = pi.tools[0];
    const complexQuery = "What are the detailed coding preferences and patterns used across all previous sessions?";
    await tool.execute("tc-1", { query: complexQuery, mode: "auto" });
    expect(search).toHaveBeenCalledWith(undefined, complexQuery, 10, "deep", undefined);
  });
});

describe("memread tool", () => {
  let pi: ReturnType<typeof createMockPi>;

  beforeEach(() => {
    pi = createMockPi();
  });

  test("registers with promptSnippet and no promptGuidelines", () => {
    const client = createMockClient();
    registerMemreadTool(pi as any, client);

    const tool = pi.tools.find((t) => t.name === "memread");
    expect(tool).toBeDefined();
    expect(tool!.promptSnippet).toBeDefined();
    expect(tool!.promptGuidelines).toBeUndefined();
  });

  test("reads content at explicit read level", async () => {
    const client = createMockClient({
      read: vi.fn(async () => ({ content: "# Hello\n\nWorld" })),
    });
    registerMemreadTool(pi as any, client);

    const tool = pi.tools.find((t) => t.name === "memread")!;
    const result = await tool.execute("tc-1", { uri: "viking://docs/readme.md", level: "read" });

    expect(client.read).toHaveBeenCalledWith("viking://docs/readme.md", "read", undefined);
    expect(result.content[0].text).toBe("# Hello\n\nWorld");
  });

  test("auto-level resolves to read for files", async () => {
    const client = createMockClient({
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
    const client = createMockClient({
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
    const client = createMockClient();
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
    const client = createMockClient();
    const sync = createMockSessionSync();
    registerMemcommitTool(pi as any, client, sync);

    const tool = pi.tools.find((t) => t.name === "memcommit");
    expect(tool).toBeDefined();
    expect(tool!.promptSnippet).toBeDefined();
    expect(tool!.promptGuidelines).toBeDefined();
    expect(tool!.promptGuidelines!.length).toBeGreaterThan(0);
    expect(tool!.parameters).toBeDefined();
  });

  test("returns error when no session mapped", async () => {
    const client = createMockClient();
    const sync = createMockSessionSync({ getOvSessionId: () => undefined });
    registerMemcommitTool(pi as any, client, sync);

    const tool = pi.tools.find((t) => t.name === "memcommit")!;
    const result = await tool.execute("tc-1", {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("No OpenViking session mapped");
    expect(client.commit).not.toHaveBeenCalled();
  });

  test("flushes pending messages and calls commit with ovSessionId", async () => {
    const client = createMockClient({
      commit: vi.fn(async () => ({ task_id: "task-abc", archived: true })),
    });
    const sync = createMockSessionSync({ getOvSessionId: () => "ov-sess-123" });
    registerMemcommitTool(pi as any, client, sync);

    const tool = pi.tools.find((t) => t.name === "memcommit")!;
    const onUpdate = vi.fn();
    const result = await tool.execute("tc-1", {}, undefined, onUpdate);

    expect(sync.flush).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith({ content: [{ type: "text", text: "Committing session to OpenViking..." }], details: {} });
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
    const client = createMockClient();
    registerMembrowseTool(pi as any, client);

    const tool = pi.tools.find((t) => t.name === "membrowse");
    expect(tool).toBeDefined();
    expect(tool!.promptSnippet).toBeDefined();
    expect(tool!.promptGuidelines).toBeUndefined();
  });

  test("lists directory contents", async () => {
    const client = createMockClient({
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
    const client = createMockClient({
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
    const client = createMockClient({
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
    const client = createMockClient();
    registerMembrowseTool(pi as any, client);

    const tool = pi.tools.find((t) => t.name === "membrowse")!;
    const result = await tool.execute("tc-1", { uri: "http://example.com", view: "list" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("viking://");
    expect(client.fsList).not.toHaveBeenCalled();
  });
});
