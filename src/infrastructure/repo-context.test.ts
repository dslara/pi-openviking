import { describe, it, expect, vi, beforeEach } from "vitest";
import { RepoContext } from "./repo-context";
import type { FsClient } from "../domain/client/open-viking-client";
import { Uri } from "../domain/common/uri";

function mockFsClient(entries: Array<{ uri: string; type: string; size: number; modTime: number }>): FsClient {
  return {
    list: vi.fn().mockResolvedValue(entries.map(e => ({
      uri: new Uri(e.uri),
      type: e.type,
      size: e.size,
      modTime: String(e.modTime),
    }))),
    read: vi.fn(),
    save: vi.fn(),
    tree: vi.fn(),
    stat: vi.fn(),
    mkdir: vi.fn(),
    mv: vi.fn(),
    delete: vi.fn(),
    reindex: vi.fn(),
  };
}

describe("RepoContext", () => {
  let fsStore: FsClient;

  beforeEach(() => {
    fsStore = mockFsClient([]);
  });

  it("returns empty string when no resources indexed", async () => {
    const ctx = new RepoContext(fsStore);
    const snippet = await ctx.getSystemPromptSnippet();
    expect(snippet).toBe("");
  });

  it("returns formatted snippet when resources exist", async () => {
    fsStore = mockFsClient([
      { uri: "viking://resources/pi-openviking", type: "directory", size: 0, modTime: 0 },
      { uri: "viking://resources/README.md", type: "file", size: 1234, modTime: 1717000000000 },
    ]);
    const ctx = new RepoContext(fsStore);
    const snippet = await ctx.getSystemPromptSnippet();

    expect(snippet).toContain("indexed in OpenViking");
    expect(snippet).toContain("📁");
    expect(snippet).toContain("📄");
    expect(snippet).toContain("ov_search");
    expect(snippet).toContain("ov_read");
    expect(snippet).toContain("ov_resource");
  });

  it("caches results within TTL", async () => {
    const listMock = vi.fn().mockResolvedValue([
      { uri: "viking://resources/doc.md", type: "file", size: 100, modTime: 0 },
    ]);
    fsStore = { ...mockFsClient([]), list: listMock };

    const ctx = new RepoContext(fsStore, undefined, { ttlMs: 60_000 });

    await ctx.getSystemPromptSnippet();
    await ctx.getSystemPromptSnippet();

    // list should be called only once (second call hits cache)
    expect(listMock).toHaveBeenCalledTimes(1);
  });

  it("refetches after TTL expires", async () => {
    const listMock = vi.fn().mockResolvedValue([
      { uri: "viking://resources/doc.md", type: "file", size: 100, modTime: 0 },
    ]);
    fsStore = { ...mockFsClient([]), list: listMock };

    const ctx = new RepoContext(fsStore, undefined, { ttlMs: 0 }); // zero TTL = always refetch

    await ctx.getSystemPromptSnippet();
    await ctx.getSystemPromptSnippet();

    expect(listMock).toHaveBeenCalledTimes(2);
  });

  it("returns empty string on list error", async () => {
    fsStore = { ...mockFsClient([]), list: vi.fn().mockRejectedValue(new Error("OV unavailable")) };
    const ctx = new RepoContext(fsStore);
    const snippet = await ctx.getSystemPromptSnippet();
    expect(snippet).toBe("");
  });

  it("invalidateCache forces re-fetch", async () => {
    const listMock = vi.fn().mockResolvedValue([
      { uri: "viking://resources/doc.md", type: "file", size: 100, modTime: 0 },
    ]);
    fsStore = { ...mockFsClient([]), list: listMock };

    const ctx = new RepoContext(fsStore, undefined, { ttlMs: 60_000 });

    await ctx.getSystemPromptSnippet();
    ctx.invalidateCache();
    await ctx.getSystemPromptSnippet();

    expect(listMock).toHaveBeenCalledTimes(2);
  });
});
