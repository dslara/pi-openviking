import { describe, it, expect, vi } from "vitest";
import { SessionStoreAdapter } from "./session-store";
import { SessionId } from "../../domain/common/session-id";
import { Uri } from "../../domain/common/uri";
import type { Transport } from "./transport";
import type { Part } from "../../domain/common/part";

function mockTransport(): Transport {
  return {
    request: vi.fn(),
  } as unknown as Transport;
}

describe("SessionStoreAdapter.create", () => {
  it("calls POST /api/v1/sessions and returns SessionId", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({ session_id: "sess-abc" });

    const ss = new SessionStoreAdapter(transport);
    const id = await ss.create();

    const [label, path, opts] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(label).toBe("SessionStore.create");
    expect(path).toBe("/api/v1/sessions");
    expect(opts.method).toBe("POST");
    expect(id.value).toBe("sess-abc");
  });
});

describe("SessionStoreAdapter.sendMessage", () => {
  const sid = new SessionId("sess-1");

  it("calls POST /api/v1/sessions/{id}/messages with serialized parts", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const ss = new SessionStoreAdapter(transport);
    const parts: Part[] = [{ type: "text", text: "hello" }];
    await ss.sendMessage(sid, "user", parts);

    const [label, path, opts] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(label).toBe("SessionStore.sendMessage");
    expect(path).toContain("/api/v1/sessions/sess-1/messages");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body);
    expect(body.role).toBe("user");
    expect(body.parts).toHaveLength(1);
    expect(body.parts[0].type).toBe("text");
    expect(body.parts[0].text).toBe("hello");
  });
});

describe("SessionStoreAdapter.sendMessages", () => {
  const sid = new SessionId("sess-1");

  it("calls POST /api/v1/sessions/{id}/messages/batch with all messages", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const ss = new SessionStoreAdapter(transport);
    const msgs = [
      { role: "user", content: [{ type: "text" as const, text: "hi" }] },
      { role: "assistant", content: [{ type: "text" as const, text: "hello" }] },
    ];
    await ss.sendMessages(sid, msgs);

    expect(transport.request).toHaveBeenCalledTimes(1);

    const [label, path, opts] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(label).toBe("SessionStore.sendMessages");
    expect(path).toBe("/api/v1/sessions/sess-1/messages/batch");
    expect(opts.method).toBe("POST");

    const body = JSON.parse(opts.body);
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe("user");
    expect(body.messages[0].parts[0].text).toBe("hi");
    expect(body.messages[1].role).toBe("assistant");
    expect(body.messages[1].parts[0].text).toBe("hello");
  });

  it("serializes part fields correctly in batch payload", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const ss = new SessionStoreAdapter(transport);
    const parts: Part[] = [
      { type: "text", text: "result" },
      {
        type: "tool",
        toolId: "call_1",
        toolName: "ov_search",
        toolInput: { query: "x" },
        toolOutput: "ok",
        toolStatus: "success",
        toolOutputTruncated: false,
        toolUri: "",
        skillUri: "",
        durationMs: null,
        promptTokens: null,
        completionTokens: null,
        toolOutputRef: "",
      },
    ];
    await ss.sendMessages(sid, [{ role: "assistant", content: parts }]);

    const [, , opts] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(opts.body);
    const serialized = body.messages[0].parts;

    // TextPart stays flat
    expect(serialized[0].type).toBe("text");
    expect(serialized[0].text).toBe("result");

    // ToolPart uses snake_case keys
    expect(serialized[1].type).toBe("tool");
    expect(serialized[1].tool_id).toBe("call_1");
    expect(serialized[1].tool_name).toBe("ov_search");
    expect(serialized[1].tool_input).toEqual({ query: "x" });
    expect(serialized[1].tool_output).toBe("ok");
    expect(serialized[1].tool_status).toBe("success");
    expect(serialized[1].tool_output_truncated).toBe(false);
  });

  it("handles empty messages array gracefully", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const ss = new SessionStoreAdapter(transport);
    await ss.sendMessages(sid, []);

    expect(transport.request).toHaveBeenCalledTimes(1);
    const [, , opts] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.messages).toEqual([]);
  });
});

describe("SessionStoreAdapter.commit", () => {
  const sid = new SessionId("sess-1");

  it("calls POST /api/v1/sessions/{id}/commit", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({ session_id: "sess-1", task_id: "task-42" });

    const ss = new SessionStoreAdapter(transport);
    const result = await ss.commit(sid);

    const [label, path, opts] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(label).toBe("SessionStore.commit");
    expect(path).toContain("/api/v1/sessions/sess-1/commit");
    expect(opts.method).toBe("POST");
    expect(result.sessionId.value).toBe("sess-1");
    expect(result.taskId).toBe("task-42");
  });

  it("passes keep_recent_count from CommitOptions", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({ session_id: "sess-1" });

    const ss = new SessionStoreAdapter(transport);
    await ss.commit(sid, { keepRecentCount: 10 });

    const [, , opts] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.keep_recent_count).toBe(10);
  });

  it("omits keep_recent_count when not provided", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({ session_id: "sess-1" });

    const ss = new SessionStoreAdapter(transport);
    await ss.commit(sid);

    const [, , opts] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(opts.body || "{}");
    expect(body.keep_recent_count).toBeUndefined();
  });
});

