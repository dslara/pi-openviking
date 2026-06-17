/**
 * Mappers for OV session endpoints.
 *
 * See OV 05-sessions.md.
 */
import { SessionId } from "../../../../domain/common/session-id";
import type { CommitResult, SessionInfo, TaskStatus } from "../../../../domain/client/ov-types";
import type { Part } from "../../../../domain/common/part";
import type { OVCreateSessionResponse, OVCommitResponse, OVSessionInfo } from "../types/ov-session";
import type { OVTaskResponse } from "../types/ov-task";

function extractMemoriesTotal(memories: Record<string, number> | undefined): number | undefined {
  if (memories === undefined) return undefined;
  if (typeof memories.total === "number") return memories.total;
  const values = Object.values(memories).filter((v): v is number => typeof v === "number");
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) : undefined;
}

// ── Session Mappers ───────────────────────────────────────────────────────────

export function toSessionId(raw: OVCreateSessionResponse | OVCommitResponse): SessionId {
  const id = raw.session_id;
  if (typeof id !== "string" || !id) {
    throw new Error("Invalid session create response: missing session_id");
  }
  return new SessionId(id);
}

export function toCommitResult(raw: OVCommitResponse): CommitResult {
  const sessionId = toSessionId(raw);
  return {
    sessionId,
    taskId: raw.task_id ?? undefined,
    archiveUri: raw.archive_uri ?? undefined,
    archived: raw.archived ?? undefined,
  };
}

export function toTaskStatus(raw: OVTaskResponse): TaskStatus {
  return {
    taskId: raw.task_id,
    status: raw.status as TaskStatus["status"],
    result: raw.result ?? undefined,
  };
}

export function toSessionInfo(raw: OVSessionInfo): SessionInfo {
  return {
    sessionId: raw.session_id,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    messageCount: raw.message_count,
    totalMessageCount: raw.total_message_count,
    commitCount: raw.commit_count,
    memoriesExtracted: extractMemoriesTotal(raw.memories_extracted),
    lastCommitAt: raw.last_commit_at,
  };
}

// ── Part Serialization ────────────────────────────────────────────────────────

const CAMEL_TO_SNAKE: Record<string, string> = {
  toolId: "tool_id",
  toolName: "tool_name",
  toolInput: "tool_input",
  toolOutput: "tool_output",
  toolStatus: "tool_status",
  toolOutputTruncated: "tool_output_truncated",
  toolUri: "tool_uri",
  skillUri: "skill_uri",
  durationMs: "duration_ms",
  promptTokens: "prompt_tokens",
  completionTokens: "completion_tokens",
  toolOutputRef: "tool_output_ref",
  contextType: "context_type",
};

function toSnake(key: string): string {
  return CAMEL_TO_SNAKE[key] ?? key;
}

export function serializePart(part: Part): Record<string, unknown> {
  const raw = part as unknown as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    result[toSnake(key)] = value;
  }
  return result;
}

export function serializeParts(parts: Part[]): Record<string, unknown>[] {
  return parts.map(serializePart);
}
