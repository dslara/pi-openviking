import { Type } from "@sinclair/typebox";
import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { ResourceStore, ResourceImportResult } from "../../../domain/ports/resource-store";
import type { Logger } from "../../../domain/ports/logger";

const ImportSchema = Type.Object({
  url: Type.String({ description: "URL to import (e.g. https://example.com/doc.md)" }),
  targetUri: Type.Optional(Type.String({ description: 'Optional target URI in OpenViking (e.g. viking://resources/guide.md)' })),
  reason: Type.Optional(Type.String({ description: "Optional reason for importing (e.g. 'User guide documentation')" })),
  wait: Type.Optional(Type.Boolean({ description: "Wait for server-side processing to complete (default: false)" })),
});

export function createOvImportTool(
  store: ResourceStore,
  logger: Logger,
): ToolDefinition<typeof ImportSchema> {
  return defineTool({
    name: "ov_import",
    label: "Import External Resource",
    description: "Import a URL, document, or Git repository into the OpenViking knowledge base as a resource. OpenViking parses Markdown, PDF, HTML, Word, images, and more. Returns the imported resource URI.",
    promptSnippet: "ov_import(url, targetUri?, reason?, wait?) — import external resource",
    parameters: ImportSchema,
    async execute(_toolCallId, params, signal) {
      const start = Date.now();
      try {
        const result = await store.importUrl(
          params.url!,
          {
            targetUri: params.targetUri ?? undefined,
            reason: params.reason ?? undefined,
            wait: params.wait ?? undefined,
          },
          signal ?? undefined,
        );
        const durationMs = Date.now() - start;
        logger.info("ov_import completed", { durationMs, status: result.status });

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          details: undefined,
        };
      } catch (err) {
        const durationMs = Date.now() - start;
        logger.error("ov_import failed", { durationMs, error: err instanceof Error ? err.message : String(err) });
        return {
          content: [{ type: "text" as const, text: `Import failed: ${err instanceof Error ? err.message : String(err)}` }],
          details: undefined,
        };
      }
    },
  });
}
