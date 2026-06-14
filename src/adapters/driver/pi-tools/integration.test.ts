import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "http";
import type { AddressInfo } from "net";
import { Transport } from "../../driven/openviking/transport";
import { KnowledgeBaseAdapter } from "../../driven/openviking/knowledge-base";
import { SearchService } from "../../../domain/services/search-service";
import { Pipeline } from "../../../domain/pipeline/pipeline";
import { loggingMiddleware } from "../../../domain/pipeline/logging-middleware";
import { createOvSearchTool } from "./ov-search";
import { createOvGlobTool } from "./ov-glob";
import { createOvGrepTool } from "./ov-grep";
import { createOvWriteTool } from "./ov-write";
import { createOvReadTool } from "./ov-read";
import { createOvRecallTool } from "./ov-recall";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { OVAdapterConfig } from "../../infrastructure/config";
import { OpenVikingClientAdapter } from "../../driven/openviking/client/client-adapter";
import { FsStoreAdapter } from "../../driven/openviking/fs-store";
import { SessionStoreAdapter } from "../../driven/openviking/session-store";
import { GraphStoreAdapter } from "../../driven/openviking/graph-store";
import { ResourceStoreAdapter } from "../../driven/openviking/resource-store";
import { SkillStoreAdapter } from "../../driven/openviking/skill-store";
import type { SearchResult } from "../../../domain/knowledge/model/search-result";
import type { GlobResult, GrepResult } from "../../../domain/ports/knowledge-base";
import type { Content } from "../../../domain/ports/fs-store";
import { RecallService, type RecallResult } from "../../../domain/recall/recall-service";
import { RecallCurator } from "../../../domain/recall/recall-curator";

let server: http.Server;
let port: number;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let bodyStr = "";
    req.on("data", (chunk) => { bodyStr += chunk; });
    req.on("end", () => {
      const url = new URL(req.url ?? "/", `http://localhost`);

      if (url.pathname === "/api/v1/search/find") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          memories: [{ uri: "viking://kb/test", abstract: "found content", context_type: "memory", score: 0.9, level: 1, category: "", match_reason: "" }],
          resources: [],
          skills: [],
          total: 1,
        }));
        return;
      }

      if (url.pathname === "/api/v1/search/search") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          memories: [{ uri: "viking://kb/deep", abstract: "deep content", context_type: "memory", score: 0.95, level: 1, category: "", match_reason: "" }],
          resources: [],
          skills: [],
          total: 1,
          query_plan: "deep plan",
        }));
        return;
      }

      if (url.pathname === "/api/v1/search/glob") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          matches: ["viking://docs/a.md", "viking://docs/b.md"],
          count: 2,
        }));
        return;
      }

      if (url.pathname === "/api/v1/search/grep") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          matches: [{ uri: "viking://docs/a.md", line: 5, content: "hello world" }],
          count: 1,
        }));
        return;
      }

      // FsStore endpoints
      if (url.pathname === "/api/v1/content/read") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          uri: "viking://docs/a.md",
          body: "hello from read",
          level: "read",
        }));
        return;
      }

      if (url.pathname === "/api/v1/content/write") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          uri: "viking://docs/a.md",
          success: true,
        }));
        return;
      }

      if (url.pathname === "/api/v1/fs/mkdir") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (url.pathname === "/api/v1/fs/mv") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      res.writeHead(404);
      res.end("not found");
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      port = (server.address() as AddressInfo).port;
      resolve();
    });
  });
});

afterAll(() => { server?.close(); });

function makeToolCtx() {
  return {
    cwd: "/test",
    hasUI: false,
    ui: {} as any,
    sessionManager: {} as any,
    modelRegistry: {} as any,
    model: undefined,
    isIdle: () => true,
    signal: undefined as AbortSignal | undefined,
    abort: () => {},
    hasPendingMessages: () => false,
    shutdown: () => {},
    getContextUsage: () => undefined,
    compact: () => {},
    getSystemPrompt: () => "",
  } as any;
}

