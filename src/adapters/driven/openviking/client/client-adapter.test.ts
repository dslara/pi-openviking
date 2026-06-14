import { describe, it, expect, vi } from "vitest";
import type { OVAdapter } from "../adapter";
import type { KnowledgeBase } from "../../../../domain/ports/knowledge-base";
import type { FsStore, Content, WriteResult, FsEntry } from "../../../../domain/ports/fs-store";
import type { SessionStore, CommitResult, SessionInfo } from "../../../../domain/ports/session-store";
import type { GraphStore, LinkResult } from "../../../../domain/ports/graph-store";
import type { ResourceStore, ResourceImportResult } from "../../../../domain/ports/resource-store";
import type { SkillStore, AddSkillResult } from "../../../../domain/ports/skill-store";
import type { Relation } from "../../../../domain/knowledge/model/relation";
import type { SearchResult } from "../../../../domain/knowledge/model/search-result";
import type { SessionId } from "../../../../domain/common/session-id";
import type { Uri } from "../../../../domain/common/uri";
import { OpenVikingClientAdapter } from "./client-adapter";

// ── Helpers ─────────────────────────────────────────────────────────────

function mockUri(value: string): Uri {
  return { value, toString: () => value } as Uri;
}

function mockSessionId(value: string): SessionId {
  return { value, toString: () => value } as SessionId;
}

