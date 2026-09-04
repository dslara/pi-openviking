import { describe, it, expect, vi } from "vitest";
import { RecallCurator } from "./recall-curator";
import type { Scorer } from "./curate";
import type { SearchResult } from "../knowledge/search-result";
import type { RecallConfig } from "../common/recall-config";
import type { Logger } from "../ports/logger";
import type { GraphExpander } from "./graph-expander";
import type { CuratedItem } from "./curate";

function makeConfig(overrides?: Partial<RecallConfig>): RecallConfig {
  return {
    topN: 5,
    scoreThreshold: 0,
    maxTokens: 10000,
    expandGraph: false,
    searchMode: "find",
    expandGraphDepth: 1,
    expandGraphMaxRatio: 0.2,
    expandGraphMinSeedScore: 0.4,
    recallSearchTimeout: 5000,
    autoRecall: true,
    ...overrides,
  };
}

function makeLogger(): Logger & { messages: string[] } {
  const messages: string[] = [];
  return {
    messages,
    info: vi.fn((msg: string) => messages.push(msg)),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    isEnabled: vi.fn().mockReturnValue(true),
  };
}

function makeGraphExpander(): GraphExpander {
  return {
    expand: vi.fn().mockResolvedValue([]),
  } as unknown as GraphExpander;
}

const sampleResult: SearchResult = {
  memories: [
    { uri: "viking://a", text: "AAA", abstract: "aaa", score: 0.9 },
    { uri: "viking://b", text: "BBB", abstract: "bbb", score: 0.5 },
  ],
  resources: [
    { uri: "viking://r1", score: 0.8, abstract: "resource one" },
  ],
  skills: [],
  total: 3,
};

describe("RecallCurator", () => {
  it("curates results using opts from config", async () => {
    const config = makeConfig({ topN: 2, scoreThreshold: 0.6, maxTokens: 5000 });
    const logger = makeLogger();
    const curator = new RecallCurator(config, [], logger);

    const result = await curator.curate(sampleResult);

    expect(result.items).toHaveLength(2);
    expect(result.items[0].uri).toBe("viking://a");
    expect(result.items[1].uri).toBe("viking://r1");
  });

  it("passes scorers from constructor into curate opts", async () => {
    const boostScorer: Scorer = (_item, _query) => 10;
    const config = makeConfig();
    const logger = makeLogger();
    const curator = new RecallCurator(config, [boostScorer], logger);

    const result = await curator.curate(sampleResult);

    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0].score).toBeGreaterThanOrEqual(10);
  });

  it("emits log line with item count and tokens", async () => {
    const config = makeConfig();
    const logger = makeLogger();
    const curator = new RecallCurator(config, [], logger);

    const result = await curator.curate(sampleResult);

    expect(logger.info).toHaveBeenCalledWith(
      `curated ${sampleResult.total} items → ${result.items.length} items, ${result.tokens} tokens`,
    );
  });

  it("returns empty for empty results", async () => {
    const config = makeConfig();
    const logger = makeLogger();
    const curator = new RecallCurator(config, [], logger);

    const empty: SearchResult = { memories: [], resources: [], skills: [], total: 0 };
    const result = await curator.curate(empty);

    expect(result.items).toHaveLength(0);
    expect(result.tokens).toBe(0);
    expect(result.dropped).toBe(0);
  });

  it("returns empty when all results below threshold", async () => {
    const config = makeConfig({ scoreThreshold: 0.99 });
    const logger = makeLogger();
    const curator = new RecallCurator(config, [], logger);

    const result = await curator.curate(sampleResult);

    expect(result.items).toHaveLength(0);
  });

  it("returns empty when maxTokens is zero budget", async () => {
    const config = makeConfig({ maxTokens: 1 });
    const logger = makeLogger();
    const curator = new RecallCurator(config, [], logger);

    const result = await curator.curate(sampleResult);

    expect(result.items).toHaveLength(0);
  });

  it("skips graph expansion when config.expandGraph is false", async () => {
    const config = makeConfig({ expandGraph: false });
    const logger = makeLogger();
    const graphExpander = makeGraphExpander();
    const curator = new RecallCurator(config, [], logger, graphExpander);

    const result = await curator.curate(sampleResult);

    expect(graphExpander.expand).not.toHaveBeenCalled();
    expect(result.items.length).toBeGreaterThan(0);
  });

  it("skips graph expansion when no graphExpander provided", async () => {
    const config = makeConfig({ expandGraph: true });
    const logger = makeLogger();
    const curator = new RecallCurator(config, [], logger);

    const result = await curator.curate(sampleResult);

    expect(result.items.length).toBeGreaterThan(0);
  });

  it("appends graph items when expandGraph is enabled and expander returns items", async () => {
    const config = makeConfig({ expandGraph: true, maxTokens: 10000 });
    const logger = makeLogger();
    const graphExpander = makeGraphExpander();
    const graphItems: CuratedItem[] = [
      { uri: "viking://graph1", text: "graph content", score: 0.5, source: "graph" },
    ];
    vi.mocked(graphExpander.expand).mockResolvedValue(graphItems);
    const curator = new RecallCurator(config, [], logger, graphExpander);

    const result = await curator.curate(sampleResult);

    expect(graphExpander.expand).toHaveBeenCalledTimes(1);
    // graph items are merged and sorted
    const graphUris = result.items.filter(i => i.source === "graph").map(i => i.uri);
    expect(graphUris).toContain("viking://graph1");
  });

  it("does not call expander when curated items are empty", async () => {
    const config = makeConfig({ expandGraph: true });
    const logger = makeLogger();
    const graphExpander = makeGraphExpander();
    const curator = new RecallCurator(config, [], logger, graphExpander);

    const empty: SearchResult = { memories: [], resources: [], skills: [], total: 0 };
    await curator.curate(empty);

    expect(graphExpander.expand).not.toHaveBeenCalled();
  });
});
