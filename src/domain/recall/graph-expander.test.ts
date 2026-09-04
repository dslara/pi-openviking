import { describe, it, expect, vi } from "vitest";
import { GraphExpander } from "./graph-expander";
import type { RelationClient, FsClient } from "../client/open-viking-client";
import type { ContentLevel } from "../common/content-level";
import type { Logger } from "../ports/logger";
import type { CuratedItem } from "./curate";
import { Uri } from "../common/uri";

function makeConfig(overrides?: Partial<{ expandGraphMaxRatio: number; expandGraphMinSeedScore: number }>) {
  return {
    expandGraphMaxRatio: 0.2,
    expandGraphMinSeedScore: 0.4,
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

class MockGraphStore implements RelationClient {
  link = vi.fn();
  unlink = vi.fn();
  graph = vi.fn();
}

class MockFsStore implements FsClient {
  read = vi.fn();
  save = vi.fn();
  mkdir = vi.fn();
  mv = vi.fn();
  list = vi.fn();
  tree = vi.fn();
  stat = vi.fn();
  delete = vi.fn();
  reindex = vi.fn();
}

function makegraphStore(): RelationClient {
  return new MockGraphStore();
}

function makefsStore(): FsClient {
  return new MockFsStore();
}

function seed(uri: string, score: number): CuratedItem {
  return { uri, text: `content ${uri}`, score, source: "memory" };
}

function content(uri: string, body: string): { uri: Uri; body: string; level: ContentLevel } {
  return { uri: new Uri(uri), body, level: "abstract" as ContentLevel };
}

describe("GraphExpander", () => {
  it("returns empty when seeds array is empty", async () => {
    const expander = new GraphExpander(
      makegraphStore(),
      makefsStore(),
      makeConfig(),
      makeLogger(),
    );

    const result = await expander.expand([], { remaining: 1000, original: 4000 });

    expect(result).toEqual([]);
  });

  it("returns empty when no seeds meet minSeedScore", async () => {
    const seeds: CuratedItem[] = [
      seed("viking://a", 0.2),
      seed("viking://b", 0.1),
    ];

    const expander = new GraphExpander(
      makegraphStore(),
      makefsStore(),
      makeConfig({ expandGraphMinSeedScore: 0.4 }),
      makeLogger(),
    );

    const result = await expander.expand(seeds, { remaining: 1000, original: 4000 });

    expect(result).toEqual([]);
  });

  it("returns graph items for qualified seeds with decayed scores", async () => {
    const seeds: CuratedItem[] = [
      seed("viking://seed1", 0.9),
    ];

    const mockGraphStore = makegraphStore();
    vi.mocked(mockGraphStore.graph).mockResolvedValue([
      { uri: "viking://rel1", reason: "related topic" },
    ]);

    const mockFsStore = makefsStore();
    vi.mocked(mockFsStore.read).mockResolvedValue(
      content("viking://rel1", "abstract text for rel1"),
    );

    const expander = new GraphExpander(
      mockGraphStore,
      mockFsStore,
      makeConfig(),
      makeLogger(),
    );

    const result = await expander.expand(seeds, { remaining: 1000, original: 4000 });

    expect(result).toHaveLength(1);
    expect(result[0].uri).toBe("viking://rel1");
    expect(result[0].text).toBe("abstract text for rel1");
    expect(result[0].score).toBeCloseTo(0.9 * 0.8, 3);
    expect(result[0].source).toBe("graph");
  });

  it("skips relation URIs that already exist in qualified seeds", async () => {
    const seeds: CuratedItem[] = [
      seed("viking://seed1", 0.9),
      seed("viking://rel1", 0.8), // rel1 is both a seed and a relation target
    ];

    const mockGraphStore = makegraphStore();
    vi.mocked(mockGraphStore.graph).mockResolvedValue([
      { uri: "viking://rel1", reason: "duplicate target" },
      { uri: "viking://rel2", reason: "unique target" },
    ]);

    const mockFsStore = makefsStore();
    vi.mocked(mockFsStore.read).mockResolvedValue(
      content("viking://rel2", "only this gets read"),
    );

    const expander = new GraphExpander(
      mockGraphStore,
      mockFsStore,
      makeConfig(),
      makeLogger(),
    );

    const result = await expander.expand(seeds, { remaining: 1000, original: 4000 });

    expect(result).toHaveLength(1);
    expect(result[0].uri).toBe("viking://rel2");
  });

  it("respects graph budget from expandGraphMaxRatio", async () => {
    const seeds: CuratedItem[] = [
      seed("viking://seed1", 0.9),
    ];

    const mockGraphStore = makegraphStore();
    vi.mocked(mockGraphStore.graph).mockResolvedValue([
      { uri: "viking://rel1", reason: "short" },
      { uri: "viking://rel2", reason: "also short" },
    ]);

    const mockFsStore = makefsStore();
    // Each read returns enough content to exceed a tiny budget
    vi.mocked(mockFsStore.read).mockResolvedValue(
      content("viking://rel1", "a"),
    );
    // Mock second call for rel2
    vi.mocked(mockFsStore.read).mockResolvedValueOnce(
      content("viking://rel1", "a"),
    ).mockResolvedValueOnce(
      content("viking://rel2", "b"),
    );

    // maxRatio=0.01, original=4000 → graphBudget=40, too small for 2 items (60+ each)
    const expander = new GraphExpander(
      mockGraphStore,
      mockFsStore,
      makeConfig({ expandGraphMaxRatio: 0.01 }),
      makeLogger(),
    );

    const result = await expander.expand(seeds, { remaining: 1000, original: 4000 });

    // Budget 40 tokens, each item needs 60+ (40 + overhead)
    // Only first item fits per "always add at least one" rule
    // Actually our implementation doesn't have "always add at least one"
    // It checks budget guard after items.length > 0
    // So if item 1 costs > budget and no items yet, it's added anyway
    // Then item 2 is skipped
    expect(result).toHaveLength(1);
  });

  it("prioritizes relations with longer reason when budget is tight", async () => {
    const seeds: CuratedItem[] = [
      seed("viking://seed1", 0.9),
    ];

    const mockGraphStore = makegraphStore();
    vi.mocked(mockGraphStore.graph).mockResolvedValue([
      { uri: "viking://short", reason: "x" },
      { uri: "viking://long", reason: "this is a much longer reason string" },
    ]);

    const mockFsStore = makefsStore();
    vi.mocked(mockFsStore.read)
      .mockResolvedValueOnce(content("viking://short", "short content"))
      .mockResolvedValueOnce(content("viking://long", "longer content that matters"));

    // maxRatio=0.001 so only 1 item fits
    const expander = new GraphExpander(
      mockGraphStore,
      mockFsStore,
      makeConfig({ expandGraphMaxRatio: 0.001 }),
      makeLogger(),
    );

    const result = await expander.expand(seeds, { remaining: 1000, original: 4000 });

    // Longer reason should be first in candidates after sort
    expect(result).toHaveLength(1);
    expect(result[0].uri).toBe("viking://long");
  });
});
