import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import type { ToolRegisterDeps } from "../shared/tool-def";
import { defineTool } from "../shared/tool-def";
import { commitOp } from "../operations/commit";

export function registerMemcommitTool(
  pi: ExtensionAPI,
  deps: ToolRegisterDeps,
) {
  defineTool(pi, deps, {
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
      try {
        onUpdate?.({ content: [{ type: "text", text: "Committing session to OpenViking..." }], details: {} });
        const result = await commitOp(deps.sync);
        return {
          text: `Committed to OpenViking. Task: ${result.task_id}, Archived: ${result.archived}`,
          details: {
            task_id: result.task_id,
            archived: result.archived,
          },
        };
      } catch (err) {
        return {
          text: (err as Error).message,
          isError: true,
        };
      }
    },
  });
}
