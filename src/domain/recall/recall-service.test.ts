import { describe, it, expect, vi } from "vitest";
import { RecallService } from "./recall-service";
import type { SearchClient } from "../client/open-viking-client";
import type { RecallCurator } from "./recall-curator";
import type { RecallConfig } from "../common/recall-config";
import type { Logger } from "../ports/logger";
import type { SearchResult } from "../knowledge/model/search-result";
import { Uri } from "../common/uri";
import { ConnectionError, ValidationError } from "../errors/domain-error";

function makeConfig(overrides?: Partial<RecallConfig>): RecallConfig {
  return {
    topN: 5,
    scoreThreshold: 0.5,
    maxTokens: 4000,
    expandGraph: false,
    expandGraphDepth: 1 as const,
    expandGraphMaxRatio: 0.2,
    expandGraphMinSeedScore: 0.4,
    searchMode: "find",
    autoRecall: true,
    recallSearchTimeout: 5000,
    ...overrides,
  };
}

function makeLogger(): Logger & { warns: string[] } {
  const warns: string[] = [];
  return {
    warns,
    info: vi.fn(),
    warn: vi.fn((msg: string) => warns.push(msg)),
    error: vi.fn(),
    debug: vi.fn(),
    isEnabled: vi.fn().mockReturnValue(true),
  };
}

function makeKB(): SearchClient {
  return {
    find: vi.fn(),
    search: vi.fn(),
    glob: vi.fn(),
    grep: vi.fn(),
  };
}

function makeCurator(result?: Partial<import("./curate").CuratedResult>) {
  return {
    curate: vi.fn().mockResolvedValue({
      items: [],
      tokens: 0,
      dropped: 0,
      ...result,
    }),
  } as unknown as RecallCurator;
}

const sampleKBResult: SearchResult = {
  memories: [{ uri: "viking://a", text: "alpha", score: 0.9 }],
  resources: [],
  skills: [],
  total: 1,
};

