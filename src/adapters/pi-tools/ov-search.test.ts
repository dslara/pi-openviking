import { describe, it, expect, vi } from "vitest";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { createOvSearchTool } from "./ov-search";
import type { SearchClient } from "../../domain/client/open-viking-client";
import type { SearchResult } from "../../domain/knowledge/search-result";
import type { RecallConfig } from "../../domain/common/recall-config";
import type { Logger } from "../../domain/ports/logger";

const emptyResult: SearchResult = { memories: [], resources: [], skills: [], total: 0 };

function makeClient(overrides?: Partial<SearchClient>): SearchClient {
  return {
    find: vi.fn().mockResolvedValue(emptyResult),
    search: vi.fn().mockResolvedValue(emptyResult),
    glob: vi.fn().mockResolvedValue({ entries: [], total: 0 }),
    grep: vi.fn().mockResolvedValue({ matches: [], total: 0 }),
    ...overrides,
  };
}

function makeConfig(searchMode: "find" | "search" = "find"): RecallConfig {
  return {
    searchMode,
    topN: 5,
    scoreThreshold: 0.5,
    maxTokens: 4000,
    expandGraph: false,
    expandGraphDepth: 1,
    expandGraphMaxRatio: 0.2,
    expandGraphMinSeedScore: 0.4,
    recallSearchTimeout: 5000,
    autoRecall: true,
  };
}

function makeLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    isEnabled: () => true,
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

function getText(result: any): string {
  return result.content[0].text as string;
}

describe("ov_search tool", () => {
  it("has correct name and schema", () => {
    const tool = createOvSearchTool(makeClient(), makeConfig(), makeLogger());
    expect(tool.name).toBe("ov_search");
    expect(tool.parameters).toBeDefined();
  });

  it("calls find with mode=find and returns formatted result", async () => {
    const client = makeClient();
    vi.mocked(client.find!).mockResolvedValue({ memories: [], resources: [], skills: [], total: 5 });
    const tool = createOvSearchTool(client, makeConfig(), makeLogger());
    const result = await executeTool(tool, { query: "test query", mode: "find" });
    expect(client.find).toHaveBeenCalledTimes(1);
    expect(client.find).toHaveBeenCalledWith(
      { query: "test query", limit: undefined, targetUri: undefined, peerId: undefined },
      expect.any(Object),
      undefined,
    );
    expect(result.content[0]).toMatchObject({ type: "text" });
    expect(getText(result)).not.toContain("failed");
  });

  it("calls search with mode=search", async () => {
    const client = makeClient();
    vi.mocked(client.search!).mockResolvedValue(emptyResult);
    const tool = createOvSearchTool(client, makeConfig(), makeLogger());
    await executeTool(tool, { query: "deep query", mode: "search" });
    expect(client.search).toHaveBeenCalledTimes(1);
    expect(client.search).toHaveBeenCalledWith(
      { query: "deep query", limit: undefined, targetUri: undefined, sessionId: undefined, peerId: undefined },
      expect.any(Object),
      undefined,
    );
  });

  it("uses config.searchMode when mode=auto and searchMode=find", async () => {
    const client = makeClient();
    const tool = createOvSearchTool(client, makeConfig("find"), makeLogger());
    await executeTool(tool, { query: "auto query", mode: "auto" });
    expect(client.find).toHaveBeenCalled();
    expect(client.search).not.toHaveBeenCalled();
  });

  it("uses config.searchMode when mode=auto and searchMode=search", async () => {
    const client = makeClient();
    const tool = createOvSearchTool(client, makeConfig("search"), makeLogger());
    await executeTool(tool, { query: "auto query", mode: "auto" });
    expect(client.search).toHaveBeenCalled();
    expect(client.find).not.toHaveBeenCalled();
  });

  it("passes targetUri as Uri object through find", async () => {
    const client = makeClient();
    const tool = createOvSearchTool(client, makeConfig(), makeLogger());
    await executeTool(tool, { query: "test", targetUri: "viking://kb/test" });
    expect(client.find).toHaveBeenCalledWith(
      expect.objectContaining({ targetUri: expect.objectContaining({ value: "viking://kb/test" }) }),
      expect.any(Object),
      undefined,
    );
  });

  it("passes scoreThreshold param through (via SearchOptions)", async () => {
    const client = makeClient();
    const tool = createOvSearchTool(client, makeConfig(), makeLogger());
    await executeTool(tool, { query: "test", scoreThreshold: 0.8 });
    expect(client.find).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ scoreThreshold: 0.8 }),
      undefined,
    );
  });

  it("passes since and until params through", async () => {
    const client = makeClient();
    const tool = createOvSearchTool(client, makeConfig(), makeLogger());
    await executeTool(tool, { query: "test", since: "2026-01-01", until: "2026-06-01" });
    expect(client.find).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ since: "2026-01-01", until: "2026-06-01" }),
      undefined,
    );
  });

  it("passes timeField param through", async () => {
    const client = makeClient();
    const tool = createOvSearchTool(client, makeConfig(), makeLogger());
    await executeTool(tool, { query: "test", timeField: "created_at" });
    expect(client.find).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ timeField: "created_at" }),
      undefined,
    );
  });

  it("passes level param through", async () => {
    const client = makeClient();
    const tool = createOvSearchTool(client, makeConfig(), makeLogger());
    await executeTool(tool, { query: "test", level: 2 });
    expect(client.find).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ level: 2 }),
      undefined,
    );
  });

  it("passes includeProvenance param through", async () => {
    const client = makeClient();
    const tool = createOvSearchTool(client, makeConfig(), makeLogger());
    await executeTool(tool, { query: "test", includeProvenance: true });
    expect(client.find).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ includeProvenance: true }),
      undefined,
    );
  });

  it("advanced params default to undefined when omitted", async () => {
    const client = makeClient();
    const tool = createOvSearchTool(client, makeConfig(), makeLogger());
    await executeTool(tool, { query: "test" });
    // With mode=auto and config.searchMode=find, goes through find path
    expect(client.find).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        scoreThreshold: undefined,
        since: undefined,
        until: undefined,
        timeField: undefined,
        level: undefined,
        includeProvenance: undefined,
      }),
      undefined,
    );
  });

  it("logs error on failure", async () => {
    const client = makeClient();
    vi.mocked(client.find!).mockRejectedValue(new Error("backend down"));
    const logger = makeLogger();
    const tool = createOvSearchTool(client, makeConfig(), logger);
    const result = await executeTool(tool, { query: "test" });
    expect(getText(result)).toContain("Search failed");
    expect(getText(result)).toContain("backend down");
  });

  it("passes limit through to find", async () => {
    const client = makeClient();
    const tool = createOvSearchTool(client, makeConfig(), makeLogger());
    await executeTool(tool, { query: "test", limit: 10 });
    expect(client.find).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10 }),
      expect.any(Object),
      undefined,
    );
  });

  it("passes peerId through to find", async () => {
    const client = makeClient();
    const tool = createOvSearchTool(client, makeConfig(), makeLogger());
    await executeTool(tool, { query: "test", peerId: "peer-42" });
    expect(client.find).toHaveBeenCalledWith(
      expect.objectContaining({ peerId: "peer-42" }),
      expect.any(Object),
      undefined,
    );
  });
});
