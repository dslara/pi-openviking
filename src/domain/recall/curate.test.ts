import { describe, it, expect } from "vitest";
import { curate, estimateTokens, relevanceScorer, temporalScorer } from "./curate";
import type { CuratedItem } from "./curate";
import type { SearchResult } from "../knowledge/search-result";

describe("estimateTokens", () => {
  it("returns ~ text.length / 4", () => {
    expect(estimateTokens("hello world")).toBe(3); // 11/4 = 2.75 → 3
    expect(estimateTokens("a")).toBe(1);
    expect(estimateTokens("")).toBe(0);
  });
});

describe("curate", () => {
  const emptyResult: SearchResult = {
    memories: [],
    resources: [],
    skills: [],
    total: 0,
  };

  const sampleResult: SearchResult = {
    memories: [
      { uri: "viking://a", text: "AAA", abstract: "aaa", score: 0.9, category: "docs" },
      { uri: "viking://b", text: "BBB", abstract: "bbb", score: 0.5 },
      { uri: "viking://c", text: "CCC", abstract: "ccc", score: 0.3 },
    ],
    resources: [
      { uri: "viking://r1", score: 0.8, abstract: "resource one" },
    ],
    skills: [],
    total: 4,
  };

  it("returns empty arrays and zero tokens for empty result", () => {
    const result = curate(emptyResult, { topN: 5, scoreThreshold: 0, maxTokens: 1000 });
    expect(result.items).toHaveLength(0);
    expect(result.tokens).toBe(0);
    expect(result.dropped).toBe(0);
  });

  it("merge memories + resources into CuratedItems", () => {
    const result = curate(sampleResult, { topN: 5, scoreThreshold: 0, maxTokens: 10000 });
    // All 4 items should pass (0 threshold, topN=5, huge budget)
    expect(result.items).toHaveLength(4);
    // Items sorted by score desc: a(0.9 mem), r1(0.8 res), b(0.5 mem), c(0.3 mem)
    expect(result.items[0].source).toBe("memory");
    expect(result.items[1].source).toBe("resource");
  });

  it("sorts items by score descending", () => {
    const result = curate(sampleResult, { topN: 5, scoreThreshold: 0, maxTokens: 10000 });
    for (let i = 1; i < result.items.length; i++) {
      expect(result.items[i].score).toBeLessThanOrEqual(result.items[i - 1].score);
    }
  });

  it("deduplicates items by URI", () => {
    const dupResult: SearchResult = {
      ...sampleResult,
      resources: [
        { uri: "viking://a", score: 0.8, abstract: "duplicate" },
      ],
    };
    const result = curate(dupResult, { topN: 5, scoreThreshold: 0, maxTokens: 10000 });
    // Merge: a(mem), b, c, a(res). Dedup keeps first occurrence = 3 unique items
    expect(result.items).toHaveLength(3);
    // The memory version (score 0.9) wins because it comes first in merge
    const itemA = result.items.find(i => i.uri === "viking://a");
    expect(itemA?.score).toBe(0.9);
    expect(itemA?.source).toBe("memory");
  });

  it("threshold filter excludes items below score", () => {
    const result = curate(sampleResult, { topN: 5, scoreThreshold: 0.6, maxTokens: 10000 });
    // Only items with score >= 0.6: a (0.9), r1 (0.8)
    expect(result.items).toHaveLength(2);
    expect(result.items[0].uri).toBe("viking://a");
    expect(result.items[1].uri).toBe("viking://r1");
  });

  it("topN limits result count", () => {
    const result = curate(sampleResult, { topN: 2, scoreThreshold: 0, maxTokens: 10000 });
    expect(result.items).toHaveLength(2);
  });

  it("budget trim stops when tokens exceed maxTokens", () => {
    // Each item has ~ overhead of 130 + itemTokens + 60
    // With maxTokens=200, only the first small item should fit
    const result = curate(sampleResult, { topN: 5, scoreThreshold: 0, maxTokens: 200 });
    expect(result.items.length).toBeLessThanOrEqual(1);
    expect(result.tokens).toBeGreaterThan(0);
    expect(result.tokens).toBeLessThanOrEqual(200);
  });

  it("dropped counts items excluded by threshold/topN/budget", () => {
    // total merged = 4 items, threshold 0.6 leaves 2 (a, r1), topN=5 keeps 2, budget=200 allows ~1
    // dropped = 4 - trimmed_length
    const result = curate(sampleResult, { topN: 5, scoreThreshold: 0.6, maxTokens: 200 });
    expect(result.dropped).toBe(4 - result.items.length);
    expect(result.dropped).toBeGreaterThan(0);
  });

  it("CuratedItem uses abstract text when available", () => {
    const result = curate(sampleResult, { topN: 5, scoreThreshold: 0, maxTokens: 10000 });
    const itemA = result.items.find(i => i.uri === "viking://a");
    expect(itemA?.text).toBe("aaa"); // abstract, not raw text
  });

  it("CuratedItem falls back to text when no abstract", () => {
    const noAbstractResult: SearchResult = {
      memories: [
        { uri: "viking://noabs", text: "fallback text" },
      ],
      resources: [],
      skills: [],
      total: 1,
    };
    const result = curate(noAbstractResult, { topN: 5, scoreThreshold: 0, maxTokens: 10000 });
    expect(result.items[0].text).toBe("fallback text");
  });
});

