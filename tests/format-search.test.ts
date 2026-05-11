import { describe, test, expect } from "vitest";
import { formatSearch } from "../src/shared/format-search";
import type { SearchResult } from "../src/ov-client/client";

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    memories: [],
    resources: [],
    skills: [],
    total: 0,
    ...overrides,
  };
}

describe("formatSearch", () => {
  test("formats empty results", () => {
    const result = formatSearch(makeResult(), "auth");
    expect(result).toContain('OpenViking search: "auth"');
    expect(result).toContain("Total: 0");
    expect(result).toContain("No results found.");
  });

  test("formats single memory", () => {
    const r = makeResult({
      total: 1,
      memories: [{ text: "memory one", score: 0.95, uri: "viking://user/memories/m1" }],
    });
    const result = formatSearch(r, "hello");
    expect(result).toContain("Memories:");
    expect(result).toContain("[0.95] viking://user/memories/m1");
    expect(result).toContain("memory one");
  });

  test("formats resources with abstracts", () => {
    const r = makeResult({
      total: 1,
      resources: [{ uri: "viking://docs/one", score: 0.85, abstract: "doc one" }],
    });
    const result = formatSearch(r, "docs");
    expect(result).toContain("Resources:");
    expect(result).toContain("[0.85] viking://docs/one");
    expect(result).toContain("doc one");
  });

  test("formats skills", () => {
    const r = makeResult({
      total: 1,
      skills: [{ uri: "viking://agent/skills/s1", score: 0.9, abstract: "skill one" }],
    });
    const result = formatSearch(r, "skill");
    expect(result).toContain("Skills:");
    expect(result).toContain("[0.90] viking://agent/skills/s1");
  });

  test("truncates long abstracts", () => {
    const long = "a".repeat(300);
    const r = makeResult({
      total: 1,
      resources: [{ uri: "viking://docs/long", score: 0.8, abstract: long }],
    });
    const result = formatSearch(r, "long");
    expect(result).toContain("a".repeat(200) + "…");
    expect(result).not.toContain("a".repeat(201));
  });

  test("shows all sections when mixed", () => {
    const r = makeResult({
      total: 3,
      memories: [{ text: "m1", score: 0.9, uri: "viking://m1" }],
      resources: [{ uri: "viking://r1", score: 0.8, abstract: "r1" }],
      skills: [{ uri: "viking://s1", score: 0.7, abstract: "s1" }],
    });
    const result = formatSearch(r, "mix");
    expect(result).toContain("Memories:");
    expect(result).toContain("Resources:");
    expect(result).toContain("Skills:");
    expect(result).toContain("Total: 3");
  });
});
