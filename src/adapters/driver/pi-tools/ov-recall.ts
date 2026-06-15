import { Type } from "@sinclair/typebox";
import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { RecallService, RecallResult } from "../../../domain/recall/recall-service";
import type { Logger } from "../../../domain/ports/logger";

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
      const start = Date.now();
      try {
        const result = await svc.recall(params.prompt!);
        const durationMs = Date.now() - start;
        logger.info("ov_recall completed", { durationMs, total: result.total, tokens: result.tokens });
        return {
          content: [{ type: "text" as const, text: result.formatted || "No relevant memories found." }],
          details: undefined,
        };
      } catch (err) {
        const durationMs = Date.now() - start;
        logger.error("ov_recall failed", { durationMs, error: err instanceof Error ? err.message : String(err) });
        return {
          content: [{ type: "text" as const, text: `Recall failed: ${err instanceof Error ? err.message : String(err)}` }],
          details: undefined,
        };
      }
    },
  });
}
