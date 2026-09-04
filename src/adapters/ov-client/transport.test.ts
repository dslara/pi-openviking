import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "http";
import type { AddressInfo } from "net";
import { Transport } from "./transport";
import { NotFoundError, ConnectionError, ValidationError } from "../../domain/errors/domain-error";

let server: http.Server;
let port: number;
let lastRequest: { method: string; path: string; headers: Record<string, string>; body?: unknown };
const requestCounts = new Map<string, number>();

beforeAll(async () => {
  server = http.createServer((req, res) => {
    // Collect request data for assertions
    lastRequest = {
      method: req.method ?? "GET",
      path: req.url ?? "/",
      headers: req.headers as Record<string, string>,
    };

    // Parse body
    let bodyStr = "";
    req.on("data", (chunk) => { bodyStr += chunk; });
    req.on("end", () => {
      if (bodyStr) {
        try { lastRequest.body = JSON.parse(bodyStr); } catch { lastRequest.body = bodyStr; }
      }

      // Route-based response control
      const url = new URL(req.url ?? "/", `http://localhost:${port}`);

      if (url.pathname === "/api/v1/success") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }

      if (url.pathname === "/api/v1/not-found") {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "resource missing" }));
        return;
      }

      if (url.pathname === "/api/v1/unauthorized") {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "bad key" }));
        return;
      }

      if (url.pathname === "/api/v1/validation-error") {
        res.writeHead(422, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "invalid input" }));
        return;
      }

      if (url.pathname === "/api/v1/server-error") {
        const attempts = requestCounts.get("/api/v1/server-error") ?? 0;
        requestCounts.set("/api/v1/server-error", attempts + 1);
        if (attempts < 2) {
          // Fail first two times, succeed on third
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ message: "server error" }));
        } else {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok after retry" }));
        }
        return;
      }

      if (url.pathname === "/api/v1/always-500") {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "always fails" }));
        return;
      }

      if (url.pathname === "/api/v1/delayed") {
        const delayMs = parseInt(url.searchParams.get("ms") ?? "100", 10);
        setTimeout(() => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "delayed ok" }));
        }, delayMs);
        return;
      }

      // Default: 200
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "default" }));
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      port = (server.address() as AddressInfo).port;
      resolve();
    });
  });
});

afterAll(() => {
  server?.close();
});

function makeTransport(opts?: Partial<{
  timeout: number;
  maxRetries: number;
}>) {
  return new Transport({
    endpoint: `http://127.0.0.1:${port}`,
    apiKey: "test-key",
    account: "test-account",
    user: "test-user",
    agentId: "pi",
    timeout: opts?.timeout ?? 5000,
    commitTimeout: 120_000,
    maxRetries: opts?.maxRetries ?? 2,
    rateLimitPerSecond: 0,
    autoCommitIntervalMs: 300_000,
  });
}

