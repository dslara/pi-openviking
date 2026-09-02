import { Type } from "@sinclair/typebox";
import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Uri } from "../../domain/common/uri";
import type { FsClient } from "../../domain/client/open-viking-client";

const RESOURCE_PREFIX = "viking://resources/";

const ResourceSchema = Type.Object({
  uri: Type.String({ description: "Resource URI (must start with viking://resources/)" }),
  content: Type.String({ description: "Resource content" }),
  mode: Type.Optional(
    Type.Union(
      [Type.Literal("replace"), Type.Literal("append"), Type.Literal("create")],
      { description: 'Write mode: "replace" (default), "append", "create"' },
    ),
  ),
});

export function createOvResourceTool(client: FsClient): ToolDefinition<typeof ResourceSchema> {
  return defineTool({
    name: "ov_resource",
    label: "Save Resource",
    description: "Save a resource document to the OpenViking knowledge base (viking://resources/...). Use ov_write for other URI schemes.",
    promptSnippet: "ov_resource(uri, content, mode?) — save resource document",
    parameters: ResourceSchema,
    async execute(_toolCallId, params, signal) {
      if (!params.uri!.startsWith(RESOURCE_PREFIX)) {
        return {
          content: [{ type: "text" as const, text: `Resource URI must start with ${RESOURCE_PREFIX}` }],
          details: undefined,
        };
      }
      try {
        const result = await client.save(
          new Uri(params.uri!),
          params.content!,
          params.mode,
          signal ?? undefined,
        );
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) ?? "ok" }],
          details: undefined,
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Write failed: ${err instanceof Error ? err.message : String(err)}` }],
          details: undefined,
        };
      }
    },
  });
}
