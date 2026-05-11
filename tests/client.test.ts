import { describe, test, expect, vi } from "vitest";
import { createClient } from "../src/ov-client/client";
import type { OpenVikingConfig } from "../src/shared/config";

const defaultConfig: OpenVikingConfig = {
  endpoint: "http://localhost:1933",
  timeout: 5000,
  commitTimeout: 60000,
  apiKey: "dev",
  account: "default",
  user: "default",
  autoRecallLimit: 10,
  autoRecallTimeout: 5000,
  autoRecallTopN: 5,
  openVikingAutoRecall: true,
  autoRecallScoreThreshold: 0.15,
  autoRecallMaxContentChars: 500,
  autoRecallPreferAbstract: true,
  autoRecallTokenBudget: 500,
};

function mockTransport() {
  return {
    request: vi.fn(async () => ({})),
  };
}

describe("OpenVikingClient", () => {
  describe("createSession", () => {
    test("returns session_id on success", async () => {
      const transport = mockTransport();
      transport.request.mockResolvedValue({ session_id: "sess-123" });

      const client = createClient(defaultConfig, transport);
      const id = await client.createSession();
      expect(id).toBe("sess-123");
      expect(transport.request).toHaveBeenCalledWith(
        "createSession",
        "/api/v1/sessions",
        { httpMethod: "POST" },
        undefined,
      );
    });

    test("throws user-facing error on server error", async () => {
      const transport = mockTransport();
      transport.request.mockRejectedValue(
        new Error("OpenViking createSession failed: boom (HTTP 500)"),
      );

      const client = createClient(defaultConfig, transport);
      await expect(client.createSession()).rejects.toThrow(
        "OpenViking createSession failed: boom (HTTP 500)",
      );
    });

    test("passes abort signal", async () => {
      const transport = mockTransport();
      transport.request.mockResolvedValue({ session_id: "sess-1" });

      const controller = new AbortController();
      const client = createClient(defaultConfig, transport);
      await client.createSession(controller.signal);
      expect(transport.request).toHaveBeenCalledWith(
        "createSession",
        "/api/v1/sessions",
        { httpMethod: "POST" },
        controller.signal,
      );
    });
  });

  describe("search", () => {
    test("returns results on success", async () => {
      const transport = mockTransport();
      transport.request.mockResolvedValue({
        memories: [{ text: "mem1", score: 0.9 }],
        resources: [{ uri: "viking://x", score: 0.8 }],
        total: 2,
      });

      const client = createClient(defaultConfig, transport);
      const results = await client.search("sess-1", "test query");
      expect(transport.request).toHaveBeenCalledWith(
        "search",
        "/api/v1/search/find",
        { body: { query: "test query", limit: 10, session_id: "sess-1" } },
        undefined,
      );
      expect(results).toEqual({
        memories: [{ text: "mem1", score: 0.9 }],
        resources: [{ uri: "viking://x", score: 0.8 }],
        total: 2,
      });
    });

    test("uses /search/search endpoint for deep mode with session", async () => {
      const transport = mockTransport();
      transport.request.mockResolvedValue({
        memories: [{ text: "deep-mem", score: 0.95 }],
        resources: [],
        total: 1,
      });

      const client = createClient(defaultConfig, transport);
      const results = await client.search("sess-1", "deep query", 10, "deep");
      expect(transport.request).toHaveBeenCalledWith(
        "search",
        "/api/v1/search/search",
        { body: { query: "deep query", limit: 10, session_id: "sess-1", mode: "deep" } },
        undefined,
      );
      expect(results.memories[0].text).toBe("deep-mem");
    });

    test("deep mode without session falls back to /search/find", async () => {
      const transport = mockTransport();
      transport.request.mockResolvedValue({ memories: [], resources: [], total: 0 });

      const client = createClient(defaultConfig, transport);
      await client.search(undefined, "query", 10, "deep");
      expect(transport.request).toHaveBeenCalledWith(
        "search",
        "/api/v1/search/find",
        { body: { query: "query", limit: 10 } },
        undefined,
      );
    });

    test("throws user-facing error on server error", async () => {
      const transport = mockTransport();
      transport.request.mockRejectedValue(
        new Error("OpenViking search failed: overloaded (HTTP 503)"),
      );

      const client = createClient(defaultConfig, transport);
      await expect(client.search("sess-1", "q")).rejects.toThrow(
        "OpenViking search failed: overloaded (HTTP 503)",
      );
    });

    test("passes target_uri in body when provided", async () => {
      const transport = mockTransport();
      transport.request.mockResolvedValue({
        memories: [],
        resources: [{ uri: "viking://resources/x", score: 0.8 }],
        total: 1,
      });

      const client = createClient(defaultConfig, transport);
      await client.search("sess-1", "scoped", 5, "fast", "viking://resources/");
      expect(transport.request).toHaveBeenCalledWith(
        "search",
        "/api/v1/search/find",
        { body: { query: "scoped", limit: 5, session_id: "sess-1", target_uri: "viking://resources/" } },
        undefined,
      );
    });

    test("omits target_uri when not provided", async () => {
      const transport = mockTransport();
      transport.request.mockResolvedValue({ memories: [], resources: [], total: 0 });

      const client = createClient(defaultConfig, transport);
      await client.search("sess-1", "unscoped");
      const body = (transport.request.mock.calls[0] as any)[2]?.body;
      expect(body).not.toHaveProperty("target_uri");
    });
  });

  describe("sendMessage", () => {
    test("sends correct body", async () => {
      const transport = mockTransport();
      transport.request.mockResolvedValue({});

      const client = createClient(defaultConfig, transport);
      await client.sendMessage("sess-1", "user", "hello");
      expect(transport.request).toHaveBeenCalledWith(
        "sendMessage",
        "/api/v1/sessions/sess-1/messages",
        { body: { role: "user", content: "hello" } },
        undefined,
      );
    });

    test("throws user-facing error on server error", async () => {
      const transport = mockTransport();
      transport.request.mockRejectedValue(
        new Error("OpenViking sendMessage failed: bad key (HTTP 401)"),
      );

      const client = createClient(defaultConfig, transport);
      await expect(client.sendMessage("sess-1", "user", "hi")).rejects.toThrow(
        "OpenViking sendMessage failed: bad key (HTTP 401)",
      );
    });
  });

  describe("read", () => {
    test("returns content on success", async () => {
      const transport = mockTransport();
      transport.request.mockResolvedValue("# API Docs\n\nHello world");

      const client = createClient(defaultConfig, transport);
      const result = await client.read("viking://docs/api.md");
      expect(transport.request).toHaveBeenCalledWith(
        "read",
        "/api/v1/content/read?uri=viking%3A%2F%2Fdocs%2Fapi.md",
        undefined,
        undefined,
      );
      expect(result.content).toBe("# API Docs\n\nHello world");
    });

    test("passes level in path", async () => {
      const transport = mockTransport();
      transport.request.mockResolvedValue("abstract text");

      const client = createClient(defaultConfig, transport);
      const result = await client.read("viking://docs/api.md", "abstract");
      expect(transport.request).toHaveBeenCalledWith(
        "read",
        "/api/v1/content/abstract?uri=viking%3A%2F%2Fdocs%2Fapi.md",
        undefined,
        undefined,
      );
      expect(result.content).toBe("abstract text");
    });

    test("throws user-facing error on server error", async () => {
      const transport = mockTransport();
      transport.request.mockRejectedValue(
        new Error("OpenViking read failed: no such file (HTTP 404)"),
      );

      const client = createClient(defaultConfig, transport);
      await expect(client.read("viking://missing")).rejects.toThrow(
        "OpenViking read failed: no such file (HTTP 404)",
      );
    });
  });

  describe("fsList", () => {
    test("returns children on success", async () => {
      const transport = mockTransport();
      transport.request.mockResolvedValue([
        { uri: "viking://resources/docs/api.md", isDir: false, abstract: "API reference" },
        { uri: "viking://resources/docs/guides/", isDir: true, abstract: "Guides" },
      ]);

      const client = createClient(defaultConfig, transport);
      const result = await client.fsList("viking://resources/docs/");
      expect(transport.request).toHaveBeenCalledWith(
        "fsList",
        "/api/v1/fs/ls?uri=viking%3A%2F%2Fresources%2Fdocs%2F",
        undefined,
        undefined,
      );
      expect(result.uri).toBe("viking://resources/docs/");
      expect(result.children).toHaveLength(2);
      expect(result.children[0].uri).toBe("viking://resources/docs/api.md");
      expect(result.children[0].type).toBe("file");
      expect(result.children[1].type).toBe("directory");
    });

    test("passes recursive=true as query param", async () => {
      const transport = mockTransport();
      transport.request.mockResolvedValue([
        { uri: "viking://resources/docs/api.md", isDir: false },
      ]);

      const client = createClient(defaultConfig, transport);
      await client.fsList("viking://resources/docs/", undefined, true);
      expect(transport.request).toHaveBeenCalledWith(
        "fsList",
        "/api/v1/fs/ls?uri=viking%3A%2F%2Fresources%2Fdocs%2F&recursive=true",
        undefined,
        undefined,
      );
    });

    test("passes simple=true as query param", async () => {
      const transport = mockTransport();
      transport.request.mockResolvedValue([
        { uri: "viking://resources/docs/api.md", isDir: false },
      ]);

      const client = createClient(defaultConfig, transport);
      await client.fsList("viking://resources/docs/", undefined, undefined, true);
      expect(transport.request).toHaveBeenCalledWith(
        "fsList",
        "/api/v1/fs/ls?uri=viking%3A%2F%2Fresources%2Fdocs%2F&simple=true",
        undefined,
        undefined,
      );
    });

    test("passes both recursive and simple when provided", async () => {
      const transport = mockTransport();
      transport.request.mockResolvedValue([
        { uri: "viking://resources/docs/api.md", isDir: false },
      ]);

      const client = createClient(defaultConfig, transport);
      await client.fsList("viking://resources/docs/", undefined, true, true);
      const url = (transport.request.mock.calls[0] as any)[1];
      expect(url).toContain("recursive=true");
      expect(url).toContain("simple=true");
      expect(url).toContain("uri=");
    });

    test("omits params when not provided", async () => {
      const transport = mockTransport();
      transport.request.mockResolvedValue([]);

      const client = createClient(defaultConfig, transport);
      await client.fsList("viking://resources/docs/");
      const url = (transport.request.mock.calls[0] as any)[1] as string;
      expect(url).not.toContain("recursive");
      expect(url).not.toContain("simple");
    });

    test("throws user-facing error on server error", async () => {
      const transport = mockTransport();
      transport.request.mockRejectedValue(
        new Error("OpenViking fsList failed: boom (HTTP 500)"),
      );

      const client = createClient(defaultConfig, transport);
      await expect(client.fsList("viking://resources/unknown/")).rejects.toThrow(
        "OpenViking fsList failed: boom (HTTP 500)",
      );
    });
  });

  describe("fsTree", () => {
    test("returns tree on success", async () => {
      const transport = mockTransport();
      transport.request.mockResolvedValue([{ uri: "viking://resources/docs/", isDir: true }]);

      const client = createClient(defaultConfig, transport);
      const result = await client.fsTree("viking://resources/");
      expect(transport.request).toHaveBeenCalledWith(
        "fsTree",
        "/api/v1/fs/tree?uri=viking%3A%2F%2Fresources%2F",
        undefined,
        undefined,
      );
      expect(result.uri).toBe("viking://resources/");
      expect(result.children).toHaveLength(1);
      expect(result.children[0].type).toBe("directory");
    });

    test("throws user-facing error on server error", async () => {
      const transport = mockTransport();
      transport.request.mockRejectedValue(
        new Error("OpenViking fsTree failed: down (HTTP 503)"),
      );

      const client = createClient(defaultConfig, transport);
      await expect(client.fsTree("viking://x/")).rejects.toThrow(
        "OpenViking fsTree failed: down (HTTP 503)",
      );
    });
  });

  describe("fsStat", () => {
    test("returns stat on success", async () => {
      const transport = mockTransport();
      transport.request.mockResolvedValue({
        name: "file.md",
        size: 42,
        mode: 420,
        modTime: "2026-04-30T00:00:00Z",
        isDir: false,
      });

      const client = createClient(defaultConfig, transport);
      const result = await client.fsStat("viking://resources/file.md");
      expect(transport.request).toHaveBeenCalledWith(
        "fsStat",
        "/api/v1/fs/stat?uri=viking%3A%2F%2Fresources%2Ffile.md",
        undefined,
        undefined,
      );
      expect(result.uri).toBe("viking://resources/file.md");
      expect(result.children[0].type).toBe("file");
    });

    test("returns directory type when isDir", async () => {
      const transport = mockTransport();
      transport.request.mockResolvedValue({ name: "docs", isDir: true });

      const client = createClient(defaultConfig, transport);
      const result = await client.fsStat("viking://resources/docs/");
      expect(result.children[0].type).toBe("directory");
    });

    test("throws user-facing error on server error", async () => {
      const transport = mockTransport();
      transport.request.mockRejectedValue(
        new Error("OpenViking fsStat failed: missing (HTTP 404)"),
      );

      const client = createClient(defaultConfig, transport);
      await expect(client.fsStat("viking://missing")).rejects.toThrow(
        "OpenViking fsStat failed: missing (HTTP 404)",
      );
    });
  });

  describe("commit", () => {
    test("returns full CommitResult on success", async () => {
      const transport = mockTransport();
      transport.request.mockResolvedValue({
        session_id: "sess-1",
        status: "committed",
        task_id: "task-999",
        archive_uri: "viking://archived/sess-1",
        archived: true,
        trace_id: "trace-999",
      });

      const client = createClient(defaultConfig, transport);
      const result = await client.commit("sess-1");
      expect(transport.request).toHaveBeenCalledWith(
        "commit",
        "/api/v1/sessions/sess-1/commit",
        { body: {}, timeout: 60000 },
        undefined,
      );
      expect(result).toEqual({
        session_id: "sess-1",
        status: "committed",
        task_id: "task-999",
        archive_uri: "viking://archived/sess-1",
        archived: true,
        trace_id: "trace-999",
      });
    });

    test("uses commitTimeout from config", async () => {
      const transport = mockTransport();
      transport.request.mockResolvedValue({});

      const client = createClient({ ...defaultConfig, commitTimeout: 120000 }, transport);
      await client.commit("sess-1");
      expect(transport.request).toHaveBeenCalledWith(
        "commit",
        expect.any(String),
        expect.objectContaining({ timeout: 120000 }),
        undefined,
      );
    });

    test("throws user-facing error on server error", async () => {
      const transport = mockTransport();
      transport.request.mockRejectedValue(
        new Error("OpenViking commit failed: boom (HTTP 500)"),
      );

      const client = createClient(defaultConfig, transport);
      await expect(client.commit("sess-1")).rejects.toThrow(
        "OpenViking commit failed: boom (HTTP 500)",
      );
    });
  });

  describe("addResource", () => {
    test("posts params and returns root_uri + status", async () => {
      const transport = mockTransport();
      transport.request.mockResolvedValue({ root_uri: "viking://resources/foo.md", status: "success", errors: [] });

      const client = createClient(defaultConfig, transport);
      const result = await client.addResource({ path: "https://example.com/doc.md", reason: "import" });
      expect(transport.request).toHaveBeenCalledWith(
        "addResource",
        "/api/v1/resources",
        { body: { path: "https://example.com/doc.md", reason: "import" } },
        undefined,
      );
      expect(result.root_uri).toBe("viking://resources/foo.md");
      expect(result.status).toBe("success");
    });

    test("throws user-facing error on server error", async () => {
      const transport = mockTransport();
      transport.request.mockRejectedValue(
        new Error("OpenViking addResource failed: bad request (HTTP 400)"),
      );

      const client = createClient(defaultConfig, transport);
      await expect(client.addResource({ path: "bad" })).rejects.toThrow(
        "OpenViking addResource failed: bad request (HTTP 400)",
      );
    });
  });

  describe("tempUpload", () => {
    test("sends multipart form with file", async () => {
      const transport = mockTransport();
      transport.request.mockResolvedValue({ temp_file_id: "tmp-abc" });

      const client = createClient(defaultConfig, transport);
      const result = await client.tempUpload("file contents", "notes.md");
      expect(transport.request).toHaveBeenCalledWith(
        "tempUpload",
        "/api/v1/resources/temp_upload",
        expect.objectContaining({ body: expect.any(FormData) }),
        undefined,
      );
      expect(result.temp_file_id).toBe("tmp-abc");
    });

    test("accepts Uint8Array body", async () => {
      const transport = mockTransport();
      transport.request.mockResolvedValue({ temp_file_id: "tmp-bin" });

      const client = createClient(defaultConfig, transport);
      const result = await client.tempUpload(new Uint8Array([1, 2, 3]), "data.bin");
      expect(transport.request).toHaveBeenCalledWith(
        "tempUpload",
        "/api/v1/resources/temp_upload",
        expect.objectContaining({ body: expect.any(FormData) }),
        undefined,
      );
      expect(result.temp_file_id).toBe("tmp-bin");
    });

    test("throws user-facing error on server error", async () => {
      const transport = mockTransport();
      transport.request.mockRejectedValue(
        new Error("OpenViking tempUpload failed: too large (HTTP 413)"),
      );

      const client = createClient(defaultConfig, transport);
      await expect(client.tempUpload("x", "big.bin")).rejects.toThrow(
        "OpenViking tempUpload failed: too large (HTTP 413)",
      );
    });
  });
});