describe("SessionStoreAdapter.getTaskStatus", () => {
  it("calls GET /api/v1/tasks/{taskId}", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({ task_id: "t-1", status: "completed" });

    const ss = new SessionStoreAdapter(transport);
    const status = await ss.getTaskStatus("t-1");

    const [label, path] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(label).toBe("SessionStore.getTaskStatus");
    expect(path).toContain("/api/v1/tasks/t-1");
    expect(status.taskId).toBe("t-1");
    expect(status.status).toBe("completed");
  });
});

describe("SessionStoreAdapter.listTasks", () => {
  it("calls GET /api/v1/tasks with no filters", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const ss = new SessionStoreAdapter(transport);
    await ss.listTasks();

    const [label, path] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(label).toBe("SessionStore.listTasks");
    // Just path, no query params when no filters
    expect(path).toBe("/api/v1/tasks");
  });

  it("applies filter params", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const ss = new SessionStoreAdapter(transport);
    await ss.listTasks({ taskType: "commit", status: "completed", resourceId: "viking://r", limit: 10 });

    const [, path] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(path).toContain("task_type=commit");
    expect(path).toContain("status=completed");
    expect(path).toContain("resource_id=" + encodeURIComponent("viking://r"));
    expect(path).toContain("limit=10");
  });
});

describe("SessionStoreAdapter.sessionUsed", () => {
  const sid = new SessionId("sess-1");

  it("calls POST /api/v1/sessions/{id}/used with contexts", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const ss = new SessionStoreAdapter(transport);
    const contexts = [new Uri("viking://mem/1"), new Uri("viking://mem/2")];
    await ss.sessionUsed(sid, contexts);

    const [label, path, opts] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(label).toBe("SessionStore.sessionUsed");
    expect(path).toBe("/api/v1/sessions/sess-1/used");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body);
    expect(body.contexts).toEqual(["viking://mem/1", "viking://mem/2"]);
  });
});

describe("SessionStoreAdapter.deleteSession", () => {
  it("calls DELETE /api/v1/sessions/{id}", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const ss = new SessionStoreAdapter(transport);
    await ss.deleteSession(new SessionId("sess-1"));

    const [label, path, opts] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(label).toBe("SessionStore.deleteSession");
    expect(path).toBe("/api/v1/sessions/sess-1");
    expect(opts.method).toBe("DELETE");
  });
});

describe("SessionStoreAdapter.getSession", () => {
  it("calls GET /api/v1/sessions/{id} and returns SessionInfo", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      session_id: "sess-1",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-06-01T00:00:00Z",
      message_count: 42,
      commit_count: 3,
    });

    const ss = new SessionStoreAdapter(transport);
    const info = await ss.getSession(new SessionId("sess-1"));

    const [label, path] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(label).toBe("SessionStore.getSession");
    expect(path).toBe("/api/v1/sessions/sess-1");
    expect(info.sessionId).toBe("sess-1");
    expect(info.messageCount).toBe(42);
    expect(info.commitCount).toBe(3);
  });

  it("handles full session info response", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      session_id: "sess-2",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-06-01T00:00:00Z",
      message_count: 10,
      total_message_count: 50,
      commit_count: 2,
      memories_extracted: { profile: 3, preferences: 4, total: 7 },
      last_commit_at: "2026-06-01T00:00:00Z",
    });

    const ss = new SessionStoreAdapter(transport);
    const info = await ss.getSession(new SessionId("sess-2"));

    expect(info.totalMessageCount).toBe(50);
    expect(info.memoriesExtracted).toBe(7);
    expect(info.lastCommitAt).toBe("2026-06-01T00:00:00Z");
  });
});

describe("SessionStoreAdapter.listSessions", () => {
  it("calls GET /api/v1/sessions and returns SessionInfo array", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        session_id: "sess-1",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-06-01T00:00:00Z",
        message_count: 42,
        commit_count: 3,
      },
      {
        session_id: "sess-2",
        created_at: "2026-02-01T00:00:00Z",
        updated_at: "2026-06-01T00:00:00Z",
        message_count: 10,
        commit_count: 1,
      },
    ]);

    const ss = new SessionStoreAdapter(transport);
    const sessions = await ss.listSessions();

    const [label, path] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(label).toBe("SessionStore.listSessions");
    expect(path).toBe("/api/v1/sessions");
    expect(sessions).toHaveLength(2);
    expect(sessions[0].sessionId).toBe("sess-1");
    expect(sessions[1].sessionId).toBe("sess-2");
  });

  it("handles empty list", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const ss = new SessionStoreAdapter(transport);
    const sessions = await ss.listSessions();

    expect(sessions).toHaveLength(0);
  });

  it("handles non-array response gracefully", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const ss = new SessionStoreAdapter(transport);
    const sessions = await ss.listSessions();

    expect(sessions).toHaveLength(0);
  });
});