function wireStack() {
  const ovConfig: OVAdapterConfig = {
    endpoint: `http://127.0.0.1:${port}`,
    apiKey: "test-key",
    account: "test-account",
    user: "test-user",
    agentId: "pi",
    timeout: 5000,
    commitTimeout: 120_000,
    maxRetries: 0,
    rateLimitPerSecond: 0,
    autoCommitIntervalMs: 300_000,
  };
  const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, isEnabled: () => true };
  const transport = new Transport(ovConfig);
  const kb = new KnowledgeBaseAdapter(transport);
  const svc = new SearchService(kb, { searchMode: "find" } as any, logger as any);

  const searchPipeline = new Pipeline<SearchResult>();
  searchPipeline.use(loggingMiddleware("search", logger as any));
  const globPipeline = new Pipeline<GlobResult>();
  globPipeline.use(loggingMiddleware("glob", logger as any));
  const grepPipeline = new Pipeline<GrepResult>();
  grepPipeline.use(loggingMiddleware("grep", logger as any));

  const fsStore = new FsStoreAdapter(transport);
  const sessionStore = new SessionStoreAdapter(transport, ovConfig.commitTimeout);
  const graphStore = new GraphStoreAdapter(transport);
  const resourceStore = new ResourceStoreAdapter(transport);
  const skillStore = new SkillStoreAdapter(transport);

  const adapter: any = {
    knowledgeBase: kb,
    fsStore,
    graphStore,
    sessionStore,
    resourceStore,
    skillStore,
    get circuitBreakerOpen() { return false; },
    transport,
  };
  const client = new OpenVikingClientAdapter(adapter);

  // Recall
  const recallConfig = { topN: 5, scoreThreshold: 0.5, maxTokens: 4000, expandGraph: false, expandGraphDepth: 1 as const, expandGraphMaxRatio: 0.2, expandGraphMinSeedScore: 0.4, searchMode: "find" as const, recallSearchTimeout: 5000, autoRecall: true as const };
  const curator = new RecallCurator(recallConfig, [], logger as any);
  const recallService = new RecallService(kb, curator, recallConfig, logger as any, true);
  const recallPipeline = new Pipeline<RecallResult>();
  recallPipeline.use(loggingMiddleware("recall", logger as any));

  return {
    searchTool: createOvSearchTool(svc, searchPipeline),
    globTool: createOvGlobTool(svc, globPipeline),
    grepTool: createOvGrepTool(svc, grepPipeline),
    writeTool: createOvWriteTool(client),
    readTool: createOvReadTool(client),
    recallTool: createOvRecallTool(recallService, recallPipeline),
  };
}

async function exec(tool: ToolDefinition<any>, params: Record<string, unknown>) {
  return tool.execute("test-call", params as any, undefined, undefined, makeToolCtx());
}

function resultText(r: any): string {
  return r.content[0].text as string;
}

describe("Tools integration (mock HTTP)", () => {
  it("ov_search calls /api/v1/search/find and returns results", async () => {
    const { searchTool } = wireStack();
    const result = await exec(searchTool, { query: "test", mode: "find" });
    expect(resultText(result)).toContain("viking://kb/test");
  });

  it("ov_search calls /api/v1/search/search with mode=deep", async () => {
    const { searchTool } = wireStack();
    const result = await exec(searchTool, { query: "deep test", mode: "search" });
    expect(resultText(result)).toContain("viking://kb/deep");
  });

  it("ov_glob calls /api/v1/search/glob and returns entries", async () => {
    const { globTool } = wireStack();
    const result = await exec(globTool, { pattern: "viking://docs/**" });
    const text = resultText(result);
    expect(text).toContain("viking://docs/a.md");
    expect(text).toContain("viking://docs/b.md");
  });

  it("ov_grep calls /api/v1/search/grep and returns matches", async () => {
    const { grepTool } = wireStack();
    const result = await exec(grepTool, { pattern: "hello" });
    expect(resultText(result)).toContain("hello world");
  });

  it("ov_write action=save calls /api/v1/content/write and returns result", async () => {
    const { writeTool } = wireStack();
    const result = await exec(writeTool, { action: "save", uri: "viking://docs/a.md", content: "new content", mode: "replace" });
    expect(resultText(result)).toContain("success");
  });

  it("ov_write action=mkdir calls /api/v1/fs/mkdir", async () => {
    const { writeTool } = wireStack();
    const result = await exec(writeTool, { action: "mkdir", uri: "viking://docs/new-dir" });
    expect(resultText(result)).not.toContain("failed");
  });

  it("ov_write action=mv calls /api/v1/fs/mv", async () => {
    const { writeTool } = wireStack();
    const result = await exec(writeTool, { action: "mv", uri: "viking://docs/a.md", targetUri: "viking://docs/b.md" });
    expect(resultText(result)).not.toContain("failed");
  });

  it("ov_read calls /api/v1/content/read and returns body", async () => {
    const { readTool } = wireStack();
    const result = await exec(readTool, { uri: "viking://docs/a.md", level: "read" });
    expect(resultText(result)).toContain("hello from read");
  });

  it("ov_recall calls /api/v1/search/find and returns formatted memories", async () => {
    const { recallTool } = wireStack();
    const result = await exec(recallTool, { prompt: "what did we decide" });
    expect(resultText(result)).toContain("viking://kb/test");
    expect(resultText(result)).toContain("found content");
  });
});
