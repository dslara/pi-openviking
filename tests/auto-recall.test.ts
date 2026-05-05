import { describe, test, expect, vi, beforeEach } from "vitest";
import type { OpenVikingClient, SearchResult } from "../src/client";
import { createAutoRecall } from "../src/auto-recall";
import type { SessionSyncLike } from "../src/session";

function mockClient(overrides: Partial<OpenVikingClient> = {}): OpenVikingClient {
  return {
    createSession: vi.fn(async () => "sess-1"),
    sendMessage: vi.fn(async () => {}),
    search: vi.fn(async () => ({ memories: [], resources: [], total: 0 } as SearchResult)),
    read: vi.fn(async () => ({ content: "" })),
    fsList: vi.fn(async () => ({ uri: "", children: [] })),
    fsTree: vi.fn(async () => ({ uri: "", children: [] })),
    fsStat: vi.fn(async () => ({ uri: "", children: [] })),
    commit: vi.fn(async () => ({ task_id: "task-1", archived: true })),
    ...overrides,
  };
}

function mockSessionSync(overrides: Partial<SessionSyncLike> = {}): SessionSyncLike {
  return {
    getOvSessionId: vi.fn(() => "ov-sess-1"),
    flush: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("createAutoRecall", () => {
  test("silently skips on search failure", async () => {
    const client = mockClient({
      search: vi.fn(async () => {
        throw new Error("OpenViking search failed: boom");
      }),
    });
    const sync = mockSessionSync();
    const autoRecall = createAutoRecall(client, sync);

    const result = await autoRecall({ prompt: "hello", systemPrompt: "base prompt" });
    expect(result.systemPrompt).toBeUndefined();
  });

  test("returns empty object when no results", async () => {
    const client = mockClient();
    const sync = mockSessionSync();
    const autoRecall = createAutoRecall(client, sync);

    const result = await autoRecall({ prompt: "hello", systemPrompt: "base prompt" });
    expect(result.systemPrompt).toBeUndefined();
  });

  test("appends relevant-memories block to system prompt", async () => {
    const client = mockClient({
      search: vi.fn(async () => ({
        memories: [{ text: "memory one", score: 0.95 }],
        resources: [{ uri: "viking://docs/one", score: 0.85, abstract: "doc one" }],
        total: 2,
      } as SearchResult)),
    });
    const sync = mockSessionSync();
    const autoRecall = createAutoRecall(client, sync);

    const result = await autoRecall({ prompt: "hello", systemPrompt: "base prompt" });
    expect(result.systemPrompt).toContain("<relevant-memories>");
    expect(result.systemPrompt).toContain("memory one");
    expect(result.systemPrompt).toContain("viking://docs/one");
    expect(result.systemPrompt).toContain("Use the memread tool");
    expect(result.systemPrompt).toMatch(/^base prompt\n\n/);
  });

  test("passes session_id to search when available", async () => {
    const search = vi.fn(async () => ({ memories: [], resources: [], total: 0 } as SearchResult));
    const client = mockClient({ search });
    const sync = mockSessionSync({ getOvSessionId: () => "ov-sess-99" });
    const autoRecall = createAutoRecall(client, sync);

    await autoRecall({ prompt: "hello", systemPrompt: "base" });
    expect(search).toHaveBeenCalledWith("ov-sess-99", "hello", 10, "fast", expect.any(AbortSignal));
  });

  test("passes undefined session_id when not mapped", async () => {
    const search = vi.fn(async () => ({ memories: [], resources: [], total: 0 } as SearchResult));
    const client = mockClient({ search });
    const sync = mockSessionSync({ getOvSessionId: () => undefined });
    const autoRecall = createAutoRecall(client, sync);

    await autoRecall({ prompt: "hello", systemPrompt: "base" });
    expect(search).toHaveBeenCalledWith(undefined, "hello", 10, "fast", expect.any(AbortSignal));
  });

  test("deduplicates by abstract + uri and limits to 5", async () => {
    const client = mockClient({
      search: vi.fn(async () => ({
        memories: [
          { text: "dup", score: 0.99 },
          { text: "dup", score: 0.98 },
          { text: "unique memory", score: 0.97 },
        ],
        resources: [
          { uri: "viking://dup", score: 0.96, abstract: "dup" },
          { uri: "viking://dup", score: 0.95, abstract: "dup" },
          { uri: "viking://res3", score: 0.94, abstract: "res3" },
          { uri: "viking://res4", score: 0.93, abstract: "res4" },
          { uri: "viking://res5", score: 0.92, abstract: "res5" },
          { uri: "viking://res6", score: 0.91, abstract: "res6" },
        ],
        total: 9,
      } as SearchResult)),
    });
    const sync = mockSessionSync();
    const autoRecall = createAutoRecall(client, sync);

    const result = await autoRecall({ prompt: "q", systemPrompt: "base" });
    const block = result.systemPrompt!;
    const memories = block.match(/<memory/g) ?? [];
    const resources = block.match(/<resource/g) ?? [];
    expect(memories.length).toBe(2); // dup once + unique memory
    expect(resources.length).toBe(3); // dup once + res4 + res5 (to hit 5 total)
    expect(block).not.toContain('uri="viking://res6"');
  });

  test("sorts results by score descending", async () => {
    const client = mockClient({
      search: vi.fn(async () => ({
        memories: [
          { text: "low mem", score: 0.5 },
          { text: "high mem", score: 0.9 },
        ],
        resources: [
          { uri: "viking://mid", score: 0.7, abstract: "mid" },
        ],
        total: 3,
      } as SearchResult)),
    });
    const sync = mockSessionSync();
    const autoRecall = createAutoRecall(client, sync);

    const result = await autoRecall({ prompt: "q", systemPrompt: "base" });
    const block = result.systemPrompt!;
    const highIdx = block.indexOf("high mem");
    const midIdx = block.indexOf("viking://mid");
    const lowIdx = block.indexOf("low mem");
    expect(highIdx).toBeLessThan(midIdx);
    expect(midIdx).toBeLessThan(lowIdx);
  });

  test("silently skips on timeout", async () => {
    const client = mockClient({
      search: vi.fn(async (_sid: string, _query: string, _limit: number | undefined, signal: AbortSignal | undefined) => {
        return new Promise<SearchResult>((_resolve, reject) => {
          const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
          if (signal?.aborted) return onAbort();
          signal?.addEventListener("abort", onAbort);
          setTimeout(() => signal?.removeEventListener("abort", onAbort), 30000);
        });
      }),
    });
    const sync = mockSessionSync();
    const autoRecall = createAutoRecall(client, sync);

    const result = await autoRecall({ prompt: "hello", systemPrompt: "base" });
    expect(result.systemPrompt).toBeUndefined();
  }, 10000);

  test("escapes XML special characters", async () => {
    const client = mockClient({
      search: vi.fn(async () => ({
        memories: [{ text: '5 < 10 & "hello"', score: 0.9 }],
        resources: [{ uri: 'viking://a"b', score: 0.8, abstract: "<tag>" }],
        total: 2,
      } as SearchResult)),
    });
    const sync = mockSessionSync();
    const autoRecall = createAutoRecall(client, sync);

    const result = await autoRecall({ prompt: "q", systemPrompt: "base" });
    const block = result.systemPrompt!;
    expect(block).toContain("5 &lt; 10 &amp; &quot;hello&quot;");
    expect(block).toContain('uri="viking://a&quot;b"');
    expect(block).toContain("&lt;tag&gt;");
  });
});
