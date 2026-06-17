/**
 * Adapter for OV session endpoints.
 *
 * See OV 05-sessions.md.
 */
import type { Transport } from "./transport";
import { toSessionId, toCommitResult, toTaskStatus, toSessionInfo, serializeParts } from "./mappers/session-mapper";
import type { CommitResult, CommitOptions, TaskStatus, TaskFilter, SessionInfo } from "../../../domain/client/ov-types";
import type { SessionId } from "../../../domain/common/session-id";
import type { Uri } from "../../../domain/common/uri";
import type { Part } from "../../../domain/common/part";
import type {
  OVCreateSessionResponse,
  OVCommitResponse,
  OVSessionInfo,
  OVAddMessageResponse,
  OVBatchAddMessagesResponse,
  OVSessionUsedResponse,
  OVDeleteSessionResponse,
} from "./types/ov-session";
import type { OVTaskResponse } from "./types/ov-task";

export class SessionStoreAdapter {
  private readonly commitTimeout: number;

  constructor(
    private readonly transport: Transport,
    commitTimeout: number = 120_000,
  ) {
    this.commitTimeout = commitTimeout;
  }

  async create(signal?: AbortSignal): Promise<SessionId> {
    const raw = await this.transport.request<OVCreateSessionResponse>(
      "SessionStore.create",
      "/api/v1/sessions",
      { method: "POST" },
      signal,
    );
    return toSessionId(raw);
  }

  async sendMessage(sessionId: SessionId, role: string, content: Part[], signal?: AbortSignal): Promise<void> {
    const body = JSON.stringify({
      role,
      parts: serializeParts(content),
    });
    await this.transport.request<OVAddMessageResponse>(
      "SessionStore.sendMessage",
      `/api/v1/sessions/${sessionId.value}/messages`,
      { method: "POST", body },
      signal,
    );
  }

  async sendMessages(
    sessionId: SessionId,
    messages: { role: string; content: Part[] }[],
    signal?: AbortSignal,
  ): Promise<void> {
    const body = JSON.stringify({
      messages: messages.map((msg) => ({
        role: msg.role,
        parts: serializeParts(msg.content),
      })),
    });
    await this.transport.request<OVBatchAddMessagesResponse>(
      "SessionStore.sendMessages",
      `/api/v1/sessions/${sessionId.value}/messages/batch`,
      { method: "POST", body },
      signal,
    );
  }

  async commit(sessionId: SessionId, options?: CommitOptions, signal?: AbortSignal): Promise<CommitResult> {
    const bodyObj: Record<string, unknown> = {};
    if (options?.keepRecentCount !== undefined) {
      bodyObj.keep_recent_count = options.keepRecentCount;
    }
    const body = Object.keys(bodyObj).length > 0 ? JSON.stringify(bodyObj) : undefined;

    const raw = await this.transport.request<OVCommitResponse>(
      "SessionStore.commit",
      `/api/v1/sessions/${sessionId.value}/commit`,
      body
        ? { method: "POST", body, timeout: this.commitTimeout }
        : { method: "POST", timeout: this.commitTimeout },
      signal,
    );
    return toCommitResult(raw);
  }

  async getTaskStatus(taskId: string, signal?: AbortSignal): Promise<TaskStatus> {
    const raw = await this.transport.request<OVTaskResponse>(
      "SessionStore.getTaskStatus",
      `/api/v1/tasks/${taskId}`,
      undefined,
      signal,
    );
    return toTaskStatus(raw);
  }

  async listTasks(filter?: TaskFilter, signal?: AbortSignal): Promise<TaskStatus[]> {
    const params = new URLSearchParams();
    if (filter?.taskType) params.set("task_type", filter.taskType);
    if (filter?.status) params.set("status", filter.status);
    if (filter?.resourceId) params.set("resource_id", filter.resourceId);
    if (filter?.limit !== undefined) params.set("limit", String(filter.limit));

    const query = params.toString();
    const path = query ? `/api/v1/tasks?${query}` : "/api/v1/tasks";

    const raw = await this.transport.request<OVTaskResponse[]>(
      "SessionStore.listTasks",
      path,
      undefined,
      signal,
    );
    return (Array.isArray(raw) ? raw : []).map((item) => toTaskStatus(item));
  }

  async sessionUsed(sessionId: SessionId, contexts: Uri[], signal?: AbortSignal): Promise<void> {
    const body = JSON.stringify({
      contexts: contexts.map((u) => u.value),
    });
    await this.transport.request<OVSessionUsedResponse>(
      "SessionStore.sessionUsed",
      `/api/v1/sessions/${sessionId.value}/used`,
      { method: "POST", body },
      signal,
    );
  }

  async deleteSession(sessionId: SessionId, signal?: AbortSignal): Promise<void> {
    await this.transport.request<OVDeleteSessionResponse>(
      "SessionStore.deleteSession",
      `/api/v1/sessions/${sessionId.value}`,
      { method: "DELETE" },
      signal,
    );
  }

  async getSession(sessionId: SessionId, signal?: AbortSignal): Promise<SessionInfo> {
    const raw = await this.transport.request<OVSessionInfo>(
      "SessionStore.getSession",
      `/api/v1/sessions/${sessionId.value}`,
      undefined,
      signal,
    );
    return toSessionInfo(raw);
  }

  async listSessions(signal?: AbortSignal): Promise<SessionInfo[]> {
    const raw = await this.transport.request<OVSessionInfo[]>(
      "SessionStore.listSessions",
      "/api/v1/sessions",
      undefined,
      signal,
    );
    return (Array.isArray(raw) ? raw : []).map((item) => toSessionInfo(item));
  }
}