describe("relevanceScorer", () => {
  const makeItem = (text: string): CuratedItem => ({
    uri: "viking://test",
    text,
    score: 0.5,
    source: "memory",
  });

  it("returns higher score when more query terms match", () => {
    const item = makeItem("JWT authentication uses HS256 signing");
    const low = relevanceScorer(item, "jwt oauth"); // 1/2 match
    const high = relevanceScorer(item, "jwt authentication"); // 2/2 match
    expect(high).toBeGreaterThan(low);
  });

  it("returns zero when no terms match", () => {
    const item = makeItem("database migration schema");
    expect(relevanceScorer(item, "jwt authentication")).toBe(0);
  });

  it("returns zero for empty query", () => {
    const item = makeItem("anything here");
    expect(relevanceScorer(item, "")).toBe(0);
  });

  it("matches case-insensitively", () => {
    const item = makeItem("JWT Authentication");
    expect(relevanceScorer(item, "jwt authentication")).toBe(
      relevanceScorer(item, "JWT AUTHENTICATION"),
    );
  });
});

describe("curate with scorers", () => {
  const sampleResult: SearchResult = {
    memories: [
      { uri: "viking://a", text: "JWT authentication token signing", score: 0.5, modTime: new Date().toISOString() },
      { uri: "viking://b", text: "database migration schema", score: 0.8 },
    ],
    resources: [],
    skills: [],
    total: 2,
  };

  it("curate() without scorers behaves identically to before", () => {
    const result = curate(sampleResult, { topN: 5, scoreThreshold: 0, maxTokens: 10000 });
    // Sorted by base score: b(0.8), a(0.5)
    expect(result.items[0].uri).toBe("viking://b");
    expect(result.items[1].uri).toBe("viking://a");
  });

  it("curate() with scorers sums scores and re-sorts", () => {
    // relevanceScorer gives a bonus for "jwt" matching item a
    // item a: 0.5 + relevance("jwt") > 0.8, so a should sort first
    const result = curate(sampleResult, {
      topN: 5,
      scoreThreshold: 0,
      maxTokens: 10000,
      scorers: [relevanceScorer],
      query: "jwt",
    });
    expect(result.items[0].uri).toBe("viking://a");
  });

  it("multiple scorers stack additively", () => {
    const result = curate(sampleResult, {
      topN: 5,
      scoreThreshold: 0,
      maxTokens: 10000,
      scorers: [relevanceScorer, temporalScorer],
      query: "jwt",
    });
    // a gets: 0.5 + relevance("jwt") + temporal(modTime=now)
    // b gets: 0.8 + 0 + 0 (no modTime)
    expect(result.items[0].uri).toBe("viking://a");
    const itemA = result.items.find(i => i.uri === "viking://a")!;
    const itemB = result.items.find(i => i.uri === "viking://b")!;
    expect(itemA.score).toBeGreaterThan(itemB.score);
  });

  it("curate() with scorers and threshold still filters", () => {
    const result = curate(sampleResult, {
      topN: 5,
      scoreThreshold: 10, // impossibly high
      maxTokens: 10000,
      scorers: [relevanceScorer],
      query: "jwt",
    });
    expect(result.items).toHaveLength(0);
  });

  it("edge: empty scorers array = no change", () => {
    const withEmpty = curate(sampleResult, {
      topN: 5,
      scoreThreshold: 0,
      maxTokens: 10000,
      scorers: [],
      query: "jwt",
    });
    const without = curate(sampleResult, { topN: 5, scoreThreshold: 0, maxTokens: 10000 });
    expect(withEmpty.items.map(i => i.uri)).toEqual(without.items.map(i => i.uri));
  });
});

describe("temporalScorer", () => {
  const makeItem = (modTime?: string): CuratedItem => ({
    uri: "viking://test",
    text: "test",
    score: 0.5,
    source: "memory",
    modTime,
  });

  it("returns zero when item has no modTime", () => {
    const item = makeItem();
    expect(temporalScorer(item, "query")).toBe(0);
  });

  it("returns higher score for recent items", () => {
    const now = new Date().toISOString();
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const fresh = temporalScorer(makeItem(now), "query");
    const stale = temporalScorer(makeItem(weekAgo), "query");
    expect(fresh).toBeGreaterThan(stale);
  });

  it("decays toward zero for old items", () => {
    const yearAgo = new Date(Date.now() - 365 * 86400000).toISOString();
    const result = temporalScorer(makeItem(yearAgo), "query");
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(0.05);
  });
});
