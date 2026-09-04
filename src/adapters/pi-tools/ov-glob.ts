import { Type } from "@sinclair/typebox";
import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { SearchClient } from "../../domain/client/open-viking-client";

const GlobSchema = Type.Object({
  pattern: Type.String({ description: "URI glob pattern (e.g. viking://**/*.md)" }),
  uri: Type.Optional(Type.String({ description: "Base URI to search from" })),
  limit: Type.Optional(Type.Number({ description: "Maximum entries to return" })),
});

export function createOvGlobTool(client: SearchClient): ToolDefinition<typeof GlobSchema> {
  return defineTool({
    name: "ov_glob",
    label: "Discover URIs",
    description: "Discover URIs in the OpenViking knowledge base matching a glob pattern.",
    promptSnippet: "ov_glob(pattern, uri?, limit?) — discover URIs by pattern",
    parameters: GlobSchema,
    async execute(_toolCallId, params, signal) {
      try {
        const result = await client.glob(params.pattern!, params.uri, params.limit, signal ?? undefined);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          details: undefined,
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Glob failed: ${err instanceof Error ? err.message : String(err)}` }],
          details: undefined,
        };
      }
    },
  });
}
