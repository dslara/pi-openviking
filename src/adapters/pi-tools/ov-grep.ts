import { Type } from "@sinclair/typebox";
import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { SearchClient } from "../../domain/client/open-viking-client";

const GrepSchema = Type.Object({
  pattern: Type.String({ description: "Regex pattern to search for" }),
  uri: Type.Optional(Type.String({ description: "URI to search within" })),
  caseInsensitive: Type.Optional(Type.Boolean({ description: "Case-insensitive match" })),
  levelLimit: Type.Optional(Type.Number({ description: "Max content depth level" })),
  nodeLimit: Type.Optional(Type.Number({ description: "Max nodes to traverse" })),
});

export function createOvGrepTool(client: SearchClient): ToolDefinition<typeof GrepSchema> {
  return defineTool({
    name: "ov_grep",
    label: "Search Content",
    description: "Search content in the OpenViking knowledge base using a regex pattern.",
    promptSnippet: "ov_grep(pattern, uri?, caseInsensitive?, levelLimit?, nodeLimit?) — regex content search",
    parameters: GrepSchema,
    async execute(_toolCallId, params, signal) {
      try {
        const result = await client.grep(params.pattern!, {
          uri: params.uri ?? "",
          caseInsensitive: params.caseInsensitive,
          levelLimit: params.levelLimit,
          nodeLimit: params.nodeLimit,
        }, signal ?? undefined);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          details: undefined,
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Grep failed: ${err instanceof Error ? err.message : String(err)}` }],
          details: undefined,
        };
      }
    },
  });
}
