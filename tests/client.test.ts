import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { createClient } from "../src/client";
import type { OpenVikingConfig } from "../src/config";

const defaultConfig: OpenVikingConfig = {
  endpoint: "http://localhost:1933",
  timeout: 5000,
  commitTimeout: 60000,
  apiKey: "dev",
  account: "default",
  user: "default",
};

function mockFetch(
  handler: (url: string, init: RequestInit) => Promise<{ status: number; body: unknown }>,
) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const signal = init?.signal as AbortSignal | undefined;
    const result = await Promise.race([
      handler(url, init ?? {}),
      new Promise<never>((_, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")));
      }),
    ]);
    return new Response(JSON.stringify(result.body), { status: result.status });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

describe("OpenVikingClient", () => {
  let restoreFetch: () => void;

  beforeEach(() => {
    restoreFetch = () => {};
  });

  afterEach(() => {
    restoreFetch();
  });

  describe("createSession", () => {
    test("returns session_id on success", async () => {
      restoreFetch = mockFetch(async (url, init) => {
        expect(url).toBe("http://localhost:1933/api/v1/sessions");
        expect(init.method).toBe("POST");
        return {
          status: 200,
          body: { status: "ok", result: { session_id: "sess-123" } },
        };
      });

      const client = createClient(defaultConfig);
      const id = await client.createSession();
      expect(id).toBe("sess-123");
    });

    test("throws user-facing error on server error", async () => {
      restoreFetch = mockFetch(async () => ({
        status: 500,
        body: { status: "error", error: { code: "INTERNAL", message: "boom" } },
      }));

      const client = createClient(defaultConfig);
      await expect(client.createSession()).rejects.toThrow(
        "OpenViking createSession failed: boom (HTTP 500)",
      );
    });

    test("throws user-facing error on timeout", async () => {
      restoreFetch = mockFetch(async () => {
        await new Promise((r) => setTimeout(r, 60000));
        return { status: 200, body: {} };
      });

      const client = createClient({ ...defaultConfig, timeout: 50 });
      await expect(client.createSession()).rejects.toThrow(
        "OpenViking createSession failed: request timed out",
      );
    }, 15000);

    test("throws user-facing error on abort", async () => {
      restoreFetch = mockFetch(async () => {
        await new Promise((r) => setTimeout(r, 60000));
        return { status: 200, body: {} };
      });

      const controller = new AbortController();
      const client = createClient(defaultConfig);
      const promise = client.createSession(controller.signal);
      // Abort after a small delay to let fetch start
      setTimeout(() => controller.abort(), 10);
      await expect(promise).rejects.toThrow(
        "OpenViking createSession failed: request aborted",
      );
    }, 15000);
  });

  describe("search", () => {
    test("returns results on success", async () => {
      restoreFetch = mockFetch(async (url, init) => {
        expect(url).toBe("http://localhost:1933/api/v1/search/find");
        const body = JSON.parse(init.body as string);
        expect(body.session_id).toBe("sess-1");
        expect(body.query).toBe("test query");
        return {
          status: 200,
          body: {
            status: "ok",
            result: {
              memories: [{ text: "mem1", score: 0.9 }],
              resources: [{ uri: "viking://x", score: 0.8 }],
              total: 2,
            },
          },
        };
      });

      const client = createClient(defaultConfig);
      const results = await client.search("sess-1", "test query");
      expect(results).toEqual({
        memories: [{ text: "mem1", score: 0.9 }],
        resources: [{ uri: "viking://x", score: 0.8 }],
        total: 2,
      });
    });

    test("throws user-facing error on server error", async () => {
      restoreFetch = mockFetch(async () => ({
        status: 503,
        body: { status: "error", error: { code: "UNAVAILABLE", message: "overloaded" } },
      }));

      const client = createClient(defaultConfig);
      await expect(client.search("sess-1", "q")).rejects.toThrow(
        "OpenViking search failed: overloaded (HTTP 503)",
      );
    });

    test("uses /search/search endpoint for deep mode with session", async () => {
      restoreFetch = mockFetch(async (url, init) => {
        expect(url).toBe("http://localhost:1933/api/v1/search/search");
        const body = JSON.parse(init.body as string);
        expect(body.session_id).toBe("sess-1");
        expect(body.query).toBe("deep query");
        expect(body.mode).toBe("deep");
        return {
          status: 200,
          body: {
            status: "ok",
            result: {
              memories: [{ text: "deep-mem", score: 0.95 }],
              resources: [],
              total: 1,
            },
          },
        };
      });

      const client = createClient(defaultConfig);
      const results = await client.search("sess-1", "deep query", 10, "deep");
      expect(results.memories[0].text).toBe("deep-mem");
    });

    test("deep mode without session falls back to /search/find", async () => {
      restoreFetch = mockFetch(async (url) => {
        expect(url).toBe("http://localhost:1933/api/v1/search/find");
        return {
          status: 200,
          body: {
            status: "ok",
            result: { memories: [], resources: [], total: 0 },
          },
        };
      });

      const client = createClient(defaultConfig);
      await client.search(undefined, "query", 10, "deep");
    });
  });

  describe("sendMessage", () => {
    test("succeeds", async () => {
      restoreFetch = mockFetch(async (url, init) => {
        expect(url).toBe("http://localhost:1933/api/v1/sessions/sess-1/messages");
        const body = JSON.parse(init.body as string);
        expect(body).toEqual({ role: "user", content: "hello" });
        return {
          status: 200,
          body: { status: "ok", result: { session_id: "sess-1", message_count: 1 } },
        };
      });

      const client = createClient(defaultConfig);
      await client.sendMessage("sess-1", "user", "hello");
    });

    test("throws user-facing error on server error", async () => {
      restoreFetch = mockFetch(async () => ({
        status: 401,
        body: { status: "error", error: { code: "UNAUTHORIZED", message: "bad key" } },
      }));

      const client = createClient(defaultConfig);
      await expect(client.sendMessage("sess-1", "user", "hi")).rejects.toThrow(
        "OpenViking sendMessage failed: bad key (HTTP 401)",
      );
    });
  });

  describe("read", () => {
    test("returns content on success", async () => {
      restoreFetch = mockFetch(async (url) => {
        expect(url).toBe("http://localhost:1933/api/v1/content/read?uri=viking%3A%2F%2Fdocs%2Fapi.md");
        return {
          status: 200,
          body: { status: "ok", result: "# API Docs\n\nHello world" },
        };
      });

      const client = createClient(defaultConfig);
      const result = await client.read("viking://docs/api.md");
      expect(result.content).toBe("# API Docs\n\nHello world");
    });

    test("passes level in path", async () => {
      restoreFetch = mockFetch(async (url) => {
        expect(url).toBe("http://localhost:1933/api/v1/content/abstract?uri=viking%3A%2F%2Fdocs%2Fapi.md");
        return {
          status: 200,
          body: { status: "ok", result: "abstract text" },
        };
      });

      const client = createClient(defaultConfig);
      const result = await client.read("viking://docs/api.md", "abstract");
      expect(result.content).toBe("abstract text");
    });

    test("throws user-facing error on server error", async () => {
      restoreFetch = mockFetch(async () => ({
        status: 404,
        body: { status: "error", error: { code: "NOT_FOUND", message: "no such file" } },
      }));

      const client = createClient(defaultConfig);
      await expect(client.read("viking://missing")).rejects.toThrow(
        "OpenViking read failed: no such file (HTTP 404)",
      );
    });

    test("throws user-facing error on timeout", async () => {
      restoreFetch = mockFetch(async () => {
        await new Promise((r) => setTimeout(r, 60000));
        return { status: 200, body: {} };
      });

      const client = createClient({ ...defaultConfig, timeout: 50 });
      await expect(client.read("viking://docs/x")).rejects.toThrow(
        "OpenViking read failed: request timed out",
      );
    }, 15000);
  });

  describe("fsList", () => {
    test("returns children on success", async () => {
      restoreFetch = mockFetch(async (url) => {
        expect(url).toBe("http://localhost:1933/api/v1/fs/ls?uri=viking%3A%2F%2Fresources%2Fdocs%2F");
        return {
          status: 200,
          body: {
            status: "ok",
            result: [
              { uri: "viking://resources/docs/api.md", isDir: false, abstract: "API reference" },
              { uri: "viking://resources/docs/guides/", isDir: true, abstract: "Guides" },
            ],
          },
        };
      });

      const client = createClient(defaultConfig);
      const result = await client.fsList("viking://resources/docs/");
      expect(result.uri).toBe("viking://resources/docs/");
      expect(result.children).toHaveLength(2);
      expect(result.children[0].uri).toBe("viking://resources/docs/api.md");
      expect(result.children[0].type).toBe("file");
      expect(result.children[1].type).toBe("directory");
    });

    test("throws user-facing error on server error", async () => {
      restoreFetch = mockFetch(async () => ({
        status: 500,
        body: { status: "error", error: { code: "INTERNAL", message: "boom" } },
      }));

      const client = createClient(defaultConfig);
      await expect(client.fsList("viking://resources/unknown/")).rejects.toThrow(
        "OpenViking fsList failed: boom (HTTP 500)",
      );
    });

    test("throws user-facing error on abort", async () => {
      restoreFetch = mockFetch(async () => {
        await new Promise((r) => setTimeout(r, 60000));
        return { status: 200, body: {} };
      });

      const controller = new AbortController();
      const client = createClient(defaultConfig);
      const promise = client.fsList("viking://resources/", controller.signal);
      setTimeout(() => controller.abort(), 10);
      await expect(promise).rejects.toThrow(
        "OpenViking fsList failed: request aborted",
      );
    }, 15000);
  });

  describe("fsTree", () => {
    test("returns tree on success", async () => {
      restoreFetch = mockFetch(async (url) => {
        expect(url).toBe("http://localhost:1933/api/v1/fs/tree?uri=viking%3A%2F%2Fresources%2F");
        return {
          status: 200,
          body: {
            status: "ok",
            result: [
              { uri: "viking://resources/docs/", isDir: true },
            ],
          },
        };
      });

      const client = createClient(defaultConfig);
      const result = await client.fsTree("viking://resources/");
      expect(result.uri).toBe("viking://resources/");
      expect(result.children).toHaveLength(1);
      expect(result.children[0].type).toBe("directory");
    });

    test("throws user-facing error on server error", async () => {
      restoreFetch = mockFetch(async () => ({
        status: 503,
        body: { status: "error", error: { code: "UNAVAILABLE", message: "down" } },
      }));

      const client = createClient(defaultConfig);
      await expect(client.fsTree("viking://x/")).rejects.toThrow(
        "OpenViking fsTree failed: down (HTTP 503)",
      );
    });
  });

  describe("fsStat", () => {
    test("returns stat on success", async () => {
      restoreFetch = mockFetch(async (url) => {
        expect(url).toBe("http://localhost:1933/api/v1/fs/stat?uri=viking%3A%2F%2Fresources%2Ffile.md");
        return {
          status: 200,
          body: {
            status: "ok",
            result: {
              name: "file.md",
              size: 42,
              mode: 420,
              modTime: "2026-04-30T00:00:00Z",
              isDir: false,
            },
          },
        };
      });

      const client = createClient(defaultConfig);
      const result = await client.fsStat("viking://resources/file.md");
      expect(result.uri).toBe("viking://resources/file.md");
      expect(result.children[0].type).toBe("file");
    });

    test("throws user-facing error on server error", async () => {
      restoreFetch = mockFetch(async () => ({
        status: 404,
        body: { status: "error", error: { code: "NOT_FOUND", message: "missing" } },
      }));

      const client = createClient(defaultConfig);
      await expect(client.fsStat("viking://missing")).rejects.toThrow(
        "OpenViking fsStat failed: missing (HTTP 404)",
      );
    });
  });

  describe("commit", () => {
    test("returns task_id and archived on success", async () => {
      restoreFetch = mockFetch(async (url) => {
        expect(url).toBe("http://localhost:1933/api/v1/sessions/sess-1/commit");
        return {
          status: 200,
          body: {
            status: "ok",
            result: {
              session_id: "sess-1",
              status: "accepted",
              task_id: "task-999",
              archived: true,
            },
          },
        };
      });

      const client = createClient(defaultConfig);
      const result = await client.commit("sess-1");
      expect(result.task_id).toBe("task-999");
      expect(result.archived).toBe(true);
    });

    test("throws user-facing error on server error", async () => {
      restoreFetch = mockFetch(async () => ({
        status: 500,
        body: { status: "error", error: { code: "INTERNAL", message: "boom" } },
      }));

      const client = createClient(defaultConfig);
      await expect(client.commit("sess-1")).rejects.toThrow(
        "OpenViking commit failed: boom (HTTP 500)",
      );
    });
  });
});