/** Creates a fully-mocked OVAdapter with vi.fn() on every method. */
function createMockAdapter(): OVAdapter {
  const knowledgeBase: KnowledgeBase = {
    find: vi.fn(),
    search: vi.fn(),
    glob: vi.fn(),
    grep: vi.fn(),
  };

  const fsStore: FsStore = {
    read: vi.fn(),
    write: vi.fn(),
    list: vi.fn(),
    tree: vi.fn(),
    stat: vi.fn(),
    mkdir: vi.fn(),
    mv: vi.fn(),
    delete: vi.fn(),
    reindex: vi.fn(),
  };

  const sessionStore: SessionStore = {
    create: vi.fn(),
    sendMessage: vi.fn(),
    sendMessages: vi.fn(),
    commit: vi.fn(),
    getTaskStatus: vi.fn(),
    listTasks: vi.fn(),
    sessionUsed: vi.fn(),
    deleteSession: vi.fn(),
    getSession: vi.fn(),
    listSessions: vi.fn(),
  };

  const graphStore: GraphStore = {
    link: vi.fn(),
    unlink: vi.fn(),
    graph: vi.fn(),
  };

  const resourceStore: ResourceStore = {
    importUrl: vi.fn(),
  };

  const skillStore: SkillStore = {
    addSkill: vi.fn(),
  };

  return {
    knowledgeBase,
    fsStore,
    graphStore,
    sessionStore,
    resourceStore,
    skillStore,
    circuitBreakerOpen: false,
    transport: {} as any,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("OpenVikingClientAdapter", () => {
  describe("SearchClient", () => {
    it("find delegates to knowledgeBase.find", async () => {
      const adapter = createMockAdapter();
      const client = new OpenVikingClientAdapter(adapter);
      const expected: SearchResult = { memories: [], resources: [], skills: [], total: 0 };
      (adapter.knowledgeBase.find as ReturnType<typeof vi.fn>).mockResolvedValue(expected);

      const result = await client.find({ query: "test" });

      expect(adapter.knowledgeBase.find).toHaveBeenCalledWith({ query: "test" }, undefined, undefined);
      expect(result).toBe(expected);
    });

    it("search delegates to knowledgeBase.search", async () => {
      const adapter = createMockAdapter();
      const client = new OpenVikingClientAdapter(adapter);
      const expected: SearchResult = { memories: [], resources: [], skills: [], total: 0, queryPlan: "plan" };
      (adapter.knowledgeBase.search as ReturnType<typeof vi.fn>).mockResolvedValue(expected);

      const result = await client.search({ query: "deep" });

      expect(adapter.knowledgeBase.search).toHaveBeenCalledWith({ query: "deep" }, undefined, undefined);
      expect(result).toBe(expected);
    });

    it("glob delegates to knowledgeBase.glob", async () => {
      const adapter = createMockAdapter();
      const client = new OpenVikingClientAdapter(adapter);
      const expected = { entries: ["viking://a"], total: 1 };
      (adapter.knowledgeBase.glob as ReturnType<typeof vi.fn>).mockResolvedValue(expected);

      const result = await client.glob("viking://**/*.md", "viking://", 10);

      expect(adapter.knowledgeBase.glob).toHaveBeenCalledWith("viking://**/*.md", "viking://", 10, undefined);
      expect(result).toBe(expected);
    });

    it("grep delegates to knowledgeBase.grep", async () => {
      const adapter = createMockAdapter();
      const client = new OpenVikingClientAdapter(adapter);
      const expected = { matches: [{ uri: "viking://a", line: "hi" }], total: 1 };
      (adapter.knowledgeBase.grep as ReturnType<typeof vi.fn>).mockResolvedValue(expected);

      const result = await client.grep("TODO", { uri: "viking://" });

      expect(adapter.knowledgeBase.grep).toHaveBeenCalledWith("TODO", { uri: "viking://" }, undefined);
      expect(result).toBe(expected);
    });
  });

  describe("FsClient", () => {
    it("read delegates to fsStore.read", async () => {
      const adapter = createMockAdapter();
      const client = new OpenVikingClientAdapter(adapter);
      const uri = mockUri("viking://doc.md");
      const expected: Content = { uri, body: "# Hello" };
      (adapter.fsStore.read as ReturnType<typeof vi.fn>).mockResolvedValue(expected);

      const result = await client.read(uri, "read", 0, 100);

      expect(adapter.fsStore.read).toHaveBeenCalledWith(uri, "read", 0, 100, undefined);
      expect(result).toBe(expected);
    });

    it("save delegates to fsStore.write", async () => {
      const adapter = createMockAdapter();
      const client = new OpenVikingClientAdapter(adapter);
      const uri = mockUri("viking://doc.md");
      const expected: WriteResult = { uri, success: true };
      (adapter.fsStore.write as ReturnType<typeof vi.fn>).mockResolvedValue(expected);

      const result = await client.save(uri, "content", "replace");

      expect(adapter.fsStore.write).toHaveBeenCalledWith(uri, "content", "replace", undefined);
      expect(result).toBe(expected);
    });

    it("mkdir delegates to fsStore.mkdir", async () => {
      const adapter = createMockAdapter();
      const client = new OpenVikingClientAdapter(adapter);
      const uri = mockUri("viking://dir");
      (adapter.fsStore.mkdir as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await client.mkdir(uri);

      expect(adapter.fsStore.mkdir).toHaveBeenCalledWith(uri, undefined);
    });

    it("mv delegates to fsStore.mv", async () => {
      const adapter = createMockAdapter();
      const client = new OpenVikingClientAdapter(adapter);
      const from = mockUri("viking://a.md");
      const to = mockUri("viking://b.md");
      (adapter.fsStore.mv as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await client.mv(from, to);

      expect(adapter.fsStore.mv).toHaveBeenCalledWith(from, to, undefined);
    });

    it("list delegates to fsStore.list", async () => {
      const adapter = createMockAdapter();
      const client = new OpenVikingClientAdapter(adapter);
      const uri = mockUri("viking://dir");
      const expected: FsEntry[] = [{ uri, type: "file" }];
      (adapter.fsStore.list as ReturnType<typeof vi.fn>).mockResolvedValue(expected);

      const result = await client.list(uri, true);

      expect(adapter.fsStore.list).toHaveBeenCalledWith(uri, true, undefined);
      expect(result).toBe(expected);
    });

    it("tree delegates to fsStore.tree", async () => {
      const adapter = createMockAdapter();
      const client = new OpenVikingClientAdapter(adapter);
      const uri = mockUri("viking://dir");
      const expected: FsEntry[] = [{ uri, type: "directory" }];
      (adapter.fsStore.tree as ReturnType<typeof vi.fn>).mockResolvedValue(expected);

      const result = await client.tree(uri);

      expect(adapter.fsStore.tree).toHaveBeenCalledWith(uri, undefined);
      expect(result).toBe(expected);
    });

    it("stat delegates to fsStore.stat", async () => {
      const adapter = createMockAdapter();
      const client = new OpenVikingClientAdapter(adapter);
      const uri = mockUri("viking://doc.md");
      const expected: FsEntry = { uri, type: "file", size: 100 };
      (adapter.fsStore.stat as ReturnType<typeof vi.fn>).mockResolvedValue(expected);

      const result = await client.stat(uri);

      expect(adapter.fsStore.stat).toHaveBeenCalledWith(uri, undefined);
      expect(result).toBe(expected);
    });

    it("delete delegates to fsStore.delete", async () => {
      const adapter = createMockAdapter();
      const client = new OpenVikingClientAdapter(adapter);
      const uri = mockUri("viking://old");
      (adapter.fsStore.delete as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await client.delete(uri, true);

      expect(adapter.fsStore.delete).toHaveBeenCalledWith(uri, true, undefined);
    });

    it("reindex delegates to fsStore.reindex", async () => {
      const adapter = createMockAdapter();
      const client = new OpenVikingClientAdapter(adapter);
      const uri = mockUri("viking://docs");
      (adapter.fsStore.reindex as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await client.reindex(uri, "full");

      expect(adapter.fsStore.reindex).toHaveBeenCalledWith(uri, "full", undefined);
    });
  });

  describe("SessionClient", () => {
    it("createSession delegates to sessionStore.create", async () => {
      const adapter = createMockAdapter();
      const client = new OpenVikingClientAdapter(adapter);
      const sid = mockSessionId("sess-1");
      (adapter.sessionStore.create as ReturnType<typeof vi.fn>).mockResolvedValue(sid);

      const result = await client.createSession();

      expect(adapter.sessionStore.create).toHaveBeenCalledWith(undefined);
      expect(result).toBe(sid);
    });

    it("sendMessage delegates to sessionStore.sendMessage", async () => {
      const adapter = createMockAdapter();
      const client = new OpenVikingClientAdapter(adapter);
      const sid = mockSessionId("sess-1");
      (adapter.sessionStore.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await client.sendMessage(sid, "user", [{ type: "text", text: "hi" }]);

      expect(adapter.sessionStore.sendMessage).toHaveBeenCalledWith(sid, "user", [{ type: "text", text: "hi" }], undefined);
    });

    it("sendMessages delegates to sessionStore.sendMessages", async () => {
      const adapter = createMockAdapter();
      const client = new OpenVikingClientAdapter(adapter);
      const sid = mockSessionId("sess-2");
      (adapter.sessionStore.sendMessages as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await client.sendMessages(sid, [{ role: "user", content: [{ type: "text", text: "hi" }] }]);

      expect(adapter.sessionStore.sendMessages).toHaveBeenCalled();
    });

    it("commit delegates to sessionStore.commit", async () => {
      const adapter = createMockAdapter();
      const client = new OpenVikingClientAdapter(adapter);
      const sid = mockSessionId("sess-1");
      const expected: CommitResult = { sessionId: sid };
      (adapter.sessionStore.commit as ReturnType<typeof vi.fn>).mockResolvedValue(expected);

      const result = await client.commit(sid, { keepRecentCount: 10 });

      expect(adapter.sessionStore.commit).toHaveBeenCalledWith(sid, { keepRecentCount: 10 }, undefined);
      expect(result).toBe(expected);
    });

    it("getSession delegates to sessionStore.getSession", async () => {
      const adapter = createMockAdapter();
      const client = new OpenVikingClientAdapter(adapter);
      const sid = mockSessionId("sess-1");
      const expected: SessionInfo = { sessionId: "sess-1", createdAt: "t1", updatedAt: "t2", messageCount: 0, commitCount: 0 };
      (adapter.sessionStore.getSession as ReturnType<typeof vi.fn>).mockResolvedValue(expected);

      const result = await client.getSession(sid);

      expect(adapter.sessionStore.getSession).toHaveBeenCalledWith(sid, undefined);
      expect(result).toBe(expected);
    });

    it("getTaskStatus delegates to sessionStore.getTaskStatus", async () => {
      const adapter = createMockAdapter();
      const client = new OpenVikingClientAdapter(adapter);
      (adapter.sessionStore.getTaskStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ taskId: "t1", status: "completed" });

      const result = await client.getTaskStatus("t1");

      expect(adapter.sessionStore.getTaskStatus).toHaveBeenCalledWith("t1", undefined);
      expect(result.status).toBe("completed");
    });

    it("sessionUsed delegates to sessionStore.sessionUsed", async () => {
      const adapter = createMockAdapter();
      const client = new OpenVikingClientAdapter(adapter);
      const sid = mockSessionId("sess-1");
      const ctx = [mockUri("viking://doc.md")];
      (adapter.sessionStore.sessionUsed as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await client.sessionUsed(sid, ctx);

      expect(adapter.sessionStore.sessionUsed).toHaveBeenCalledWith(sid, ctx, undefined);
    });

    it("deleteSession delegates to sessionStore.deleteSession", async () => {
      const adapter = createMockAdapter();
      const client = new OpenVikingClientAdapter(adapter);
      const sid = mockSessionId("sess-1");
      (adapter.sessionStore.deleteSession as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await client.deleteSession(sid);

      expect(adapter.sessionStore.deleteSession).toHaveBeenCalledWith(sid, undefined);
    });

    it("listSessions delegates to sessionStore.listSessions", async () => {
      const adapter = createMockAdapter();
      const client = new OpenVikingClientAdapter(adapter);
      const expected: SessionInfo[] = [{ sessionId: "s-1", createdAt: "t1", updatedAt: "t2", messageCount: 0, commitCount: 0 }];
      (adapter.sessionStore.listSessions as ReturnType<typeof vi.fn>).mockResolvedValue(expected);

      const result = await client.listSessions();

      expect(adapter.sessionStore.listSessions).toHaveBeenCalledWith(undefined);
      expect(result).toBe(expected);
    });
  });

  describe("RelationClient", () => {
    it("link delegates to graphStore.link", async () => {
      const adapter = createMockAdapter();
      const client = new OpenVikingClientAdapter(adapter);
      const src = mockUri("viking://a");
      const tgt = mockUri("viking://b");
      const expected: LinkResult = { source: src, targets: [tgt] };
      (adapter.graphStore.link as ReturnType<typeof vi.fn>).mockResolvedValue(expected);

      const result = await client.link(src, tgt, "related");

      expect(adapter.graphStore.link).toHaveBeenCalledWith(src, tgt, "related", undefined);
      expect(result).toBe(expected);
    });

    it("unlink delegates to graphStore.unlink", async () => {
      const adapter = createMockAdapter();
      const client = new OpenVikingClientAdapter(adapter);
      const src = mockUri("viking://a");
      const tgt = mockUri("viking://b");
      (adapter.graphStore.unlink as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await client.unlink(src, tgt);

      expect(adapter.graphStore.unlink).toHaveBeenCalledWith(src, tgt, undefined);
    });

    it("graph delegates to graphStore.graph", async () => {
      const adapter = createMockAdapter();
      const client = new OpenVikingClientAdapter(adapter);
      const uri = mockUri("viking://a");
      const expected: Relation[] = [{ uri: "viking://b" }];
      (adapter.graphStore.graph as ReturnType<typeof vi.fn>).mockResolvedValue(expected);

      const result = await client.graph(uri);

      expect(adapter.graphStore.graph).toHaveBeenCalledWith(uri, undefined);
      expect(result).toBe(expected);
    });
  });

  describe("ResourceClient", () => {
    it("importUrl delegates to resourceStore.importUrl", async () => {
      const adapter = createMockAdapter();
      const client = new OpenVikingClientAdapter(adapter);
      const expected: ResourceImportResult = { status: "ok", rootUri: "viking://r", sourcePath: "/x" };
      (adapter.resourceStore.importUrl as ReturnType<typeof vi.fn>).mockResolvedValue(expected);

      const result = await client.importUrl("https://example.com", { wait: true });

      expect(adapter.resourceStore.importUrl).toHaveBeenCalledWith("https://example.com", { wait: true }, undefined);
      expect(result).toBe(expected);
    });
  });

  describe("SkillClient", () => {
    it("addSkill delegates to skillStore.addSkill", async () => {
      const adapter = createMockAdapter();
      const client = new OpenVikingClientAdapter(adapter);
      const expected: AddSkillResult = { rootUri: "viking://s", uri: "viking://s/skill", name: "test", auxiliaryFiles: 0 };
      (adapter.skillStore.addSkill as ReturnType<typeof vi.fn>).mockResolvedValue(expected);

      const result = await client.addSkill("# my skill", { wait: true });

      expect(adapter.skillStore.addSkill).toHaveBeenCalledWith("# my skill", { wait: true }, undefined);
      expect(result).toBe(expected);
    });
  });

  describe("Sub-client accessors", () => {
    it("exposes searchClient, fsClient, etc. for type-narrowing", () => {
      const adapter = createMockAdapter();
      const client = new OpenVikingClientAdapter(adapter);

      expect(client.searchClient).toBe(client);
      expect(client.fsClient).toBe(client);
      expect(client.sessionClient).toBe(client);
      expect(client.relationClient).toBe(client);
      expect(client.resourceClient).toBe(client);
      expect(client.skillClient).toBe(client);
    });
  });
});
