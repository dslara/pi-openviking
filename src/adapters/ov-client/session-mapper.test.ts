import { describe, it, expect } from "vitest";
import { toSessionId, toCommitResult, toTaskStatus, toSessionInfo, serializePart, serializeParts } from "./session-mapper";
import { SessionId } from "../../domain/common/session-id";
import type { Part, TextPart, ToolPart, ContextPart } from "../../domain/common/part";
import type { OVCreateSessionResponse, OVCommitResponse, OVSessionInfo } from "./ov-session";
import type { OVTaskResponse } from "./ov-task";

describe("toSessionId", () => {
  it("extracts session_id from create response", () => {
    const raw: OVCreateSessionResponse = { session_id: "sess-abc-123", user: { account_id: "default", user_id: "alice" } };
    const id = toSessionId(raw);
    expect(id).toBeInstanceOf(SessionId);
    expect(id.value).toBe("sess-abc-123");
  });

  it("extracts session_id from commit response", () => {
    const raw: OVCommitResponse = { session_id: "sess-xyz", status: "accepted" };
    const id = toSessionId(raw);
    expect(id.value).toBe("sess-xyz");
  });

  it("throws on missing session_id", () => {
    expect(() => toSessionId({} as OVCreateSessionResponse)).toThrow();
  });
});

describe("toCommitResult", () => {
  it("maps commit response with sessionId and taskId", () => {
    const raw: OVCommitResponse = { session_id: "sess-1", status: "accepted", task_id: "task-42" };
    const result = toCommitResult(raw);
    expect(result.sessionId.value).toBe("sess-1");
    expect(result.taskId).toBe("task-42");
  });

  it("handles missing taskId", () => {
    const raw: OVCommitResponse = { session_id: "sess-1", status: "accepted" };
    const result = toCommitResult(raw);
    expect(result.taskId).toBeUndefined();
  });

  it("extracts archive_uri and archived from commit response", () => {
    const raw: OVCommitResponse = { session_id: "sess-1", status: "accepted", archive_uri: "viking://archive/sess-1.json", archived: true };
    const result = toCommitResult(raw);
    expect(result.archiveUri).toBe("viking://archive/sess-1.json");
    expect(result.archived).toBe(true);
  });

  it("omits archiveUri when archive_uri absent", () => {
    const raw: OVCommitResponse = { session_id: "sess-1", status: "accepted" };
    const result = toCommitResult(raw);
    expect(result.archiveUri).toBeUndefined();
    expect(result.archived).toBeUndefined();
  });

  it("handles archived=false", () => {
    const raw: OVCommitResponse = { session_id: "sess-1", status: "accepted", archive_uri: "viking://archive/sess-1.json", archived: false };
    const result = toCommitResult(raw);
    expect(result.archiveUri).toBe("viking://archive/sess-1.json");
    expect(result.archived).toBe(false);
  });
});

describe("toTaskStatus", () => {
  it("maps completed task", () => {
    const raw: OVTaskResponse = { task_id: "task-1", status: "completed", result: { ok: true } };
    const status = toTaskStatus(raw);
    expect(status.taskId).toBe("task-1");
    expect(status.status).toBe("completed");
    expect(status.result).toEqual({ ok: true });
  });

  it("maps pending task", () => {
    const raw: OVTaskResponse = { task_id: "task-2", status: "pending" };
    const status = toTaskStatus(raw);
    expect(status.status).toBe("pending");
  });

  it("maps failed task", () => {
    const raw: OVTaskResponse = { task_id: "task-3", status: "failed" };
    const status = toTaskStatus(raw);
    expect(status.status).toBe("failed");
  });

  it("maps unknown status safely", () => {
    const raw: OVTaskResponse = { task_id: "task-4", status: "unknown" };
    const status = toTaskStatus(raw);
    expect(status.status).toBe("unknown"); // passthrough — caller validates
  });

  it("handles missing result", () => {
    const raw: OVTaskResponse = { task_id: "task-5", status: "running" };
    const status = toTaskStatus(raw);
    expect(status.result).toBeUndefined();
  });
});

