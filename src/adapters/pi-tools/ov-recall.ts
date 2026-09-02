import { Type } from "@sinclair/typebox";
import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { RecallService, RecallResult } from "../../domain/recall/recall-service";
import type { Logger } from "../../domain/ports/logger";
import { withLogging } from "./with-logging";

const RecallSchema = Type.Object({
  prompt: Type.String({ description: "Prompt describing what to recall" }),
  limit: Type.Optional(Type.Number({ description: "Maximum number of items to return" })),
});

export function createOvRecallTool(
  svc: RecallService,
  logger: Logger,
): ToolDefinition<typeof RecallSchema> {
  return defineTool({
    name: "ov_recall",
    label: "Recall Memories",
    description: "Explicitly trigger recall of curated memories from OpenViking. Use when auto-recall didn't surface enough context or you need focused retrieval on a specific topic.",
    promptSnippet: "ov_recall(prompt, limit?) — recall relevant memories",
    parameters: RecallSchema,
    async execute(_toolCallId, params, signal) {
      try {
        const result = await withLogging<RecallResult>(logger, "ov_recall", async () => {
          const r = await svc.recall(params.prompt!);
          return { value: r, extra: { total: r.total, tokens: r.tokens } };
        });
        return {
          content: [{ type: "text" as const, text: result.formatted || "No relevant memories found." }],
          details: undefined,
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Recall failed: ${err instanceof Error ? err.message : String(err)}` }],
          details: undefined,
        };
      }
    },
  });
}
