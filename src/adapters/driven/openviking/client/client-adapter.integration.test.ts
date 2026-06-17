/**
 * Integration tests for OpenVikingClientAdapter against a mock HTTP server.
 *
 * Tests each sub-interface method end-to-end with a mocked OV response.
 * Pattern matches src/adapters/driver/pi-tools/integration.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "http";
import type { AddressInfo } from "net";
import { createOVAdapter } from "../adapter";
import { OpenVikingClientAdapter } from "./client-adapter";
import type { OVAdapterConfig } from "../../../../infrastructure/config";
import type { Uri } from "../../../../domain/common/uri";

let server: http.Server;
let port: number;

function mockUri(value: string): Uri {
  return { value, toString: () => value } as Uri;
}

/** Drain POST body so Node.js doesn't keep the connection open. */
function drainBody(
  req: http.IncomingMessage,
  cb: () => void,
): void {
  let body = "";
  req.on("data", (chunk: string) => { body += chunk; });
  req.on("end", cb);
}

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost`);

    // ── Search endpoints ──────────────────────────────────────────────

    if (url.pathname === "/api/v1/search/find") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: "ok",
        result: {
          memories: [{ uri: "viking://kb/test", abstract: "found", context_type: "memory", score: 0.9, level: 1, category: "", match_reason: "" }],
          resources: [],
          skills: [],
          total: 1,
        },
      }));
      return;
    }

    if (url.pathname === "/api/v1/search/search") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: "ok",
        result: {
          memories: [{ uri: "viking://kb/deep", abstract: "deep", context_type: "memory", score: 0.95, level: 1, category: "", match_reason: "" }],
          resources: [],
          skills: [],
          total: 1,
          query_plan: "deep plan",
        },
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

    // ── Fs endpoints ──────────────────────────────────────────────────

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
      drainBody(req, () => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          uri: "viking://docs/a.md",
          success: true,
        }));
      });
      return;
    }

    if (url.pathname === "/api/v1/fs/mkdir") {
      drainBody(req, () => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }

    if (url.pathname === "/api/v1/fs/mv") {
      drainBody(req, () => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }

    if (url.pathname === "/api/v1/fs/ls") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify([{ uri: "viking://docs/a.md", type: "file" }]));
      return;
    }

    // ── Session endpoints ─────────────────────────────────────────────

    if (url.pathname === "/api/v1/sessions" && req.method === "GET") {
      // The transport unwraps OV envelope { status, result }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        sessions: [{ session_id: "s-1", created_at: "t1", updated_at: "t1", message_count: 0, commit_count: 0, user: { account_id: "a", user_id: "u" } }],
      }));
      return;
    }

    if (url.pathname === "/api/v1/sessions" && req.method === "POST") {
      drainBody(req, () => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          session_id: "sess-new",
          user: { account_id: "a", user_id: "u" },
        }));
      });
      return;
    }

    // ── Relation endpoints ────────────────────────────────────────────

    if (url.pathname === "/api/v1/relations/link" && req.method === "POST") {
      drainBody(req, () => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({}));
      });
      return;
    }

    if (url.pathname === "/api/v1/relations" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        relations: [{ uri: "viking://b", reason: "linked" }],
      }));
      return;
    }

    // ── Resource endpoint ─────────────────────────────────────────────

    if (url.pathname === "/api/v1/resources") {
      drainBody(req, () => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          status: "ok",
          root_uri: "viking://imported",
          source_path: "/x",
        }));
      });
      return;
    }

    // ── Skill endpoint ────────────────────────────────────────────────

    if (url.pathname === "/api/v1/skills") {
      drainBody(req, () => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          root_uri: "viking://skills",
          uri: "viking://skills/my-skill",
          name: "my-skill",
          auxiliary_files: 0,
        }));
      });
      return;
    }

    res.writeHead(404);
    res.end("not found");
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      port = (server.address() as AddressInfo).port;
      resolve();
    });
  });
});

afterAll(() => { server?.close(); });

const OV_CONFIG: OVAdapterConfig = {
  endpoint: "http://127.0.0.1:0",
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

function createClient() {
  const config = { ...OV_CONFIG, endpoint: `http://127.0.0.1:${port}` };
  const adapter = createOVAdapter(config);
  return new OpenVikingClientAdapter(adapter);
}

