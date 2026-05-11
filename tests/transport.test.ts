import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { createTransport, OpenVikingError } from "../src/features/ov-client/transport";
import type { TransportConfig } from "../src/features/ov-client/transport";

const defaultConfig: TransportConfig = {
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

describe("createTransport", () => {
  let restoreFetch: () => void;

  beforeEach(() => {
    restoreFetch = () => {};
  });

  afterEach(() => {
    restoreFetch();
  });

  test("sends correct headers", async () => {
    let capturedHeaders: Record<string, string> = {};
    restoreFetch = mockFetch(async (url, init) => {
      capturedHeaders = Object.fromEntries(
        Object.entries(init.headers as Record<string, string> ?? {})
      );
      return { status: 200, body: { status: "ok", result: {} } };
    });

    const transport = createTransport(defaultConfig);
    await transport.request("test", "/api/v1/test");
    expect(capturedHeaders["Content-Type"]).toBe("application/json");
    expect(capturedHeaders["X-API-Key"]).toBe("dev");
    expect(capturedHeaders["X-OpenViking-Account"]).toBe("default");
    expect(capturedHeaders["X-OpenViking-User"]).toBe("default");
  });

  test("uses POST when body provided", async () => {
    let method: string | undefined;
    restoreFetch = mockFetch(async (url, init) => {
      method = init.method;
      return { status: 200, body: { status: "ok", result: {} } };
    });

    const transport = createTransport(defaultConfig);
    await transport.request("test", "/api/v1/test", { body: { foo: "bar" } });
    expect(method).toBe("POST");
  });

  test("uses explicit httpMethod over body inference", async () => {
    let method: string | undefined;
    restoreFetch = mockFetch(async (url, init) => {
      method = init.method;
      return { status: 200, body: { status: "ok", result: {} } };
    });

    const transport = createTransport(defaultConfig);
    await transport.request("test", "/api/v1/test", { httpMethod: "DELETE" });
    expect(method).toBe("DELETE");
  });

  test("returns result from envelope", async () => {
    restoreFetch = mockFetch(async () => ({
      status: 200,
      body: { status: "ok", result: { id: "123" } },
    }));

    const transport = createTransport(defaultConfig);
    const result = await transport.request("test", "/api/v1/test");
    expect(result).toEqual({ id: "123" });
  });

  test("throws OpenVikingError on HTTP error", async () => {
    restoreFetch = mockFetch(async () => ({
      status: 500,
      body: { status: "error", error: { code: "INTERNAL", message: "boom" } },
    }));

    const transport = createTransport(defaultConfig);
    await expect(transport.request("createSession", "/api/v1/sessions")).rejects.toThrow(
      "OpenViking createSession failed: boom (HTTP 500)",
    );
  });

  test("throws OpenVikingError on timeout", async () => {
    restoreFetch = mockFetch(async () => {
      await new Promise((r) => setTimeout(r, 60000));
      return { status: 200, body: {} };
    });

    const transport = createTransport({ ...defaultConfig, timeout: 50 });
    await expect(transport.request("test", "/api/v1/test")).rejects.toThrow(
      "OpenViking test failed: request timed out",
    );
  }, 15000);

  test("throws OpenVikingError on abort", async () => {
    restoreFetch = mockFetch(async () => {
      await new Promise((r) => setTimeout(r, 60000));
      return { status: 200, body: {} };
    });

    const controller = new AbortController();
    const transport = createTransport(defaultConfig);
    const promise = transport.request("test", "/api/v1/test", undefined, controller.signal);
    setTimeout(() => controller.abort(), 10);
    await expect(promise).rejects.toThrow(
      "OpenViking test failed: request aborted",
    );
  }, 15000);

  test("uses per-request timeout override", async () => {
    restoreFetch = mockFetch(async () => {
      await new Promise((r) => setTimeout(r, 60000));
      return { status: 200, body: {} };
    });

    const transport = createTransport({ ...defaultConfig, timeout: 5000 });
    await expect(transport.request("test", "/api/v1/test", { timeout: 50 })).rejects.toThrow(
      "OpenViking test failed: request timed out",
    );
  }, 15000);

  test("sends FormData without overriding Content-Type", async () => {
    let capturedBody: unknown;
    let capturedHeaders: Record<string, string> = {};
    restoreFetch = mockFetch(async (url, init) => {
      capturedBody = init.body;
      capturedHeaders = Object.fromEntries(
        Object.entries(init.headers as Record<string, string> ?? {})
      );
      return { status: 200, body: { status: "ok", result: { temp_file_id: "tmp-1" } } };
    });

    const transport = createTransport(defaultConfig);
    const form = new FormData();
    form.append("file", new Blob(["hello"]), "test.txt");
    await transport.request("tempUpload", "/api/v1/resources/temp_upload", { body: form });

    expect(capturedBody).toBeInstanceOf(FormData);
    expect(capturedHeaders["Content-Type"]).toBeUndefined();
    expect(capturedHeaders["X-API-Key"]).toBe("dev");
  });

  test("throws OpenVikingError on fetch failure", async () => {
    const original = globalThis.fetch;
    (globalThis as any).fetch = async () => {
      throw new Error("network down");
    };

    try {
      const transport = createTransport(defaultConfig);
      await expect(transport.request("test", "/api/v1/test")).rejects.toThrow(
        "OpenViking test failed: network down",
      );
    } finally {
      (globalThis as any).fetch = original;
    }
  });
});
