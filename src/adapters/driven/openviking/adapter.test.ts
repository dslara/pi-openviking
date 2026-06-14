import { describe, it, expect } from "vitest";
import { createOVAdapter } from "./adapter";
import type { OVAdapterConfig } from "../../infrastructure/config";

const TEST_CONFIG: OVAdapterConfig = {
  endpoint: "http://127.0.0.1:1933",
  apiKey: "test-key",
  account: "test-account",
  user: "test-user",
  agentId: "pi",
  timeout: 5000,
  commitTimeout: 120_000,
  maxRetries: 2,
  rateLimitPerSecond: 0,
  autoCommitIntervalMs: 300_000,
};

describe("createOVAdapter", () => {
  it("returns all 6 port implementations", () => {
    const adapter = createOVAdapter(TEST_CONFIG);
    expect(adapter).toHaveProperty("knowledgeBase");
    expect(adapter).toHaveProperty("fsStore");
    expect(adapter).toHaveProperty("graphStore");
    expect(adapter).toHaveProperty("sessionStore");
    expect(adapter).toHaveProperty("resourceStore");
    expect(adapter).toHaveProperty("skillStore");
  });

  it("each adapter has the expected methods", () => {
    const adapter = createOVAdapter(TEST_CONFIG);

    // KnowledgeBase
    expect(typeof adapter.knowledgeBase.find).toBe("function");
    expect(typeof adapter.knowledgeBase.search).toBe("function");
    expect(typeof adapter.knowledgeBase.glob).toBe("function");
    expect(typeof adapter.knowledgeBase.grep).toBe("function");

    // FsStore
    expect(typeof adapter.fsStore.read).toBe("function");
    expect(typeof adapter.fsStore.write).toBe("function");
    expect(typeof adapter.fsStore.list).toBe("function");
    expect(typeof adapter.fsStore.tree).toBe("function");
    expect(typeof adapter.fsStore.stat).toBe("function");
    expect(typeof adapter.fsStore.mkdir).toBe("function");
    expect(typeof adapter.fsStore.mv).toBe("function");
    expect(typeof adapter.fsStore.delete).toBe("function");

    // GraphStore
    expect(typeof adapter.graphStore.link).toBe("function");
    expect(typeof adapter.graphStore.unlink).toBe("function");
    expect(typeof adapter.graphStore.graph).toBe("function");

    // SessionStore
    expect(typeof adapter.sessionStore.create).toBe("function");
    expect(typeof adapter.sessionStore.sendMessage).toBe("function");
    expect(typeof adapter.sessionStore.sendMessages).toBe("function");
    expect(typeof adapter.sessionStore.commit).toBe("function");
    expect(typeof adapter.sessionStore.getTaskStatus).toBe("function");
    expect(typeof adapter.sessionStore.listTasks).toBe("function");
    expect(typeof adapter.sessionStore.sessionUsed).toBe("function");
    expect(typeof adapter.sessionStore.deleteSession).toBe("function");

    // ResourceStore
    expect(typeof adapter.resourceStore.importUrl).toBe("function");

    // SkillStore
    expect(typeof adapter.skillStore.addSkill).toBe("function");
  });

  it("creates independent instances per call", () => {
    const a1 = createOVAdapter(TEST_CONFIG);
    const a2 = createOVAdapter(TEST_CONFIG);
    expect(a1.fsStore).not.toBe(a2.fsStore);
  });
});