describe("RecallService", () => {
  it("returns empty result when recall is disabled, without calling KB", async () => {
    const config = makeConfig();
    const kb = makeKB();
    const curator = makeCurator();
    const logger = makeLogger();

    const service = new RecallService(kb, curator, config, logger, false);
    const result = await service.recall("test prompt");

    expect(result).toEqual({
      items: [],
      tokens: 0,
      formatted: "",
      total: 0,
      timedOut: false,
    });
    expect(kb.find).not.toHaveBeenCalled();
    expect(kb.search).not.toHaveBeenCalled();
  });

  it("calls kb.find() and returns curated result when searchMode is find", async () => {
    const config = makeConfig({ searchMode: "find", topN: 3, targetUri: "viking://proj" });
    const kb = makeKB();
    (kb.find as ReturnType<typeof vi.fn>).mockResolvedValue(sampleKBResult);
    const curator = makeCurator({
      items: [{ uri: "viking://a", text: "alpha", score: 0.9, source: "memory" as const }],
      tokens: 50,
    });
    const logger = makeLogger();

    const service = new RecallService(kb, curator, config, logger, true);
    const result = await service.recall("test query");

    const findCalls = (kb.find as ReturnType<typeof vi.fn>).mock.calls;
    expect(findCalls).toHaveLength(1);
    const [arg, , signal] = findCalls[0];
    expect(arg.query).toBe("test query");
    expect(arg.limit).toBe(3);
    expect(arg.targetUri.value).toBe("viking://proj");
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal!.aborted).toBe(false);
    expect(kb.search).not.toHaveBeenCalled();
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.tokens).toBe(50);
    expect(result.formatted).toContain("viking://a");
  });

  it("calls kb.search() when searchMode is search, without sessionId", async () => {
    const config = makeConfig({ searchMode: "search" });
    const kb = makeKB();
    (kb.search as ReturnType<typeof vi.fn>).mockResolvedValue(sampleKBResult);
    const curator = makeCurator({
      items: [{ uri: "viking://a", text: "alpha", score: 0.9, source: "memory" as const }],
      tokens: 40,
    });
    const logger = makeLogger();

    const service = new RecallService(kb, curator, config, logger, true);
    const result = await service.recall("deep query");

    expect(kb.find).not.toHaveBeenCalled();
    const searchCalls = (kb.search as ReturnType<typeof vi.fn>).mock.calls;
    expect(searchCalls).toHaveLength(1);
    const [arg] = searchCalls[0];
    expect(arg.query).toBe("deep query");
    expect(arg.limit).toBe(5);
    expect(arg.sessionId).toBeUndefined();
    expect(result.items).toHaveLength(1);
    expect(result.formatted).toContain("viking://a");
  });

  it("forwards sessionId to kb.search() when provided", async () => {
    const config = makeConfig({ searchMode: "search" });
    const kb = makeKB();
    (kb.search as ReturnType<typeof vi.fn>).mockResolvedValue(sampleKBResult);
    const curator = makeCurator();
    const logger = makeLogger();
    const sid = { toString: () => "sess-123" } as any;

    const service = new RecallService(kb, curator, config, logger, true);
    await service.recall("with session", sid);

    const searchCalls = (kb.search as ReturnType<typeof vi.fn>).mock.calls;
    expect(searchCalls).toHaveLength(1);
    const [arg] = searchCalls[0];
    expect(arg.sessionId).toBe(sid);
  });

  it("ignores sessionId when searchMode is find", async () => {
    const config = makeConfig({ searchMode: "find" });
    const kb = makeKB();
    (kb.find as ReturnType<typeof vi.fn>).mockResolvedValue(sampleKBResult);
    const curator = makeCurator();
    const logger = makeLogger();
    const sid = { toString: () => "sess-456" } as any;

    const service = new RecallService(kb, curator, config, logger, true);
    await service.recall("find with session", sid);

    const findCalls = (kb.find as ReturnType<typeof vi.fn>).mock.calls;
    expect(findCalls).toHaveLength(1);
    // find() does not receive sessionId
    const [arg] = findCalls[0];
    expect(arg.sessionId).toBeUndefined();
    expect(kb.search).not.toHaveBeenCalled();
  });

  it("returns timedOut=true and aborts signal when KB does not respond in time", async () => {
    const config = makeConfig({ recallSearchTimeout: 100 });
    const signals: AbortSignal[] = [];
    const kb = makeKB();
    (kb.find as ReturnType<typeof vi.fn>).mockImplementation(
      async (_query: unknown, _opts: unknown, signal?: AbortSignal) => {
        signals.push(signal!);
        await new Promise<void>((_resolve, reject) => {
          if (signal?.aborted) {
            reject(new ConnectionError("aborted before start"));
            return;
          }
          const onAbort = () => reject(new ConnectionError("aborted"));
          signal?.addEventListener("abort", onAbort, { once: true });
        });
      },
    );
    const curator = makeCurator();
    const logger = makeLogger();

    const service = new RecallService(kb, curator, config, logger, true);
    const result = await service.recall("timeout test");

    expect(result.items).toHaveLength(0);
    expect(result.timedOut).toBe(true);
    // Verify signal was passed and actually aborted
    expect(signals).toHaveLength(1);
    expect(signals[0]).toBeInstanceOf(AbortSignal);
    expect(signals[0].aborted).toBe(true);
    expect(logger.warns).toContain("OV search timed out after 100ms, skipping recall");
  });

  it("returns empty result and logs warn on ConnectionError", async () => {
    const config = makeConfig();
    const kb = makeKB();
    (kb.find as ReturnType<typeof vi.fn>).mockRejectedValue(new ConnectionError("ECONNREFUSED"));
    const curator = makeCurator();
    const logger = makeLogger();

    const service = new RecallService(kb, curator, config, logger, true);
    const result = await service.recall("any prompt");

    expect(result).toEqual({ items: [], tokens: 0, formatted: "", total: 0, timedOut: false });
    expect(logger.warns).toContain("OV unavailable, skipping recall");
  });

  it("propagates ValidationError from KB without catching", async () => {
    const config = makeConfig();
    const kb = makeKB();
    (kb.find as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ValidationError("bad input", { field: "query" }),
    );
    const curator = makeCurator();
    const logger = makeLogger();

    const service = new RecallService(kb, curator, config, logger, true);

    await expect(service.recall("any prompt")).rejects.toThrow(ValidationError);
  });

  // ── Cooldown tests ────────────────────────────────────────────────────────

  it("enters 3-turn cooldown after timeout and skips KB calls", async () => {
    const config = makeConfig({ recallSearchTimeout: 50 });
    const kb = makeKB();
    let calls = 0;
    (kb.find as ReturnType<typeof vi.fn>).mockImplementation(
      async () => {
        calls++;
        await new Promise<void>((_resolve, reject) => {
          // Never resolves — will be timed out
          setTimeout(() => reject(new ConnectionError("aborted")), 100);
        });
      },
    );
    const curator = makeCurator();
    const logger = makeLogger();

    const service = new RecallService(kb, curator, config, logger, true);

    // 1st call: times out → cooldown = 3
    const r1 = await service.recall("prompt");
    expect(r1.timedOut).toBe(true);
    expect(calls).toBe(1);

    // 2nd–4th calls: skipped by cooldown (cooldown decrements: 2, 1, 0)
    const r2 = await service.recall("prompt");
    expect(r2.timedOut).toBe(false);
    expect(r2.items).toHaveLength(0);
    expect(calls).toBe(1);

    const r3 = await service.recall("prompt");
    expect(r3.timedOut).toBe(false);
    expect(calls).toBe(1);

    const r4 = await service.recall("prompt");
    expect(r4.timedOut).toBe(false);
    expect(calls).toBe(1);

    // 5th call: cooldown expired → KB called again
    const r5 = await service.recall("prompt");
    expect(calls).toBe(2);  // KB called again, will timeout again
    expect(r5.timedOut).toBe(true);
  });

  it("resets cooldown on success", async () => {
    const config = makeConfig({ recallSearchTimeout: 5000 });
    const kb = makeKB();
    (kb.find as ReturnType<typeof vi.fn>).mockResolvedValue(sampleKBResult);
    const curator = makeCurator({
      items: [{ uri: "viking://a", text: "alpha", score: 0.9, source: "memory" as const }],
      tokens: 10,
    });
    const logger = makeLogger();

    const service = new RecallService(kb, curator, config, logger, true);

    // First call succeeds
    const r1 = await service.recall("success");
    expect(r1.items).toHaveLength(1);
    expect((kb.find as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);

    // Manually set cooldown (simulate entering it somehow)
    (service as any).cooldownTurns = 2;

    // Next call should be blocked
    const r2 = await service.recall("blocked");
    expect(r2.items).toHaveLength(0);
    expect((kb.find as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);

    // After cooldown expires, success resets it
    (service as any).cooldownTurns = 1;
    await service.recall("skip");  // still in cooldown
    expect((kb.find as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);

    (service as any).cooldownTurns = 0;  // cooldown expired
    const r3 = await service.recall("fresh");
    expect(r3.items).toHaveLength(1);
    expect((kb.find as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
  });
});
