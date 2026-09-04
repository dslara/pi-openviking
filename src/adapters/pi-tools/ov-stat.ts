import { Type } from "@sinclair/typebox";
import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Uri } from "../../domain/common/uri";
import type { FsClient } from "../../domain/client/open-viking-client";

const StatSchema = Type.Object({
  uri: Type.String({ description: "URI to stat (viking://...)" }),
});

export function createOvStatTool(client: FsClient): ToolDefinition<typeof StatSchema> {
  return defineTool({
    name: "ov_stat",
    label: "Stat URI",
    description: "Get metadata for a URI in the OpenViking knowledge base.",
    promptSnippet: "ov_stat(uri) — get URI metadata",
    parameters: StatSchema,
    async execute(_toolCallId, params, signal) {
      try {
        const result = await client.stat(
          new Uri(params.uri!),
          signal ?? undefined,
        );
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          details: undefined,
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Stat failed: ${err instanceof Error ? err.message : String(err)}` }],
          details: undefined,
        };
      }
    },
  });
}
