import { describe, it, expect, vi } from "vitest";
import type { SessionClient } from "../client/open-viking-client";
import type { CommitResult } from "../ports/session-store";
import type { TaskStatus } from "../ports/session-store";
import type { SessionId } from "../common/session-id";
import { SessionManager } from "./session-service";

function createMockClient(overrides?: Partial<SessionClient>): SessionClient {
  return {
    createSession: vi.fn().mockResolvedValue({ value: "sess_1" } as SessionId),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    sendMessages: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue({ sessionId: { value: "sess_1" }, taskId: "task_1" } as CommitResult),
    getTaskStatus: vi.fn().mockResolvedValue({ taskId: "task_1", status: "completed" } as TaskStatus),
    sessionUsed: vi.fn().mockResolvedValue(undefined),
    getSession: vi.fn().mockResolvedValue({
      sessionId: "sess_1",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
      messageCount: 5,
      commitCount: 2,
    }),
    listSessions: vi.fn().mockResolvedValue([]),
    deleteSession: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("SessionManager", () => {
  describe("active session tracking", () => {
    it("createAndSet creates session and getActive returns it", async () => {
      const client = createMockClient();
      const mgr = new SessionManager(client, { commitTimeout: 120_000 });

      const id = await mgr.createAndSet();

      expect(client.createSession).toHaveBeenCalledOnce();
      expect(id).toEqual({ value: "sess_1" });
      expect(mgr.getActive()).toEqual({ value: "sess_1" });
    });

    it("multiple createAndSet calls replace active session", async () => {
      let callCount = 0;
      const client = createMockClient({
        createSession: vi.fn().mockImplementation(() => {
          callCount++;
          return Promise.resolve({ value: `sess_${callCount}` } as SessionId);
        }),
      });
      const mgr = new SessionManager(client, { commitTimeout: 120_000 });

      await mgr.createAndSet();
      const second = await mgr.createAndSet();

      expect(second).toEqual({ value: "sess_2" });
      expect(mgr.getActive()).toEqual({ value: "sess_2" });
    });

    it("getActive returns null when no session created", () => {
      const client = createMockClient();
      const mgr = new SessionManager(client, { commitTimeout: 120_000 });

      expect(mgr.getActive()).toBeNull();
    });
  });

  describe("sendMessage", () => {
    it("delegates to client with correct params", async () => {
      const client = createMockClient();
      const mgr = new SessionManager(client, { commitTimeout: 120_000 });
      const sid = { value: "sess_1" } as SessionId;
      const parts = [{ type: "text" as const, text: "hello" }];

      await mgr.sendMessage(sid, "user", parts);

      expect(client.sendMessage).toHaveBeenCalledWith(sid, "user", parts);
    });
  });

  describe("sendMessages", () => {
    it("delegates to client with correct params", async () => {
      const client = createMockClient();
      const mgr = new SessionManager(client, { commitTimeout: 120_000 });
      const sid = { value: "sess_1" } as SessionId;
      const messages = [
        { role: "user", content: [{ type: "text" as const, text: "hello" }] },
        { role: "assistant", content: [{ type: "text" as const, text: "world" }] },
      ];

      await mgr.sendMessages(sid, messages);

      expect(client.sendMessages).toHaveBeenCalledWith(sid, messages);
    });

    it("handles empty messages array", async () => {
      const client = createMockClient();
      const mgr = new SessionManager(client, { commitTimeout: 120_000 });
      const sid = { value: "sess_1" } as SessionId;

      await mgr.sendMessages(sid, []);

      expect(client.sendMessages).toHaveBeenCalledWith(sid, []);
    });
  });

  describe("commit", () => {
    it("returns result immediately without polling", async () => {
      const result: CommitResult = { sessionId: { value: "sess_1" } as SessionId, taskId: "task_1" };
      const client = createMockClient({ commit: vi.fn().mockResolvedValue(result) });
      const mgr = new SessionManager(client, { commitTimeout: 120_000 });
      const sid = { value: "sess_1" } as SessionId;

      const got = await mgr.commit(sid, { keepRecentCount: 10 });

      expect(got).toEqual(result);
      expect(client.commit).toHaveBeenCalledWith(sid, { keepRecentCount: 10 });
      expect(client.getTaskStatus).not.toHaveBeenCalled();
    });
  });

  describe("waitForCommit", () => {
    it("polls until completed", async () => {
      let pollCount = 0;
      const client = createMockClient({
        getTaskStatus: vi.fn().mockImplementation(() => {
          pollCount++;
          if (pollCount < 3) return Promise.resolve({ taskId: "t1", status: "running" } as TaskStatus);
          return Promise.resolve({ taskId: "t1", status: "completed", result: "ok" } as TaskStatus);
        }),
      });
      const mgr = new SessionManager(client, { commitTimeout: 120_000, pollInterval: 10 });

      const status = await mgr.waitForCommit("t1");

      expect(status.status).toBe("completed");
      expect(status.result).toBe("ok");
      expect(client.getTaskStatus).toHaveBeenCalledTimes(3);
    });

    it("returns failed status immediately", async () => {
      const client = createMockClient({
        getTaskStatus: vi.fn().mockResolvedValue({ taskId: "t1", status: "failed", result: "error" } as TaskStatus),
      });
      const mgr = new SessionManager(client, { commitTimeout: 120_000 });

      const status = await mgr.waitForCommit("t1");

      expect(status.status).toBe("failed");
      expect(client.getTaskStatus).toHaveBeenCalledOnce();
    });

    it("times out after configured period", async () => {
      const client = createMockClient({
        getTaskStatus: vi.fn().mockResolvedValue({ taskId: "t1", status: "running" } as TaskStatus),
      });
      const mgr = new SessionManager(client, { commitTimeout: 120_000, pollInterval: 10 });

      await expect(mgr.waitForCommit("t1", 50)).rejects.toThrow("waitForCommit timed out");
    });
  });

  describe("deleteSession", () => {
    it("delegates to client", async () => {
      const client = createMockClient();
      const mgr = new SessionManager(client, { commitTimeout: 120_000 });
      const sid = { value: "sess_1" } as SessionId;

      await mgr.deleteSession(sid);

      expect(client.deleteSession).toHaveBeenCalledWith(sid);
    });
  });
});
