import { Type } from "@sinclair/typebox";
import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Uri } from "../../domain/common/uri";
import type { FsClient } from "../../domain/client/open-viking-client";

const TreeSchema = Type.Object({
  uri: Type.String({ description: "Root URI (viking://...)" }),
});

export function createOvTreeTool(client: FsClient): ToolDefinition<typeof TreeSchema> {
  return defineTool({
    name: "ov_tree",
    label: "Tree View",
    description: "Show the OpenViking filesystem tree recursively.",
    promptSnippet: "ov_tree(uri) — recursive tree listing",
    parameters: TreeSchema,
    async execute(_toolCallId, params, signal) {
      try {
        const result = await client.tree(
          new Uri(params.uri!),
          signal ?? undefined,
        );
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          details: undefined,
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Tree failed: ${err instanceof Error ? err.message : String(err)}` }],
          details: undefined,
        };
      }
    },
  });
}
