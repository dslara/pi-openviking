import type { Content } from "../client/ov-types";
import { describe, it, expect, vi } from "vitest";
import { GraphExpander } from "./graph-expander";
import { RecallCurator } from "./recall-curator";
import { relevanceScorer } from "./curate";
import type { RelationClient } from "../client/open-viking-client";
import type { FsClient } from "../client/open-viking-client";
import type { Logger } from "../ports/logger";
import type { SearchResult } from "../knowledge/search-result";
import type { RecallConfig } from "../common/recall-config";
import { Uri } from "../common/uri";

/**
 * Integration test: GraphExpander + RecallCurator end-to-end.
 * Uses real instances (GraphExpander, RecallCurator) with mocked ports.
 */
function makeConfig(overrides?: Partial<RecallConfig>): RecallConfig {
  return {
    topN: 5,
    scoreThreshold: 0.3,
    maxTokens: 2000,
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

function makeLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    isEnabled: vi.fn().mockReturnValue(true),
  };
}

function content(uri: string, body: string): Content {
  return { uri: new Uri(uri), body, level: "abstract" };
}

describe("GraphExpander + RecallCurator integration", () => {
  it("returns seed items only when expandGraph is disabled", async () => {
    const logger = makeLogger();

    const curator = new RecallCurator(
      makeConfig({ expandGraph: false, maxTokens: 5000 }),
      [relevanceScorer],
      logger,
    );

    const result: SearchResult = {
      memories: [
        { uri: "viking://m1", text: "memory one", abstract: "mem one", score: 0.9 },
      ],
      resources: [],
      skills: [],
      total: 1,
    };

    const curated = await curator.curate(result);
    expect(curated.items).toHaveLength(1);
    expect(curated.items[0].uri).toBe("viking://m1");
    expect(curated.items[0].source).toBe("memory");
  });

  it("appends graph items when expandGraph is enabled and graph has relations", async () => {
    const graphStore: RelationClient = {
      link: vi.fn(),
      unlink: vi.fn(),
      graph: vi.fn().mockResolvedValue([
        { uri: "viking://rel1", reason: "related architecture doc" },
      ]),
    };

    const fsStore: FsClient = {
      read: vi.fn().mockResolvedValue(content("viking://rel1", "Related architecture content here")),
      save: vi.fn(),
      list: vi.fn(),
      tree: vi.fn(),
      stat: vi.fn(),
      mkdir: vi.fn(),
      mv: vi.fn(),
      delete: vi.fn(),
      reindex: vi.fn(),
    };

    const logger = makeLogger();
    const graphExpander = new GraphExpander(
      graphStore,
      fsStore,
      { expandGraphMaxRatio: 0.2, expandGraphMinSeedScore: 0.4 },
      logger,
    );

    const curator = new RecallCurator(
      makeConfig({ expandGraph: true, maxTokens: 5000 }),
      [relevanceScorer],
      logger,
      graphExpander,
    );

    const result: SearchResult = {
      memories: [
        { uri: "viking://seed1", text: "main finding", abstract: "finding", score: 0.85 },
      ],
      resources: [],
      skills: [],
      total: 1,
    };

    const curated = await curator.curate(result);

    // Should have seed + graph item
    const seedItems = curated.items.filter(i => i.source === "memory");
    const graphItems = curated.items.filter(i => i.source === "graph");

    expect(seedItems).toHaveLength(1);
    expect(seedItems[0].uri).toBe("viking://seed1");

    expect(graphItems).toHaveLength(1);
    expect(graphItems[0].uri).toBe("viking://rel1");
    expect(graphItems[0].score).toBeCloseTo(0.85 * 0.8, 3);
  });

  it("handles empty graph gracefully", async () => {
    const graphStore: RelationClient = {
      link: vi.fn(),
      unlink: vi.fn(),
      graph: vi.fn().mockResolvedValue([]),
    };

    const fsStore: FsClient = {
      read: vi.fn(),
      save: vi.fn(),
      list: vi.fn(),
      tree: vi.fn(),
      stat: vi.fn(),
      mkdir: vi.fn(),
      mv: vi.fn(),
      delete: vi.fn(),
      reindex: vi.fn(),
    };

    const logger = makeLogger();
    const graphExpander = new GraphExpander(
      graphStore,
      fsStore,
      { expandGraphMaxRatio: 0.2, expandGraphMinSeedScore: 0.4 },
      logger,
    );

    const curator = new RecallCurator(
      makeConfig({ expandGraph: true, maxTokens: 5000 }),
      [relevanceScorer],
      logger,
      graphExpander,
    );

    const result: SearchResult = {
      memories: [
        { uri: "viking://seed1", text: "standalone", abstract: "standalone", score: 0.8 },
      ],
      resources: [],
      skills: [],
      total: 1,
    };

    const curated = await curator.curate(result);
    expect(curated.items).toHaveLength(1);
    expect(curated.items[0].uri).toBe("viking://seed1");
  });
});
