import { describe, test, expect, vi } from "vitest";
import type { SearchResult } from "../src/features/ov-client/client";
import { createAutoRecall } from "../src/features/auto-recall/auto-recall";
import { createMockClient, createMockSessionSync } from "./mocks";

function makeState(enabled = true) {
  return { enabled };
}

describe("createAutoRecall", () => {
  test("silently skips on search failure", async () => {
    const client = createMockClient({
      search: vi.fn(async () => {
        throw new Error("OpenViking search failed: boom");
      }),
    });
    const sync = createMockSessionSync();
    const autoRecall = createAutoRecall(client, sync, makeState());

    const result = await autoRecall({ prompt: "hello", systemPrompt: "base prompt" });
    expect(result.systemPrompt).toBeUndefined();
  });

  test("returns empty object when no results", async () => {
    const client = createMockClient();
    const sync = createMockSessionSync();
    const autoRecall = createAutoRecall(client, sync, makeState());

    const result = await autoRecall({ prompt: "hello", systemPrompt: "base prompt" });
    expect(result.systemPrompt).toBeUndefined();
  });

  test("appends relevant-memories block to system prompt", async () => {
    const client = createMockClient({
      search: vi.fn(async () => ({
        memories: [{ text: "memory one", score: 0.95, uri: "viking://user/memories/m1" }],
        resources: [{ uri: "viking://docs/one", score: 0.85, abstract: "doc one" }],
        skills: [],
        total: 2,
      } as SearchResult)),
    });
    const sync = createMockSessionSync();
    const autoRecall = createAutoRecall(client, sync, makeState());

    const result = await autoRecall({ prompt: "hello", systemPrompt: "base prompt" });
    expect(result.systemPrompt).toContain("<relevant-memories>");
    expect(result.systemPrompt).toContain("memory one");
    expect(result.systemPrompt).toContain("viking://docs/one");
    expect(result.systemPrompt).toContain("Use the memread tool");
    expect(result.systemPrompt).toMatch(/^base prompt\n\n/);
  });

  test("passes session_id to search when available", async () => {
    const search = vi.fn(async () => ({ memories: [], resources: [], skills: [], total: 0 } as SearchResult));
    const client = createMockClient({ search });
    const sync = createMockSessionSync({ getOvSessionId: () => "ov-sess-99" });
    const autoRecall = createAutoRecall(client, sync, makeState());

    await autoRecall({ prompt: "hello", systemPrompt: "base" });
    expect(search).toHaveBeenCalledWith("ov-sess-99", "hello", 10, "deep", undefined, expect.any(AbortSignal));
  });

  test("passes undefined session_id when not mapped", async () => {
    const search = vi.fn(async () => ({ memories: [], resources: [], skills: [], total: 0 } as SearchResult));
    const client = createMockClient({ search });
    const sync = createMockSessionSync({ getOvSessionId: () => undefined });
    const autoRecall = createAutoRecall(client, sync, makeState());

    await autoRecall({ prompt: "hello", systemPrompt: "base" });
    expect(search).toHaveBeenCalledWith(undefined, "hello", 10, "fast", undefined, expect.any(AbortSignal));
  });

  test("deduplicates by abstract + uri and limits to 5", async () => {
    const client = createMockClient({
      search: vi.fn(async () => ({
        memories: [
          { text: "dup", score: 0.99, uri: "viking://user/memories/m1" },
          { text: "dup", score: 0.98, uri: "viking://user/memories/m2" },
          { text: "unique memory", score: 0.97, uri: "viking://user/memories/m3" },
        ],
        resources: [
          { uri: "viking://dup", score: 0.96, abstract: "dup" },
          { uri: "viking://dup", score: 0.95, abstract: "dup" },
          { uri: "viking://res3", score: 0.94, abstract: "res3" },
          { uri: "viking://res4", score: 0.93, abstract: "res4" },
          { uri: "viking://res5", score: 0.92, abstract: "res5" },
          { uri: "viking://res6", score: 0.91, abstract: "res6" },
        ],
        skills: [],
        total: 9,
      } as SearchResult)),
    });
    const sync = createMockSessionSync();
    const autoRecall = createAutoRecall(client, sync, makeState());

    const result = await autoRecall({ prompt: "q", systemPrompt: "base" });
    const block = result.systemPrompt!;
    const memories = block.match(/<memory/g) ?? [];
    const resources = block.match(/<resource/g) ?? [];
    // 3 distinct memory URIs (not deduped — different URIs) + 1 deduped resource URI
    // = 5 total (topN limit)
    expect(memories.length).toBe(3);
    expect(resources.length).toBe(2); // dup URI deduped to 1 + res4 (to hit 5 total)
    expect(block).not.toContain('uri="viking://res6"');
  });

  test("sorts results by score descending", async () => {
    const client = createMockClient({
      search: vi.fn(async () => ({
        memories: [
          { text: "low mem", score: 0.5, uri: "viking://user/memories/low" },
          { text: "high mem", score: 0.9, uri: "viking://user/memories/high" },
        ],
        resources: [
          { uri: "viking://mid", score: 0.7, abstract: "mid" },
        ],
        skills: [],
        total: 3,
      } as SearchResult)),
    });
    const sync = createMockSessionSync();
    const autoRecall = createAutoRecall(client, sync, makeState());

    const result = await autoRecall({ prompt: "q", systemPrompt: "base" });
    const block = result.systemPrompt!;
    const highIdx = block.indexOf("high mem");
    const midIdx = block.indexOf("viking://mid");
    const lowIdx = block.indexOf("low mem");
    expect(highIdx).toBeLessThan(midIdx);
    expect(midIdx).toBeLessThan(lowIdx);
  });

  test("silently skips on timeout", async () => {
    const client = createMockClient({
      search: vi.fn(async (_sid, _query, _limit, _mode, _targetUri, signal) => {
        return new Promise<SearchResult>((_resolve, reject) => {
          const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
          if (signal?.aborted) return onAbort();
          signal?.addEventListener("abort", onAbort);
          setTimeout(() => signal?.removeEventListener("abort", onAbort), 30000);
        });
      }),
    });
    const sync = createMockSessionSync();
    const autoRecall = createAutoRecall(client, sync, makeState());

    const result = await autoRecall({ prompt: "hello", systemPrompt: "base" });
    expect(result.systemPrompt).toBeUndefined();
  }, 10000);

  test("escapes XML special characters", async () => {
    const client = createMockClient({
      search: vi.fn(async () => ({
        memories: [{ text: '5 < 10 & "hello"', score: 0.9, uri: "viking://user/memories/m1" }],
        resources: [{ uri: 'viking://a"b', score: 0.8, abstract: "<tag>" }],
        skills: [],
        total: 2,
      } as SearchResult)),
    });
    const sync = createMockSessionSync();
    const autoRecall = createAutoRecall(client, sync, makeState());

    const result = await autoRecall({ prompt: "q", systemPrompt: "base" });
    const block = result.systemPrompt!;
    expect(block).toContain("5 &lt; 10 &amp; &quot;hello&quot;");
    expect(block).toContain('uri="viking://a&quot;b"');
    expect(block).toContain("&lt;tag&gt;");
  });

  test("custom limit passed to search", async () => {
    const search = vi.fn(async () => ({ memories: [], resources: [], skills: [], total: 0 } as SearchResult));
    const client = createMockClient({ search });
    const sync = createMockSessionSync();
    const autoRecall = createAutoRecall(client, sync, makeState(), { limit: 20 });

    await autoRecall({ prompt: "hello", systemPrompt: "base" });
    expect(search).toHaveBeenCalledWith(expect.anything(), "hello", 20, "deep", undefined, expect.any(AbortSignal));
  });

  test("custom topN limits results", async () => {
    const client = createMockClient({
      search: vi.fn(async () => ({
        memories: [
          { text: "m1", score: 0.99, uri: "viking://user/memories/m1" },
          { text: "m2", score: 0.98, uri: "viking://user/memories/m2" },
          { text: "m3", score: 0.97, uri: "viking://user/memories/m3" },
        ],
        resources: [
          { uri: "viking://r1", score: 0.96, abstract: "r1" },
          { uri: "viking://r2", score: 0.95, abstract: "r2" },
        ],
        skills: [],
        total: 5,
      } as SearchResult)),
    });
    const sync = createMockSessionSync();
    const autoRecall = createAutoRecall(client, sync, makeState(), { topN: 2 });

    const result = await autoRecall({ prompt: "q", systemPrompt: "base" });
    const block = result.systemPrompt!;
    const memories = block.match(/<memory/g) ?? [];
    const resources = block.match(/<resource/g) ?? [];
    expect(memories.length + resources.length).toBe(2);
  });

  test("custom timeout aborts faster", async () => {
    const client = createMockClient({
      search: vi.fn(async (_sid, _query, _limit, _mode, _targetUri, signal) => {
        return new Promise<SearchResult>((_resolve, reject) => {
          const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
          if (signal?.aborted) return onAbort();
          signal?.addEventListener("abort", onAbort);
          setTimeout(() => signal?.removeEventListener("abort", onAbort), 30000);
        });
      }),
    });
    const sync = createMockSessionSync();
    const autoRecall = createAutoRecall(client, sync, makeState(), { timeout: 50 });

    const start = Date.now();
    const result = await autoRecall({ prompt: "hello", systemPrompt: "base" });
    const elapsed = Date.now() - start;

    expect(result.systemPrompt).toBeUndefined();
    expect(elapsed).toBeLessThan(500);
  }, 10000);

  test("uses deep search mode when session exists", async () => {
    const search = vi.fn(async () => ({ memories: [], resources: [], skills: [], total: 0 } as SearchResult));
    const client = createMockClient({ search });
    const sync = createMockSessionSync({ getOvSessionId: () => "ov-sess-99" });
    const autoRecall = createAutoRecall(client, sync, makeState());

    await autoRecall({ prompt: "hello", systemPrompt: "base" });
    expect(search).toHaveBeenCalledWith("ov-sess-99", "hello", 10, "deep", undefined, expect.any(AbortSignal));
  });

  test("uses fast search mode when no session", async () => {
    const search = vi.fn(async () => ({ memories: [], resources: [], skills: [], total: 0 } as SearchResult));
    const client = createMockClient({ search });
    const sync = createMockSessionSync({ getOvSessionId: () => undefined });
    const autoRecall = createAutoRecall(client, sync, makeState());

    await autoRecall({ prompt: "hello", systemPrompt: "base" });
    expect(search).toHaveBeenCalledWith(undefined, "hello", 10, "fast", undefined, expect.any(AbortSignal));
  });

  test("trims results bottom-up to respect token budget", async () => {
    const client = createMockClient({
      search: vi.fn(async () => ({
        memories: Array.from({ length: 5 }, (_, i) => ({
          text: `item-${i}-` + "a".repeat(390),
          score: 0.99 - i * 0.01,
          uri: `viking://user/memories/item-${i}`,
        })),
        resources: [],
        skills: [],
        total: 5,
      } as SearchResult)),
    });
    const sync = createMockSessionSync();
    const autoRecall = createAutoRecall(client, sync, makeState(), { topN: 5 });

    const result = await autoRecall({ prompt: "q", systemPrompt: "base" });
    const block = result.systemPrompt!.replace("base\n\n", "");

    expect(Math.ceil(block.length / 4)).toBeLessThanOrEqual(500);
    expect(block).toContain('score="0.99"');
    expect(block).toContain('score="0.98"');
    expect(block).toContain('score="0.97"');
    expect(block).toContain('score="0.96"');
    expect(block).not.toContain('score="0.95"');
  });

  test("returns empty when auto recall is disabled via state", async () => {
    const search = vi.fn(async () => ({ memories: [], resources: [], skills: [], total: 0 } as SearchResult));
    const client = createMockClient({ search });
    const sync = createMockSessionSync();
    const state = makeState(false);
    const autoRecall = createAutoRecall(client, sync, state);

    const result = await autoRecall({ prompt: "hello", systemPrompt: "base" });
    expect(result.systemPrompt).toBeUndefined();
    expect(search).not.toHaveBeenCalled();
  });

  test("respects state toggle after creation", async () => {
    const search = vi.fn(async () => ({ memories: [], resources: [], skills: [], total: 0 } as SearchResult));
    const client = createMockClient({ search });
    const sync = createMockSessionSync();
    const state = makeState(true);
    const autoRecall = createAutoRecall(client, sync, state);

    state.enabled = false;
    const result = await autoRecall({ prompt: "hello", systemPrompt: "base" });
    expect(result.systemPrompt).toBeUndefined();
    expect(search).not.toHaveBeenCalled();
  });
});
