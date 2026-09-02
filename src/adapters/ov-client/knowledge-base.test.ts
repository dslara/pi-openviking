import { describe, it, expect, vi } from "vitest";
import { KnowledgeBaseAdapter } from "./knowledge-base";
import { Uri } from "../../domain/common/uri";
import { SessionId } from "../../domain/common/session-id";
import type { Transport } from "./transport";
import type { FindQuery, SearchRequest, SearchOptions } from "../../domain/common/search-query";

function mockTransport(): Transport {
  return {
    request: vi.fn(),
  } as unknown as Transport;
}

describe("KnowledgeBaseAdapter.find", () => {
  it("calls POST /api/v1/search/find with query body", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      memories: [],
      resources: [],
      skills: [],
      total: 0,
    });

    const kb = new KnowledgeBaseAdapter(transport);
    const query: FindQuery = { query: "architecture" };
    await kb.find(query);

    const [label, path, opts] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(label).toBe("KnowledgeBase.find");
    expect(path).toBe("/api/v1/search/find");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body);
    expect(body.query).toBe("architecture");
  });

  it("includes limit when provided", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      memories: [], resources: [], skills: [], total: 0,
    });

    const kb = new KnowledgeBaseAdapter(transport);
    await kb.find({ query: "test", limit: 5 });

    const [, , opts] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.node_limit).toBe(5);
  });

  it("includes peer_id when peerId provided", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      memories: [], resources: [], skills: [], total: 0,
    });

    const kb = new KnowledgeBaseAdapter(transport);
    await kb.find({ query: "test", peerId: "peer-456" });

    const [, , opts] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.peer_id).toBe("peer-456");
  });

  it("includes target_uri when targetUri provided", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      memories: [], resources: [], skills: [], total: 0,
    });

    const kb = new KnowledgeBaseAdapter(transport);
    await kb.find({ query: "test", targetUri: new Uri("viking://docs/") });

    const [, , opts] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.target_uri).toBe("viking://docs/");
  });

  it("passes SearchOptions fields when provided", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      memories: [], resources: [], skills: [], total: 0,
    });

    const kb = new KnowledgeBaseAdapter(transport);
    const opts: SearchOptions = {
      scoreThreshold: 0.5,
      since: "2026-01-01T00:00:00Z",
      until: "2026-06-01T00:00:00Z",
      timeField: "modTime",
      level: 2,
      includeProvenance: true,
    };
    await kb.find({ query: "test" }, opts);

    const [, , optsReq] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(optsReq.body);
    expect(body.score_threshold).toBe(0.5);
    expect(body.since).toBe("2026-01-01T00:00:00Z");
    expect(body.until).toBe("2026-06-01T00:00:00Z");
    expect(body.time_field).toBe("modTime");
    expect(body.level).toBe(2);
    expect(body.include_provenance).toBe(true);
  });

  it("omits SearchOptions fields when undefined", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      memories: [], resources: [], skills: [], total: 0,
    });

    const kb = new KnowledgeBaseAdapter(transport);
    await kb.find({ query: "test" });

    const [, , optsReq] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(optsReq.body);
    expect(body.score_threshold).toBeUndefined();
    expect(body.since).toBeUndefined();
    expect(body.until).toBeUndefined();
    expect(body.time_field).toBeUndefined();
    expect(body.level).toBeUndefined();
    expect(body.include_provenance).toBeUndefined();
  });

  it("maps response via SearchResult", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      memories: [{ uri: "viking://mem/1", abstract: "found it", context_type: "memory", score: 0.5, level: 1, category: "", match_reason: "" }],
      resources: [],
      skills: [],
      total: 1,
    });

    const kb = new KnowledgeBaseAdapter(transport);
    const result = await kb.find({ query: "test" });
    expect(result.total).toBe(1);
    expect(result.memories[0].text).toBe("found it");
  });
});

