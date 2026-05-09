import { describe, test, expect } from "vitest";
import type { SearchResult } from "../src/client";
import { curate, DEFAULT_CURATE_OPTIONS, type CurateOptions } from "../src/recall-curator";

function makeMemory(overrides: Partial<{
  text: string; score: number; uri: string; category: string;
  abstract: string; content: string; overview: string; level: number; modTime: string;
}> = {}) {
  return {
    text: overrides.text ?? "test memory",
    score: overrides.score ?? 0.5,
    uri: overrides.uri ?? "viking://user/memories/test",
    category: overrides.category,
    abstract: overrides.abstract,
    content: overrides.content,
    overview: overrides.overview,
    level: overrides.level,
    modTime: overrides.modTime,
  };
}

function makeResource(overrides: Partial<{
  uri: string; score: number; abstract: string;
}> = {}) {
  return {
    uri: overrides.uri ?? "viking://resources/test",
    score: overrides.score ?? 0.5,
    abstract: overrides.abstract,
  };
}

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    memories: [],
    resources: [],
    skills: [],
    total: 0,
    ...overrides,
  };
}

describe("curate", () => {
  describe("merging", () => {
    test("merges memories and resources into one list", () => {
      const result = curate(
        makeResult({
          memories: [makeMemory({ text: "m1", score: 0.9, uri: "viking://m1" })],
          resources: [makeResource({ uri: "viking://r1", score: 0.8, abstract: "r1" })],
          total: 2,
        }),
        "test query",
      );
      expect(result.length).toBe(2);
      expect(result[0].type).toBe("memory");
      expect(result[1].type).toBe("resource");
    });

    test("returns empty array for empty results", () => {
      const result = curate(makeResult(), "test");
      expect(result).toEqual([]);
    });
  });

  describe("scoring", () => {
    test("sorts by base score descending when no boosts apply", () => {
      const result = curate(
        makeResult({
          memories: [
            makeMemory({ text: "low", score: 0.3, uri: "viking://m1" }),
            makeMemory({ text: "high", score: 0.9, uri: "viking://m2" }),
            makeMemory({ text: "mid", score: 0.6, uri: "viking://m3" }),
          ],
          total: 3,
        }),
        "simple query",
        { ...DEFAULT_CURATE_OPTIONS, scoreThreshold: 0 },
      );
      expect(result.map((i) => i.text)).toEqual(["high", "mid", "low"]);
    });

    test("leaf boost gives higher rank to level=2 items", () => {
      const result = curate(
        makeResult({
          memories: [
            makeMemory({ text: "non-leaf", score: 0.8, uri: "viking://m1", level: 0 }),
            makeMemory({ text: "leaf", score: 0.7, uri: "viking://m2", level: 2 }),
          ],
          total: 2,
        }),
        "simple query",
        { ...DEFAULT_CURATE_OPTIONS, scoreThreshold: 0 },
      );
      // leaf (0.7 + 0.12 boost) > non-leaf (0.8)
      expect(result[0].text).toBe("leaf");
    });

    test("temporal boost gives higher rank to events when query has temporal intent", () => {
      const result = curate(
        makeResult({
          memories: [
            makeMemory({ text: "profile", score: 0.75, uri: "viking://m1", category: "profile" }),
            makeMemory({ text: "event", score: 0.68, uri: "viking://events/e1", category: "events" }),
          ],
          total: 2,
        }),
        "what did I do yesterday",
        { ...DEFAULT_CURATE_OPTIONS, scoreThreshold: 0 },
      );
      // event (0.6 + 0.1 temporal) > profile (0.75)
      expect(result[0].text).toBe("event");
    });

    test("preference boost gives higher rank to preferences when query has preference intent", () => {
      const result = curate(
        makeResult({
          memories: [
            makeMemory({ text: "event", score: 0.8, uri: "viking://m1", category: "events" }),
            makeMemory({ text: "pref", score: 0.7, uri: "viking://preferences/p1", category: "preferences" }),
          ],
          total: 2,
        }),
        "what are my preferences",
        { ...DEFAULT_CURATE_OPTIONS, scoreThreshold: 0 },
      );
      // pref (0.7 + 0.08 preference) > event (0.8)
      expect(result[0].text).toBe("pref");
    });

    test("lexical overlap boost gives higher rank to items with query tokens in abstract", () => {
      const result = curate(
        makeResult({
          memories: [
            makeMemory({ text: "no match", score: 0.5, uri: "viking://m1", abstract: "unrelated content" }),
            makeMemory({ text: "match", score: 0.4, uri: "viking://m2", abstract: "coding patterns and preferences" }),
          ],
          total: 2,
        }),
        "coding preferences",
        { ...DEFAULT_CURATE_OPTIONS, preferAbstract: false, scoreThreshold: 0 },
      );
      // "match" has lexical overlap with "coding preferences" → boost
      expect(result[0].text).toBe("match");
    });
  });

  describe("deduplication", () => {
    test("deduplicates resources by URI", () => {
      const result = curate(
        makeResult({
          resources: [
            makeResource({ uri: "viking://dup", score: 0.9, abstract: "first" }),
            makeResource({ uri: "viking://dup", score: 0.8, abstract: "second" }),
            makeResource({ uri: "viking://unique", score: 0.7, abstract: "unique" }),
          ],
          total: 3,
        }),
        "test",
        { ...DEFAULT_CURATE_OPTIONS, scoreThreshold: 0 },
      );
      expect(result.length).toBe(2);
      expect(result[0].uri).toBe("viking://dup");
    });

    test("deduplicates memories by abstract for non-event categories", () => {
      const result = curate(
        makeResult({
          memories: [
            makeMemory({ text: "t1", score: 0.9, uri: "viking://m1", abstract: "same abstract", category: "profile" }),
            makeMemory({ text: "t2", score: 0.8, uri: "viking://m2", abstract: "same abstract", category: "profile" }),
            makeMemory({ text: "t3", score: 0.7, uri: "viking://m3", abstract: "different", category: "profile" }),
          ],
          total: 3,
        }),
        "test",
        { ...DEFAULT_CURATE_OPTIONS, scoreThreshold: 0 },
      );
      expect(result.length).toBe(2);
    });

    test("deduplicates events by URI (not abstract)", () => {
      const result = curate(
        makeResult({
          memories: [
            makeMemory({ text: "t1", score: 0.9, uri: "viking://events/e1", abstract: "same", category: "events" }),
            makeMemory({ text: "t2", score: 0.8, uri: "viking://events/e2", abstract: "same", category: "events" }),
          ],
          total: 2,
        }),
        "test",
        { ...DEFAULT_CURATE_OPTIONS, scoreThreshold: 0 },
      );
      // Events dedup by URI, not abstract — both survive
      expect(result.length).toBe(2);
    });
  });

  describe("score threshold", () => {
    test("filters items below scoreThreshold", () => {
      const result = curate(
        makeResult({
          memories: [
            makeMemory({ text: "good", score: 0.9, uri: "viking://m1" }),
            makeMemory({ text: "bad", score: 0.1, uri: "viking://m2" }),
          ],
          total: 2,
        }),
        "test",
        { ...DEFAULT_CURATE_OPTIONS, scoreThreshold: 0.5 },
      );
      expect(result.length).toBe(1);
      expect(result[0].text).toBe("good");
    });

    test("default threshold is 0.15", () => {
      expect(DEFAULT_CURATE_OPTIONS.scoreThreshold).toBe(0.15);
    });
  });

  describe("topN limit", () => {
    test("respects topN option", () => {
      const result = curate(
        makeResult({
          memories: Array.from({ length: 10 }, (_, i) =>
            makeMemory({ text: `m${i}`, score: 0.9 - i * 0.01, uri: `viking://m${i}` })
          ),
          total: 10,
        }),
        "test",
        { ...DEFAULT_CURATE_OPTIONS, topN: 3, scoreThreshold: 0 },
      );
      expect(result.length).toBe(3);
    });
  });

  describe("content truncation", () => {
    test("truncates text to maxContentChars", () => {
      const longText = "a".repeat(1000);
      const result = curate(
        makeResult({
          memories: [makeMemory({ text: longText, score: 0.9, uri: "viking://m1" })],
          total: 1,
        }),
        "test",
        { ...DEFAULT_CURATE_OPTIONS, maxContentChars: 100, scoreThreshold: 0 },
      );
      expect(result[0].text.length).toBeLessThanOrEqual(103); // 100 + "..."
    });

    test("prefers abstract over content when preferAbstract is true", () => {
      const result = curate(
        makeResult({
          memories: [makeMemory({
            text: "full content",
            score: 0.9,
            uri: "viking://m1",
            abstract: "short abstract",
            content: "long content that should be ignored",
          })],
          total: 1,
        }),
        "test",
        { ...DEFAULT_CURATE_OPTIONS, preferAbstract: true, scoreThreshold: 0 },
      );
      expect(result[0].text).toBe("short abstract");
    });

    test("uses content when preferAbstract is false or no abstract", () => {
      const result = curate(
        makeResult({
          memories: [makeMemory({
            text: "text content",
            score: 0.9,
            uri: "viking://m1",
            abstract: "short abstract",
            content: "full content",
          })],
          total: 1,
        }),
        "test",
        { ...DEFAULT_CURATE_OPTIONS, preferAbstract: false, scoreThreshold: 0 },
      );
      expect(result[0].text).toBe("full content");
    });
  });

  describe("token budget", () => {
    test("trims items from bottom to stay under budget", () => {
      const items = Array.from({ length: 5 }, (_, i) =>
        makeMemory({ text: `item-${i}-` + "a".repeat(400), score: 0.9 - i * 0.01, uri: `viking://m${i}` })
      );
      const result = curate(
        makeResult({ memories: items, total: 5 }),
        "test",
        { ...DEFAULT_CURATE_OPTIONS, maxTokens: 200, maxContentChars: 1000, topN: 5, scoreThreshold: 0 },
      );
      expect(result.length).toBeLessThan(5);
      // First item (highest score) should survive
      expect(result[0].text).toContain("item-0");
    });

    test("returns empty when even one item exceeds budget", () => {
      const result = curate(
        makeResult({
          memories: [makeMemory({ text: "a".repeat(10000), score: 0.9, uri: "viking://m1" })],
          total: 1,
        }),
        "test",
        { ...DEFAULT_CURATE_OPTIONS, maxTokens: 10, maxContentChars: 100000, scoreThreshold: 0 },
      );
      expect(result).toEqual([]);
    });
  });

  describe("leaf preference", () => {
    test("fills with leaves first, then supplements with non-leaves", () => {
      const result = curate(
        makeResult({
          memories: [
            makeMemory({ text: "non-leaf-1", score: 0.95, uri: "viking://m1", level: 0 }),
            makeMemory({ text: "non-leaf-2", score: 0.93, uri: "viking://m2", level: 0 }),
            makeMemory({ text: "leaf-1", score: 0.9, uri: "viking://m3", level: 2 }),
            makeMemory({ text: "leaf-2", score: 0.88, uri: "viking://m4", level: 2 }),
            makeMemory({ text: "non-leaf-3", score: 0.85, uri: "viking://m5", level: 0 }),
          ],
          total: 5,
        }),
        "test",
        { ...DEFAULT_CURATE_OPTIONS, topN: 4, scoreThreshold: 0 },
      );
      // Leaves first (leaf-1, leaf-2), then fill with highest non-leaves
      const texts = result.map((i) => i.text);
      expect(texts).toContain("leaf-1");
      expect(texts).toContain("leaf-2");
    });
  });
});
