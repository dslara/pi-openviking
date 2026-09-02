import { describe, it, expect } from "vitest";
import { toSearchResult, toGlobResult, toGrepResult } from "./search-mapper";
import type { OVFindResponse, OVMatchedContext, OVGlobResponse, OVGrepResponse } from "./ov-search";

describe("toSearchResult", () => {
  it("maps full search response with all fields", () => {
    const raw: OVFindResponse = {
      memories: [
        { uri: "viking://mem/1", abstract: "mem abs", score: 0.9, context_type: "memory", level: 1, category: "docs", match_reason: "semantic" },
      ],
      resources: [
        { uri: "viking://res/1", score: 0.8, abstract: "res abs", context_type: "resource", level: 1, category: "", match_reason: "" },
      ],
      skills: [
        { uri: "viking://skill/1", score: 0.7, abstract: "skill abs", context_type: "skill", level: 1, category: "", match_reason: "" },
      ],
      total: 3,
      query_plan: { reasoning: "deep search", queries: [] },
    };

    const result = toSearchResult(raw);
    expect(result.memories).toHaveLength(1);
    expect(result.memories[0].uri).toBe("viking://mem/1");
    expect(result.memories[0].category).toBe("docs");
    // text falls back to abstract since OV doesn't return a text field
    expect(result.memories[0].text).toBe("mem abs");
    expect(result.resources).toHaveLength(1);
    expect(result.resources[0].abstract).toBe("res abs");
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0].uri).toBe("viking://skill/1");
    expect(result.total).toBe(3);
    expect(result.queryPlan).toBe('{"reasoning":"deep search","queries":[]}');
  });

  it("handles empty arrays", () => {
    const raw: OVFindResponse = { memories: [], resources: [], skills: [], total: 0 };
    const result = toSearchResult(raw);
    expect(result.memories).toHaveLength(0);
    expect(result.resources).toHaveLength(0);
    expect(result.skills).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("handles missing optional fields inside items", () => {
    const raw: OVFindResponse = {
      memories: [{ uri: "viking://mem/1", abstract: "has abstract", context_type: "memory", score: 0.5, level: 1, category: "", match_reason: "" }],
      resources: [{ uri: "viking://res/1", score: 0.5, abstract: "", context_type: "resource", level: 1, category: "", match_reason: "" }],
      skills: [],
      total: 1,
    };
    const result = toSearchResult(raw);
    expect(result.memories[0].text).toBe("has abstract");
    expect(result.resources[0].score).toBe(0.5);
  });

  it("handles missing query_plan", () => {
    const raw: OVFindResponse = { memories: [], resources: [], skills: [], total: 0 };
    const result = toSearchResult(raw);
    expect(result.queryPlan).toBeUndefined();
  });

  it("handles query_plan as string", () => {
    const raw: OVFindResponse = {
      memories: [], resources: [], skills: [], total: 0,
      query_plan: "simple plan",
    };
    const result = toSearchResult(raw);
    expect(result.queryPlan).toBe("simple plan");
  });

  it("falls back text to abstract when no text field", () => {
    const raw: OVFindResponse = {
      memories: [{ uri: "viking://mem/1", abstract: "fallback abstract", context_type: "memory", score: 0.5, level: 1, category: "", match_reason: "" }],
      resources: [],
      skills: [],
      total: 1,
    };
    const result = toSearchResult(raw);
    expect(result.memories[0].text).toBe("fallback abstract");
  });

  it("returns empty text when neither text nor abstract present", () => {
    const raw: OVFindResponse = {
      memories: [{ uri: "viking://mem/1", abstract: "", context_type: "memory", score: 0.5, level: 1, category: "", match_reason: "" }],
      resources: [],
      skills: [],
      total: 1,
    };
    const result = toSearchResult(raw);
    expect(result.memories[0].text).toBe("");
  });

  it("extracts contextType from context_type in memories", () => {
    const raw: OVFindResponse = {
      memories: [{ uri: "viking://mem/1", abstract: "mem", context_type: "memory", score: 0.5, level: 1, category: "", match_reason: "" }],
      resources: [], skills: [], total: 1,
    };
    const result = toSearchResult(raw);
    expect(result.memories[0].contextType).toBe("memory");
  });

  it("extracts matchReason from match_reason in memories", () => {
    const raw: OVFindResponse = {
      memories: [{ uri: "viking://mem/1", abstract: "mem", context_type: "memory", score: 0.5, level: 1, category: "", match_reason: "keyword match" }],
      resources: [], skills: [], total: 1,
    };
    const result = toSearchResult(raw);
    expect(result.memories[0].matchReason).toBe("keyword match");
  });

  it("extracts both contextType and matchReason together", () => {
    const raw: OVFindResponse = {
      memories: [{
        uri: "viking://mem/1", abstract: "mem", context_type: "memory", score: 0.5, level: 1, category: "",
        match_reason: "semantic match",
      }],
      resources: [], skills: [], total: 1,
    };
    const result = toSearchResult(raw);
    expect(result.memories[0].contextType).toBe("memory");
    expect(result.memories[0].matchReason).toBe("semantic match");
  });

  it("leaves contextType undefined when context_type absent (empty string)", () => {
    const raw: OVFindResponse = {
      memories: [{ uri: "viking://mem/1", abstract: "mem", context_type: "memory", score: 0.5, level: 1, category: "", match_reason: "" }],
      resources: [], skills: [], total: 1,
    };
    const result = toSearchResult(raw);
    expect(result.memories[0].contextType).toBe("memory");
    expect(result.memories[0].matchReason).toBe("");
  });

  it("leaves matchReason as empty string when absent", () => {
    const raw: OVFindResponse = {
      memories: [{ uri: "viking://mem/1", abstract: "mem", context_type: "memory", score: 0.5, level: 1, category: "", match_reason: "" }],
      resources: [], skills: [], total: 1,
    };
    const result = toSearchResult(raw);
    expect(result.memories[0].matchReason).toBe("");
  });
});

describe("toGlobResult", () => {
  it("maps glob response converting matches→entries and count→total", () => {
    const raw: OVGlobResponse = {
      matches: ["viking://docs/a.md", "viking://docs/b.md"],
      count: 2,
    };
    const result = toGlobResult(raw);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).toBe("viking://docs/a.md");
    expect(result.total).toBe(2);
  });

  it("handles empty matches", () => {
    const raw: OVGlobResponse = { matches: [], count: 0 };
    const result = toGlobResult(raw);
    expect(result.entries).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});

describe("toGrepResult", () => {
  it("maps grep response converting line→line and count→total", () => {
    const raw: OVGrepResponse = {
      matches: [
        { uri: "viking://docs/a.md", line: 15, content: "function foo()" },
        { uri: "viking://docs/a.md", line: 25, content: "function bar()" },
      ],
      count: 2,
    };
    const result = toGrepResult(raw);
    expect(result.matches).toHaveLength(2);
    expect(result.matches[0].line).toBe(15);
    expect(result.matches[0].content).toBe("function foo()");
    expect(result.total).toBe(2);
    expect(result.matches[1].line).toBe(25);
    expect(result.matches[1].content).toBe("function bar()");
  });

  it("handles empty matches", () => {
    const raw: OVGrepResponse = { matches: [], count: 0 };
    const result = toGrepResult(raw);
    expect(result.matches).toHaveLength(0);
  });
});
