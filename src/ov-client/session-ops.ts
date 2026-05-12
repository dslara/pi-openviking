import type { Transport } from "./transport";
import type { CommitResult, Part } from "./types";

export function createSessionOps(t: Transport, commitTimeout: number) {
  return {
    async createSession(signal?: AbortSignal): Promise<string> {
      const result = (await t.request("createSession", "/api/v1/sessions", { httpMethod: "POST" }, signal)) as { session_id: string };
      return result.session_id;
    },

    async sendMessage(sessionId: string, role: string, content: string | Part[], signal?: AbortSignal): Promise<void> {
      const body: Record<string, unknown> = typeof content === "string"
        ? { role, content }
        : { role, parts: content };
      await t.request(
        "sendMessage",
        `/api/v1/sessions/${sessionId}/messages`,
        { body },
        signal,
      );
    },

    async commit(sessionId: string, signal?: AbortSignal): Promise<CommitResult> {
      const result = (await t.request(
        "commit",
        `/api/v1/sessions/${sessionId}/commit`,
        { body: {}, timeout: commitTimeout },
        signal,
      )) as CommitResult;
      const { logger } = await import("../shared/logger");
      logger.debug("commit:", sessionId, result);
      return result;
    },
  };
}
