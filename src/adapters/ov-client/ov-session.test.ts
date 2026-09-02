import { describe, it, expect } from "vitest";
import type { OVCommitResponse, OVCreateSessionResponse, OVSessionInfo, OVListSessionsEntry } from "./ov-session";

describe("OVCommitResponse", () => {
  it("creates basic commit response", () => {
    const r: OVCommitResponse = { session_id: "sess-1", status: "accepted" };
    expect(r.session_id).toBe("sess-1");
    expect(r.status).toBe("accepted");
    expect(r.task_id).toBeUndefined();
    expect(r.archive_uri).toBeUndefined();
    expect(r.archived).toBeUndefined();
  });

  it("includes optional archive fields", () => {
    const r: OVCommitResponse = {
      session_id: "sess-1",
      status: "accepted",
      task_id: "task-42",
      archive_uri: "viking://archive/sess-1.json",
      archived: true,
    };
    expect(r.task_id).toBe("task-42");
    expect(r.archive_uri).toBe("viking://archive/sess-1.json");
    expect(r.archived).toBe(true);
  });
});

describe("OVCreateSessionResponse", () => {
  it("creates session create response", () => {
    const r: OVCreateSessionResponse = {
      session_id: "sess-new",
      user: { account_id: "acc-1", user_id: "usr-1" },
    };
    expect(r.session_id).toBe("sess-new");
    expect(r.user.account_id).toBe("acc-1");
    expect(r.user.user_id).toBe("usr-1");
  });
});

describe("OVSessionInfo", () => {
  it("creates session info with all fields", () => {
    const info: OVSessionInfo = {
      session_id: "sess-1",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-06-01T00:00:00Z",
      message_count: 42,
      total_message_count: 100,
      commit_count: 3,
      memories_extracted: { profile: 1, preferences: 2, entities: 3, total: 10 },
      last_commit_at: "2026-06-01T00:00:00Z",
      llm_token_usage: {
        prompt_tokens: 5200,
        completion_tokens: 1800,
        total_tokens: 7000,
        cached_tokens: 1200,
        reasoning_tokens: 800,
      },
      user: { account_id: "acc-1", user_id: "usr-1" },
      pending_tokens: 450,
    };
    expect(info.message_count).toBe(42);
    expect(info.total_message_count).toBe(100);
    expect(info.commit_count).toBe(3);
    expect(info.memories_extracted).toEqual({ profile: 1, preferences: 2, entities: 3, total: 10 });
    expect(info.llm_token_usage?.prompt_tokens).toBe(5200);
    expect(info.user?.account_id).toBe("acc-1");
    expect(info.pending_tokens).toBe(450);
  });

  it("allows optional fields to be omitted", () => {
    const info: OVSessionInfo = {
      session_id: "sess-2",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T01:00:00Z",
      message_count: 5,
      commit_count: 0,
    };
    expect(info.total_message_count).toBeUndefined();
    expect(info.memories_extracted).toBeUndefined();
    expect(info.last_commit_at).toBeUndefined();
  });
});

describe("OVListSessionsEntry", () => {
  it("creates list entry", () => {
    const e: OVListSessionsEntry = {
      session_id: "sess-1",
      uri: "viking://sessions/sess-1",
      is_dir: false,
    };
    expect(e.session_id).toBe("sess-1");
    expect(e.is_dir).toBe(false);
  });

  it("accepts directory entry", () => {
    const e: OVListSessionsEntry = {
      session_id: "sess-group",
      uri: "viking://sessions/sess-group/",
      is_dir: true,
    };
    expect(e.is_dir).toBe(true);
  });
});
