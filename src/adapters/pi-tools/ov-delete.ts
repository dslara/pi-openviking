import { Type } from "@sinclair/typebox";
import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Uri } from "../../domain/common/uri";
import type { FsClient } from "../../domain/client/open-viking-client";

const DeleteSchema = Type.Object({
  uri: Type.String({ description: "URI to delete (viking://...)" }),
  recursive: Type.Optional(Type.Boolean({ description: "Delete recursively" })),
});

export function createOvDeleteTool(client: FsClient): ToolDefinition<typeof DeleteSchema> {
  return defineTool({
    name: "ov_delete",
    label: "Delete Resource",
    description: "Delete a resource from the OpenViking knowledge base. No confirmation — agent owns its tool calls.",
    promptSnippet: "ov_delete(uri, recursive?) — delete resource",
    parameters: DeleteSchema,
    async execute(_toolCallId, params, signal) {
      try {
        await client.delete(
          new Uri(params.uri!),
          params.recursive,
          signal ?? undefined,
        );
        return {
          content: [{ type: "text" as const, text: `Deleted: ${params.uri}` }],
          details: undefined,
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Delete failed: ${err instanceof Error ? err.message : String(err)}` }],
          details: undefined,
        };
      }
    },
  });
}