describe("KnowledgeBaseAdapter.search", () => {
  it("calls POST /api/v1/search/search with query", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      memories: [], resources: [], skills: [], total: 0,
    });

    const kb = new KnowledgeBaseAdapter(transport);
    const req: SearchRequest = { query: "deep search" };
    await kb.search(req);

    const [label, path, opts] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(label).toBe("KnowledgeBase.search");
    expect(path).toBe("/api/v1/search/search");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body);
    expect(body.query).toBe("deep search");
  });

  it("includes session_id when sessionId provided", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      memories: [], resources: [], skills: [], total: 0,
    });

    const kb = new KnowledgeBaseAdapter(transport);
    await kb.search({ query: "test", sessionId: new SessionId("sess-123") });

    const [, , opts] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.session_id).toBe("sess-123");
  });

  it("includes peer_id when peerId provided", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      memories: [], resources: [], skills: [], total: 0,
    });

    const kb = new KnowledgeBaseAdapter(transport);
    await kb.search({ query: "test", peerId: "peer-789" });

    const [, , opts] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.peer_id).toBe("peer-789");
  });

  it("includes target_uri and limit when provided", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      memories: [], resources: [], skills: [], total: 0,
    });

    const kb = new KnowledgeBaseAdapter(transport);
    await kb.search({
      query: "test",
      limit: 10,
      targetUri: new Uri("viking://docs/"),
    });

    const [, , opts] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.node_limit).toBe(10);
    expect(body.target_uri).toBe("viking://docs/");
  });

  it("omits session_id when not provided", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      memories: [], resources: [], skills: [], total: 0,
    });

    const kb = new KnowledgeBaseAdapter(transport);
    await kb.search({ query: "test" });

    const [, , opts] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.session_id).toBeUndefined();
  });

  it("passes SearchOptions with search", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      memories: [], resources: [], skills: [], total: 0,
    });

    const kb = new KnowledgeBaseAdapter(transport);
    const opts: SearchOptions = {
      scoreThreshold: 0.7,
      includeProvenance: true,
    };
    await kb.search({ query: "deep" }, opts);

    const [, , reqOpts] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(reqOpts.body);
    expect(body.score_threshold).toBe(0.7);
    expect(body.include_provenance).toBe(true);
  });
});

describe("KnowledgeBaseAdapter.glob", () => {
  it("calls POST /api/v1/search/glob with pattern", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      matches: ["viking://docs/a.md", "viking://docs/b.md"],
      count: 2,
    });

    const kb = new KnowledgeBaseAdapter(transport);
    const result = await kb.glob("**/*.md");

    const [label, path, opts] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(label).toBe("KnowledgeBase.glob");
    expect(path).toBe("/api/v1/search/glob");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body);
    expect(body.pattern).toBe("**/*.md");
    expect(result.entries).toHaveLength(2);
  });

  it("includes uri and limit when provided", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      matches: [], count: 0,
    });

    const kb = new KnowledgeBaseAdapter(transport);
    await kb.glob("*.ts", "viking://src/", 50);

    const [, , opts] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.uri).toBe("viking://src/");
    expect(body.node_limit).toBe(50);
  });
});

describe("KnowledgeBaseAdapter.grep", () => {
  it("calls POST /api/v1/search/grep with pattern and uri", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      matches: [{ uri: "viking://src/a.ts", line: 5, content: "import" }],
      count: 1,
    });

    const kb = new KnowledgeBaseAdapter(transport);
    const result = await kb.grep("import", { uri: "viking://src/" });

    const [label, path, opts] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(label).toBe("KnowledgeBase.grep");
    expect(path).toBe("/api/v1/search/grep");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body);
    expect(body.pattern).toBe("import");
    expect(body.uri).toBe("viking://src/");
    expect(result.matches).toHaveLength(1);
  });

  it("passes uri and all filter opts", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      matches: [], count: 0,
    });

    const kb = new KnowledgeBaseAdapter(transport);
    await kb.grep("function", {
      uri: "viking://src/",
      caseInsensitive: true,
      excludeUri: "viking://node_modules/",
      levelLimit: 3,
      nodeLimit: 100,
    });

    const [, , opts] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.uri).toBe("viking://src/");
    expect(body.case_insensitive).toBe(true);
    expect(body.exclude_uri).toBe("viking://node_modules/");
    expect(body.level_limit).toBe(3);
    expect(body.node_limit).toBe(100);
  });

  it("works with required fields only", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      matches: [], count: 0,
    });

    const kb = new KnowledgeBaseAdapter(transport);
    await kb.grep("todo", { uri: "viking://" });

    const [, , opts] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.pattern).toBe("todo");
    expect(body.uri).toBe("viking://");
    expect(body.case_insensitive).toBeUndefined();
  });
});