describe("OpenVikingClientAdapter integration (mock HTTP)", () => {
  describe("SearchClient", () => {
    it("find calls /api/v1/search/find and returns results", async () => {
      const client = createClient();
      const result = await client.find({ query: "test" });
      expect(result.total).toBe(1);
      expect(result.memories[0].uri).toBe("viking://kb/test");
    });

    it("search calls /api/v1/search/search and returns deep results", async () => {
      const client = createClient();
      const result = await client.search({ query: "deep test" });
      expect(result.total).toBe(1);
      expect(result.memories[0].uri).toBe("viking://kb/deep");
      expect(result.queryPlan).toBe("deep plan");
    });

    it("glob calls /api/v1/search/glob and returns entries", async () => {
      const client = createClient();
      const result = await client.glob("viking://docs/**");
      expect(result.entries).toHaveLength(2);
      expect(result.entries).toContain("viking://docs/a.md");
    });

    it("grep calls /api/v1/search/grep and returns matches", async () => {
      const client = createClient();
      const result = await client.grep("hello", { uri: "viking://" });
      expect(result.total).toBe(1);
      expect(result.matches[0].line).toBe(5); expect(result.matches[0].content).toBe("hello world");
    });
  });

  describe("FsClient", () => {
    it("read calls /api/v1/content/read", async () => {
      const client = createClient();
      const uri = mockUri("viking://docs/a.md");
      const result = await client.read(uri);
      expect(result.body).toBe("hello from read");
    });

    it("save calls /api/v1/content/write", async () => {
      const client = createClient();
      const uri = mockUri("viking://docs/a.md");
      const result = await client.save(uri, "new content", "replace");
      expect(result.success).toBe(true);
    });

    it("mkdir calls /api/v1/fs/mkdir", async () => {
      const client = createClient();
      const uri = mockUri("viking://docs/new-dir");
      await expect(client.mkdir(uri)).resolves.toBeUndefined();
    });

    it("mv calls /api/v1/fs/mv", async () => {
      const client = createClient();
      const from = mockUri("viking://docs/a.md");
      const to = mockUri("viking://docs/b.md");
      await expect(client.mv(from, to)).resolves.toBeUndefined();
    });

    it("list calls /api/v1/fs/list", async () => {
      const client = createClient();
      const uri = mockUri("viking://docs");
      const result = await client.list(uri);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("SessionClient", () => {
    it("createSession calls POST /api/v1/sessions", async () => {
      const client = createClient();
      const result = await client.createSession();
      expect(result.value).toBe("sess-new");
    });

    it("listSessions calls GET /api/v1/sessions", async () => {
      const client = createClient();
      const result = await client.listSessions();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("RelationClient", () => {
    it("graph calls GET /api/v1/relations?uri=...", async () => {
      const client = createClient();
      const uri = mockUri("viking://a");
      const result = await client.graph(uri);
      expect(result).toHaveLength(1);
      expect(result[0].uri).toBe("viking://b");
    });

    it("link calls POST /api/v1/relations/link", async () => {
      const client = createClient();
      const src = mockUri("viking://a");
      const tgt = mockUri("viking://b");
      const result = await client.link(src, tgt, "test");
      expect(result.source).toBe(src);
      expect(result.reason).toBe("test");
    });
  });

  describe("ResourceClient", () => {
    it("importUrl calls POST /api/v1/resources", async () => {
      const client = createClient();
      const result = await client.importUrl("https://example.com");
      expect(result.status).toBe("ok");
    });
  });

  describe("SkillClient", () => {
    it("addSkill calls POST /api/v1/skills", async () => {
      const client = createClient();
      const result = await client.addSkill("# test skill", { wait: true });
      expect(result.name).toBe("my-skill");
    });
  });
});