describe("Transport", () => {
  it("sends auth headers on every request", async () => {
    const t = makeTransport();
    await t.request("test", "/api/v1/success");
    expect(lastRequest.headers["x-api-key"]).toBe("test-key");
    expect(lastRequest.headers["x-openviking-account"]).toBe("test-account");
    expect(lastRequest.headers["x-openviking-user"]).toBe("test-user");
    expect(lastRequest.headers["x-openviking-agent"]).toBeDefined();
  });

  it("sends X-OpenViking-Agent header with default agentId", async () => {
    const t = makeTransport();
    await t.request("test", "/api/v1/success");
    expect(lastRequest.headers["x-openviking-agent"]).toBe("pi");
  });

  it("X-OpenViking-Agent reflects custom agentId from config", async () => {
    const t = new Transport({
      endpoint: `http://127.0.0.1:${port}`,
      apiKey: "test-key",
      account: "test-account",
      user: "test-user",
      agentId: "my-agent",
      timeout: 5000,
      commitTimeout: 120_000,
      maxRetries: 2,
      rateLimitPerSecond: 0,
      autoCommitIntervalMs: 300_000,
    });
    await t.request("test", "/api/v1/success");
    expect(lastRequest.headers["x-openviking-agent"]).toBe("my-agent");
  });

  it("sends Content-Type: application/json", async () => {
    const t = makeTransport();
    await t.request("test", "/api/v1/success");
    expect(lastRequest.headers["content-type"]).toBe("application/json");
  });

  it("returns parsed JSON on success", async () => {
    const t = makeTransport();
    const result = await t.request<{ status: string }>("test", "/api/v1/success");
    expect(result.status).toBe("ok");
  });

  it("maps 404 to NotFoundError", async () => {
    const t = makeTransport();
    await expect(t.request("test", "/api/v1/not-found")).rejects.toThrow(NotFoundError);
  });

  it("maps 401 to ConnectionError", async () => {
    const t = makeTransport();
    await expect(t.request("test", "/api/v1/unauthorized")).rejects.toThrow(ConnectionError);
  });

  it("maps 422 to ValidationError", async () => {
    const t = makeTransport();
    await expect(t.request("test", "/api/v1/validation-error")).rejects.toThrow(ValidationError);
  });

  it("retries on 5xx up to maxRetries", async () => {
    // Server-error route: fails first 2 calls, succeeds on 3rd
    // maxRetries=2 means 3 total attempts (initial + 2 retries)
    const t = makeTransport({ maxRetries: 2 });
    const result = await t.request<{ status: string }>("test", "/api/v1/server-error");
    expect(result.status).toBe("ok after retry");
  });

  it("throws ConnectionError after exhausting 5xx retries", async () => {
    const t = makeTransport({ maxRetries: 2 });
    await expect(t.request("test", "/api/v1/always-500")).rejects.toThrow(ConnectionError);
  });

  it("does NOT retry on 4xx errors", async () => {
    // Track call count
    let callCount = 0;
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      callCount++;
      return new Response(JSON.stringify({ message: "not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }) as any;

    try {
      const t = makeTransport();
      await expect(t.request("test", "/api/v1/anything")).rejects.toThrow(NotFoundError);
      expect(callCount).toBe(1); // No retry
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("respects AbortSignal", async () => {
    const t = makeTransport({ timeout: 5000 });
    const controller = new AbortController();
    // Delay of 200ms, abort immediately
    const promise = t.request("test", `/api/v1/delayed?ms=200`, undefined, controller.signal);
    controller.abort(new DOMException("Aborted", "AbortError"));

    await expect(promise).rejects.toThrow();
  });

  it("times out after configured timeout", async () => {
    const t = makeTransport({ timeout: 50 }); // 50ms timeout
    // Server delays 200ms — longer than timeout
    await expect(t.request("test", "/api/v1/delayed?ms=200")).rejects.toThrow();
  });

  it("sends POST body as JSON", async () => {
    const t = makeTransport();
    const body = { query: "hello", limit: 10 };
    await t.request("test", "/api/v1/success", {
      method: "POST",
      body: JSON.stringify(body),
    });
    expect(lastRequest.method).toBe("POST");
    expect(lastRequest.body).toEqual(body);
  });

  it("sends GET request by default", async () => {
    const t = makeTransport();
    await t.request("test", "/api/v1/success");
    expect(lastRequest.method).toBe("GET");
  });

  it("uses per-request timeout override when provided", async () => {
    const t = makeTransport({ timeout: 5000 }); // default 5s
    // Override with a much shorter timeout via RequestOptions
    await expect(t.request("test", "/api/v1/delayed?ms=200", { timeout: 10 })).rejects.toThrow();
  });

  it("uses default timeout when per-request timeout not set", async () => {
    const t = makeTransport({ timeout: 50 });
    await expect(t.request("test", "/api/v1/delayed?ms=200")).rejects.toThrow();
  });

  it("allows longer per-request timeout to succeed where default would fail", async () => {
    const t = makeTransport({ timeout: 10 }); // very short default
    // Override with longer timeout — should succeed
    const result = await t.request<{ status: string }>("test", "/api/v1/success", { timeout: 5000 });
    expect(result.status).toBe("ok");
  });

  it("rate limit 0 = no throttling (passthrough)", async () => {
    const t = makeTransport(); // default rateLimitPerSecond = 0
    const start = Date.now();
    await t.request("test", "/api/v1/success");
    await t.request("test", "/api/v1/success");
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(100); // no forced delay
  });

  it("rate limit > 0 throttles after exhausting initial tokens", async () => {
    const t = new Transport({
      endpoint: `http://127.0.0.1:${port}`,
      apiKey: "test-key",
      account: "test-account",
      user: "test-user",
    agentId: "pi",
      timeout: 5000,
      commitTimeout: 120_000,
      maxRetries: 0,
      rateLimitPerSecond: 10, // 100ms between tokens; starts with 10 tokens
      autoCommitIntervalMs: 300_000,
    });
    // First 10 requests consume initial tokens (no delay)
    for (let i = 0; i < 10; i++) {
      await t.request("test", "/api/v1/success");
    }
    // 11th request should wait for a token
    const start = Date.now();
    await t.request("test", "/api/v1/success");
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(50);
  });

  it("rate limit respects AbortSignal while waiting for token", async () => {
    const t = new Transport({
      endpoint: `http://127.0.0.1:${port}`,
      apiKey: "test-key",
      account: "test-account",
      user: "test-user",
    agentId: "pi",
      timeout: 5000,
      commitTimeout: 120_000,
      maxRetries: 0,
      rateLimitPerSecond: 5, // 200ms between tokens; starts with 5 tokens
      autoCommitIntervalMs: 300_000,
    });
    // Use up the first 5 tokens
    for (let i = 0; i < 5; i++) {
      await t.request("test", "/api/v1/success");
    }
    // 6th request will wait for next token
    const controller = new AbortController();
    const promise = t.request("test", "/api/v1/success", undefined, controller.signal);
    controller.abort();
    await expect(promise).rejects.toThrow();
  });
});

describe("Circuit breaker integration", () => {
  it("rejects with ConnectionError when circuit breaker is OPEN (no fetch)", async () => {
    const t = new Transport({
      endpoint: `http://127.0.0.1:${port}`,
      apiKey: "test-key",
      account: "test-account",
      user: "test-user",
    agentId: "pi",
      timeout: 5000,
      commitTimeout: 120_000,
      maxRetries: 0,
      rateLimitPerSecond: 0,
      circuitBreaker: { threshold: 1, resetTimeoutMs: 10_000, maxResetTimeoutMs: 300_000 },
      autoCommitIntervalMs: 300_000,
    });

    // First request fails → CB opens (threshold=1)
    await expect(t.request("test", "/api/v1/always-500")).rejects.toThrow(ConnectionError);

    // Second request → should reject instantly without making HTTP call
    const result = t.request("test", "/api/v1/success");
    await expect(result).rejects.toThrow(ConnectionError);
  });

  it("allows requests when circuit breaker is CLOSED", async () => {
    const t = new Transport({
      endpoint: `http://127.0.0.1:${port}`,
      apiKey: "test-key",
      account: "test-account",
      user: "test-user",
    agentId: "pi",
      timeout: 5000,
      commitTimeout: 120_000,
      maxRetries: 0,
      autoCommitIntervalMs: 300_000,
      rateLimitPerSecond: 0,
      circuitBreaker: { threshold: 3, resetTimeoutMs: 10_000, maxResetTimeoutMs: 300_000 },
    });

    const result = await t.request<{ status: string }>("test", "/api/v1/success");
    expect(result.status).toBe("ok");
  });

  it("records success and resets failure count", async () => {
    const t = new Transport({
      endpoint: `http://127.0.0.1:${port}`,
      apiKey: "test-key",
      account: "test-account",
      user: "test-user",
    agentId: "pi",
      timeout: 5000,
      commitTimeout: 120_000,
      autoCommitIntervalMs: 300_000,
      maxRetries: 0,
      rateLimitPerSecond: 0,
      circuitBreaker: { threshold: 3, resetTimeoutMs: 10_000, maxResetTimeoutMs: 300_000 },
    });

    // One failure should not open breaker
    await expect(t.request("test", "/api/v1/always-500")).rejects.toThrow();

    // A successful request should reset the counter
    const result = await t.request<{ status: string }>("test", "/api/v1/success");
    expect(result.status).toBe("ok");

    // Should be able to make one more failure without tripping
    await expect(t.request("test", "/api/v1/always-500")).rejects.toThrow();
  });

  it("isCircuitBreakerOpen returns correct state", async () => {
    const t = new Transport({
      endpoint: `http://127.0.0.1:${port}`,
      apiKey: "test-key",
      account: "test-account",
      user: "test-user",
    agentId: "pi",
      timeout: 5000,
      autoCommitIntervalMs: 300_000,
      commitTimeout: 120_000,
      maxRetries: 0,
      rateLimitPerSecond: 0,
      circuitBreaker: { threshold: 1, resetTimeoutMs: 10_000, maxResetTimeoutMs: 300_000 },
    });

    // Initially CLOSED
    expect(t.isCircuitBreakerOpen()).toBe(false);

    // Trip to OPEN
    await expect(t.request("test", "/api/v1/always-500")).rejects.toThrow();
    expect(t.isCircuitBreakerOpen()).toBe(true);
  });

  it("isCircuitBreakerOpen returns false when no CB configured", () => {
    const t = new Transport({
      endpoint: `http://127.0.0.1:${port}`,
      apiKey: "test-key",
      account: "test-account",
      user: "test-user",
    agentId: "pi",
      autoCommitIntervalMs: 300_000,
      timeout: 5000,
      commitTimeout: 120_000,
      maxRetries: 0,
      rateLimitPerSecond: 0,
    });

    expect(t.isCircuitBreakerOpen()).toBe(false);
  });

  it("retry sleep respects AbortSignal — aborts during backoff", async () => {
    const t = new Transport({
      endpoint: `http://127.0.0.1:${port}`,
      apiKey: "test-key",
      account: "test-account",
      user: "test-user",
      autoCommitIntervalMs: 300_000,
    agentId: "pi",
      timeout: 5000,
      commitTimeout: 120_000,
      maxRetries: 3,
      rateLimitPerSecond: 0,
    });

    const controller = new AbortController();
    const promise = t.request("test", "/api/v1/always-500", undefined, controller.signal);
    // Abort after a small delay to let retry sleep start
    setTimeout(() => controller.abort(), 50);

    // Should throw AbortError (DOMException), not retry until success
    await expect(promise).rejects.toThrow();
  });

  it("lazy TICK transitions OPEN to HALF_OPEN after resetTimeout elapses", async () => {
    const t = new Transport({
      endpoint: `http://127.0.0.1:${port}`,
      apiKey: "test-key",
      account: "test-account",
      autoCommitIntervalMs: 300_000,
      user: "test-user",
    agentId: "pi",
      timeout: 5000,
      commitTimeout: 120_000,
      maxRetries: 0,
      rateLimitPerSecond: 0,
      circuitBreaker: { threshold: 1, resetTimeoutMs: 500, maxResetTimeoutMs: 5000 },
    });

    // Trip to OPEN
    await expect(t.request("test", "/api/v1/always-500")).rejects.toThrow(ConnectionError);
    expect(t.isCircuitBreakerOpen()).toBe(true);

    // Wait for resetTimeout to elapse
    await new Promise((r) => setTimeout(r, 600));

    // Lazy TICK should transition to HALF_OPEN on next request, probe succeeds
    const result = await t.request<{ status: string }>("test", "/api/v1/success");
    expect(result.status).toBe("ok");
    expect(t.isCircuitBreakerOpen()).toBe(false);
  });
});
