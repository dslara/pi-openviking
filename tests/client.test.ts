import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { createClient } from "../src/client";
import type { OpenVikingConfig } from "../src/config";

const defaultConfig: OpenVikingConfig = {
  endpoint: "http://localhost:1933",
  timeout: 5000,
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
        "OpenViking createSession failed: server error (HTTP 500)",
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
        "OpenViking search failed: server error (HTTP 503)",
      );
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
        "OpenViking sendMessage failed: server error (HTTP 401)",
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

    test("passes offset and limit as query params", async () => {
      restoreFetch = mockFetch(async (url) => {
        expect(url).toContain("offset=100");
        expect(url).toContain("limit=500");
        return {
          status: 200,
          body: { status: "ok", result: "partial content" },
        };
      });

      const client = createClient(defaultConfig);
      const result = await client.read("viking://docs/api.md", 100, 500);
      expect(result.content).toBe("partial content");
    });

    test("throws user-facing error on server error", async () => {
      restoreFetch = mockFetch(async () => ({
        status: 404,
        body: { status: "error", error: { code: "NOT_FOUND", message: "no such file" } },
      }));

      const client = createClient(defaultConfig);
      await expect(client.read("viking://missing")).rejects.toThrow(
        "OpenViking read failed: server error (HTTP 404)",
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

  describe("browse", () => {
    test("returns overview with children on success", async () => {
      restoreFetch = mockFetch(async (url) => {
        expect(url).toBe("http://localhost:1933/api/v1/content/overview?uri=viking%3A%2F%2Fresources%2Fdocs%2F");
        return {
          status: 200,
          body: {
            status: "ok",
            result: {
              uri: "viking://resources/docs/",
              children: [
                { uri: "viking://resources/docs/api.md", type: "file", abstract: "API reference" },
                { uri: "viking://resources/docs/guides/", type: "directory", abstract: "Guides" },
              ],
            },
          },
        };
      });

      const client = createClient(defaultConfig);
      const result = await client.browse("viking://resources/docs/");
      expect(result.uri).toBe("viking://resources/docs/");
      expect(result.children).toHaveLength(2);
      expect(result.children[0].uri).toBe("viking://resources/docs/api.md");
    });

    test("throws user-facing error on server error", async () => {
      restoreFetch = mockFetch(async () => ({
        status: 500,
        body: { status: "error", error: { code: "INTERNAL", message: "boom" } },
      }));

      const client = createClient(defaultConfig);
      await expect(client.browse("viking://resources/unknown/")).rejects.toThrow(
        "OpenViking browse failed: server error (HTTP 500)",
      );
    });

    test("throws user-facing error on abort", async () => {
      restoreFetch = mockFetch(async () => {
        await new Promise((r) => setTimeout(r, 60000));
        return { status: 200, body: {} };
      });

      const controller = new AbortController();
      const client = createClient(defaultConfig);
      const promise = client.browse("viking://resources/", controller.signal);
      setTimeout(() => controller.abort(), 10);
      await expect(promise).rejects.toThrow(
        "OpenViking browse failed: request aborted",
      );
    }, 15000);
  });

  describe("commit", () => {
    test("returns task_id on success", async () => {
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
            },
          },
        };
      });

      const client = createClient(defaultConfig);
      const taskId = await client.commit("sess-1");
      expect(taskId).toBe("task-999");
    });

    test("throws user-facing error on server error", async () => {
      restoreFetch = mockFetch(async () => ({
        status: 500,
        body: { status: "error", error: { code: "INTERNAL", message: "boom" } },
      }));

      const client = createClient(defaultConfig);
      await expect(client.commit("sess-1")).rejects.toThrow(
        "OpenViking commit failed: server error (HTTP 500)",
      );
    });
  });
});
