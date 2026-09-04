import { describe, it, expect } from "vitest";
import type { OVMatchedContext, OVFindResponse, OVFindRequest, OVSearchRequest, OVQueryPlan, OVQueryPlanQuery } from "./ov-search";

describe("OVMatchedContext", () => {
  it("creates OVMatchedContext with required fields", () => {
    const m: OVMatchedContext = {
      context_type: "memory",
      uri: "viking://mem/1",
      level: 2,
      score: 0.95,
      category: "docs",
      match_reason: "semantic",
      abstract: "A memory",
    };
    expect(m.context_type).toBe("memory");
    expect(m.uri).toBe("viking://mem/1");
    expect(m.level).toBe(2);
    expect(m.score).toBe(0.95);
  });

  it("includes optional overview and relations", () => {
    const m: OVMatchedContext = {
      context_type: "resource",
      uri: "viking://resources/doc.md",
      level: 1,
      score: 0.85,
      category: "documentation",
      match_reason: "keyword match",
      abstract: "Some doc",
      overview: "Full overview content",
      relations: [
        { relation: "references", uri: "viking://resources/other.md" },
      ],
    };
    expect(m.category).toBe("documentation");
    expect(m.match_reason).toBe("keyword match");
    expect(m.abstract).toBe("Some doc");
    expect(m.overview).toBe("Full overview content");
    expect(m.relations).toHaveLength(1);
    expect(m.relations![0].relation).toBe("references");
  });

  it("accepts skill context type", () => {
    const m: OVMatchedContext = {
      context_type: "skill",
      uri: "viking://skills/x",
      level: 0,
      score: 0.5,
      category: "",
      match_reason: "",
      abstract: "a skill",
    };
    expect(m.context_type).toBe("skill");
  });

  it("allows overview to be null", () => {
    const m: OVMatchedContext = {
      context_type: "memory",
      uri: "viking://mem/1",
      level: 2,
      score: 0.5,
      category: "",
      match_reason: "",
      abstract: "mem",
      overview: null,
    };
    expect(m.overview).toBeNull();
  });
});

describe("OVFindResponse", () => {
  it("creates full OVFindResponse", () => {
    const resp: OVFindResponse = {
      memories: [{ context_type: "memory", uri: "viking://mem/1", level: 2, score: 0.9, category: "", match_reason: "", abstract: "mem" }],
      resources: [{ context_type: "resource", uri: "viking://res/1", level: 1, score: 0.8, category: "", match_reason: "", abstract: "Res" }],
      skills: [{ context_type: "skill", uri: "viking://skill/1", level: 0, score: 0.7, category: "", match_reason: "", abstract: "skill" }],
      total: 3,
      query_plan: { reasoning: "simple find", queries: [{ query: "test", context_type: "resource", intent: "find docs", priority: 1 }] },
    };
    expect(resp.memories).toHaveLength(1);
    expect(resp.resources).toHaveLength(1);
    expect(resp.skills).toHaveLength(1);
    expect(resp.total).toBe(3);
    expect(resp.query_plan).toBeDefined();
  });

  it("handles empty results", () => {
    const resp: OVFindResponse = { memories: [], resources: [], skills: [], total: 0 };
    expect(resp.total).toBe(0);
    expect(resp.query_plan).toBeUndefined();
  });

  it("allows query_plan as string", () => {
    const resp: OVFindResponse = {
      memories: [], resources: [], skills: [], total: 0,
      query_plan: "simple plan",
    };
    expect(resp.query_plan).toBe("simple plan");
  });
});

describe("OVFindRequest", () => {
  it("creates minimal OVFindRequest", () => {
    const req: OVFindRequest = { query: "test search" };
    expect(req.query).toBe("test search");
  });

  it("includes all optional fields", () => {
    const req: OVFindRequest = {
      query: "test",
      target_uri: ["viking://resources/", "viking://docs/"],
      node_limit: 10,
      score_threshold: 0.5,
      since: "2026-01-01T00:00:00Z",
      until: "2026-06-01T00:00:00Z",
      time_field: "updated_at",
      level: "2",
      filter: { category: "docs" },
      include_provenance: true,
      peer_id: "peer-1",
      telemetry: true,
    };
    expect(req.target_uri).toEqual(["viking://resources/", "viking://docs/"]);
    expect(req.node_limit).toBe(10);
    expect(req.score_threshold).toBe(0.5);
    expect(req.since).toBeDefined();
    expect(req.until).toBeDefined();
    expect(req.time_field).toBe("updated_at");
    expect(req.level).toBe("2");
    expect(req.filter).toEqual({ category: "docs" });
    expect(req.include_provenance).toBe(true);
    expect(req.peer_id).toBe("peer-1");
    expect(req.telemetry).toBe(true);
  });

  it("accepts target_uri as string", () => {
    const req: OVFindRequest = {
      query: "test",
      target_uri: "viking://resources/",
    };
    expect(req.target_uri).toBe("viking://resources/");
  });
});

describe("OVSearchRequest", () => {
  it("extends OVFindRequest with session_id", () => {
    const req: OVSearchRequest = {
      query: "deep search",
      session_id: "sess-1",
    };
    expect(req.query).toBe("deep search");
    expect(req.session_id).toBe("sess-1");
  });

  it("includes all find fields plus session_id", () => {
    const req: OVSearchRequest = {
      query: "deep",
      session_id: "sess-42",
      target_uri: "viking://mem/",
      node_limit: 20,
      score_threshold: 0.3,
      include_provenance: true,
    };
    expect(req.session_id).toBe("sess-42");
    expect(req.target_uri).toBe("viking://mem/");
    expect(req.node_limit).toBe(20);
    expect(req.score_threshold).toBe(0.3);
    expect(req.include_provenance).toBe(true);
  });
});
