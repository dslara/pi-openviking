import { vi } from "vitest";
import type { OpenVikingClient, SearchResult } from "../src/features/ov-client/client";
import type { SessionSyncLike } from "../src/session";

export function createMockClient(overrides: Partial<OpenVikingClient> = {}): OpenVikingClient {
  return {
    createSession: vi.fn(async () => "ov-sess-1"),
    sendMessage: vi.fn(async () => {}),
    search: vi.fn(async () => ({
      memories: [],
      resources: [],
      skills: [],
      total: 0,
    } as SearchResult)),
    read: vi.fn(async () => ({ content: "" })),
    fsList: vi.fn(async () => ({ uri: "", children: [] })),
    fsTree: vi.fn(async () => ({ uri: "", children: [] })),
    fsStat: vi.fn(async () => ({ uri: "", children: [] })),
    commit: vi.fn(async () => ({ session_id: "sess-1", status: "committed", task_id: "task-1", archive_uri: "viking://archived/sess-1", archived: true, trace_id: "trace-1" })),
    delete: vi.fn(async () => ({ uri: "" })),
    addResource: vi.fn(async () => ({ root_uri: "viking://resources/imported.md", status: "success", errors: [] })),
    tempUpload: vi.fn(async () => ({ temp_file_id: "tmp-1" })),
    ...overrides,
  };
}

export function createMockSessionSync(
  overrides: Partial<SessionSyncLike> = {},
): SessionSyncLike {
  return {
    getOvSessionId: vi.fn(() => "ov-sess-1"),
    flush: vi.fn(async () => {}),
    commit: vi.fn(async () => ({ session_id: "sess-1", status: "committed", task_id: "task-1", archive_uri: "viking://archived/sess-1", archived: true, trace_id: "trace-1" })),
    ...overrides,
  };
}