describe("serializePart", () => {
  it("serializes TextPart", () => {
    const part: TextPart = { type: "text", text: "hello" };
    const json = serializePart(part);
    expect(json).toEqual({ type: "text", text: "hello" });
  });

  it("serializes ToolPart with camelCase→snake_case", () => {
    const part: ToolPart = {
      type: "tool",
      toolId: "t1",
      toolName: "search",
      toolInput: { q: "test" },
      toolOutput: "result",
      toolStatus: "success",
      toolOutputTruncated: false,
      toolUri: "viking://tools/search",
      skillUri: "viking://skills/search",
      durationMs: 150,
      promptTokens: 100,
      completionTokens: 50,
      toolOutputRef: "",
    };
    const json = serializePart(part);
    expect(json.type).toBe("tool");
    expect(json.tool_id).toBe("t1");
    expect(json.tool_name).toBe("search");
    expect(json.tool_input).toEqual({ q: "test" });
    expect(json.tool_output).toBe("result");
    expect(json.tool_status).toBe("success");
    expect(json.tool_output_truncated).toBe(false);
    expect(json.tool_uri).toBe("viking://tools/search");
    expect(json.skill_uri).toBe("viking://skills/search");
    expect(json.duration_ms).toBe(150);
    expect(json.prompt_tokens).toBe(100);
    expect(json.completion_tokens).toBe(50);
    expect(json.tool_output_ref).toBe("");
    // Ensure no camelCase keys leak
    expect(json.toolId).toBeUndefined();
    expect(json.durationMs).toBeUndefined();
  });

  it("serializes ToolPart with null numeric fields", () => {
    const part: ToolPart = {
      type: "tool",
      toolId: "t1",
      toolName: "search",
      toolInput: {},
      toolOutput: "",
      toolStatus: "error",
      toolOutputTruncated: false,
      toolUri: "",
      skillUri: "",
      durationMs: null,
      promptTokens: null,
      completionTokens: null,
      toolOutputRef: "",
    };
    const json = serializePart(part);
    expect(json.duration_ms).toBeNull();
    expect(json.prompt_tokens).toBeNull();
    expect(json.completion_tokens).toBeNull();
  });

  it("serializes ContextPart with contextType → context_type", () => {
    const part: ContextPart = { type: "context", uri: "viking://resources/doc.md", contextType: "resource", abstract: "A doc" };
    const json = serializePart(part);
    expect(json.type).toBe("context");
    expect(json.uri).toBe("viking://resources/doc.md");
    expect(json.context_type).toBe("resource");
    expect(json.abstract).toBe("A doc");
    expect(json.contextType).toBeUndefined();
  });

  it("serializes ContextPart with memory type", () => {
    const part: ContextPart = { type: "context", uri: "viking://mem/1", contextType: "memory", abstract: "Memory" };
    const json = serializePart(part);
    expect(json.context_type).toBe("memory");
  });

  it("serializes ContextPart with skill type", () => {
    const part: ContextPart = { type: "context", uri: "viking://skills/x", contextType: "skill", abstract: "Skill" };
    const json = serializePart(part);
    expect(json.context_type).toBe("skill");
  });
});

describe("serializeParts", () => {
  it("serializes array of mixed parts", () => {
    const parts: Part[] = [
      { type: "text", text: "hello" },
      { type: "tool", toolId: "t1", toolName: "s", toolInput: {}, toolOutput: "o", toolStatus: "ok", toolOutputTruncated: false, toolUri: "", skillUri: "", durationMs: null, promptTokens: null, completionTokens: null, toolOutputRef: "" },
      { type: "context", uri: "u", contextType: "resource", abstract: "a" },
    ];
    const json = serializeParts(parts);
    expect(json).toHaveLength(3);
    expect(json[0].type).toBe("text");
    expect(json[1].type).toBe("tool");
    expect(json[1].tool_id).toBe("t1");
    expect(json[2].type).toBe("context");
    expect(json[2].context_type).toBe("resource");
  });
});

describe("toSessionInfo", () => {
  it("maps full session info response", () => {
    const raw: OVSessionInfo = {
      session_id: "sess-1",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-06-01T00:00:00Z",
      message_count: 42,
      total_message_count: 100,
      commit_count: 3,
      memories_extracted: { profile: 5, preferences: 3, total: 15 },
      last_commit_at: "2026-06-01T00:00:00Z",
    };
    const info = toSessionInfo(raw);
    expect(info.sessionId).toBe("sess-1");
    expect(info.createdAt).toBe("2026-01-01T00:00:00Z");
    expect(info.updatedAt).toBe("2026-06-01T00:00:00Z");
    expect(info.messageCount).toBe(42);
    expect(info.totalMessageCount).toBe(100);
    expect(info.commitCount).toBe(3);
    expect(info.memoriesExtracted).toBe(15);
    expect(info.lastCommitAt).toBe("2026-06-01T00:00:00Z");
  });

  it("sums memories_extracted when no total key", () => {
    const raw: OVSessionInfo = {
      session_id: "sess-1",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-06-01T00:00:00Z",
      message_count: 10,
      commit_count: 1,
      memories_extracted: { profile: 5, preferences: 3 },
    };
    const info = toSessionInfo(raw);
    expect(info.memoriesExtracted).toBe(8);
  });

  it("handles minimal session info", () => {
    const raw: OVSessionInfo = {
      session_id: "sess-2",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T01:00:00Z",
      message_count: 5,
      commit_count: 0,
    };
    const info = toSessionInfo(raw);
    expect(info.sessionId).toBe("sess-2");
    expect(info.messageCount).toBe(5);
    expect(info.commitCount).toBe(0);
    expect(info.totalMessageCount).toBeUndefined();
    expect(info.memoriesExtracted).toBeUndefined();
    expect(info.lastCommitAt).toBeUndefined();
  });
});
