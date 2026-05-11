import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import type { OpenVikingClient } from "../ov-client/client";
import type { SessionSyncLike } from "../session-sync/session";
import { defineTool } from "../shared/tool-def";

export function registerMemcommitTool(
  pi: ExtensionAPI,
  client: OpenVikingClient,
  sync: SessionSyncLike,
) {
  defineTool(pi, { client, sync }, {
    name: "memcommit",
    label: "Memory Commit",
    description:
      "Commit the current conversation to OpenViking long-term memory. " +
      "Flushes pending messages and triggers background memory extraction.",
    promptSnippet: "Commit conversation to OpenViking memory",
    promptGuidelines: [
      "Use memcommit when the user explicitly asks to save the conversation to memory.",
      "memcommit requires an active OpenViking session. If no session exists, inform the user to start a conversation first.",
    ],
    parameters: Type.Object({}),

    async execute({ deps, onUpdate, signal }) {
      const ovSessionId = deps.sync.getOvSessionId();
      if (!ovSessionId) {
        return { text: "No OpenViking session mapped. Start a conversation first.", isError: true };
      }

      await deps.sync.flush();
      onUpdate?.({ content: [{ type: "text", text: "Committing session to OpenViking..." }], details: {} });
      const result = await deps.client.commit(ovSessionId, signal);
      return {
        text: `Committed to OpenViking. Task: ${result.task_id}, Archived: ${result.archived}`,
        details: {
          task_id: result.task_id,
          archived: result.archived,
        },
      };
    },
  });
}
