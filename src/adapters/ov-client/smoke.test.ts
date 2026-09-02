import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "http";
import type { AddressInfo } from "net";
import { createOVAdapter } from "./adapter";
import type { OVAdapter } from "./adapter";
import { Uri } from "../../domain/common/uri";

let server: http.Server;
let port: number;
let adapter: OVAdapter;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);

    // Session create
    if (url.pathname === "/api/v1/sessions" && req.method === "POST") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ session_id: "smoke-sess-1" }));
      return;
    }

    // FS read
    if (url.pathname.startsWith("/api/v1/content/") && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ uri: url.searchParams.get("uri") || "", body: "smoke content" }));
      return;
    }

    // Search find
    if (url.pathname === "/api/v1/search/find" && req.method === "POST") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        memories: [{ uri: "viking://smoke/1", abstract: "smoke result", context_type: "memory", score: 0.5, level: 1, category: "", match_reason: "" }],
        resources: [],
        skills: [],
        total: 1,
      }));
      return;
    }

    // Relations graph
    if (url.pathname === "/api/v1/relations" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        relations: [{ uri: "viking://related/1", reason: "smoke" }],
      }));
      return;
    }

    // Default 200
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      port = (server.address() as AddressInfo).port;
      resolve();
    });
  });

  adapter = createOVAdapter({
    endpoint: `http://127.0.0.1:${port}`,
    apiKey: "smoke-key",
    account: "smoke",
    user: "test",
    agentId: "pi",
    timeout: 5000,
    commitTimeout: 120_000,
    maxRetries: 0,
    rateLimitPerSecond: 0,
    autoCommitIntervalMs: 300_000,
  });
});

afterAll(() => {
  server?.close();
});

describe("OV Adapter smoke test", () => {
  it("FsStore.read returns content from mock OV", async () => {
    const result = await adapter.fsStore.read(new Uri("viking://smoke/file.md"), "read");
    expect(result.body).toBe("smoke content");
    expect(result.level).toBe("read");
  });

  it("KnowledgeBase.find returns search results", async () => {
    const result = await adapter.knowledgeBase.find({ query: "smoke" });
    expect(result.total).toBe(1);
    expect(result.memories[0].text).toBe("smoke result");
  });

  it("SessionStore.create returns session ID", async () => {
    const id = await adapter.sessionStore.create();
    expect(id.value).toBe("smoke-sess-1");
  });

  it("GraphStore.graph returns relations", async () => {
    const result = await adapter.graphStore.graph(new Uri("viking://smoke/doc"));
    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe("smoke");
  });
});
