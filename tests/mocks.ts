import { vi } from "vitest";
import type { OpenVikingClient, SearchResult } from "../src/client";
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
    commit: vi.fn(async () => ({ task_id: "task-1", archived: true })),
    ...overrides,
  };
}

export function createMockSessionSync(
  overrides: Partial<SessionSyncLike> = {},
): SessionSyncLike {
  return {
    getOvSessionId: vi.fn(() => "ov-sess-1"),
    flush: vi.fn(async () => {}),
    ...overrides,
  };
}
