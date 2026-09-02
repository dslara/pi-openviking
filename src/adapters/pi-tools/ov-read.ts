import { Type } from "@sinclair/typebox";
import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Uri } from "../../domain/common/uri";
import type { FsClient } from "../../domain/client/open-viking-client";

const ReadSchema = Type.Object({
  uri: Type.String({ description: "URI to read (viking://...)" }),
  level: Type.Optional(
    Type.Union(
      [Type.Literal("abstract"), Type.Literal("overview"), Type.Literal("read")],
      { description: 'Content depth: "abstract" (L0), "overview" (L1), "read" (L2 full)' },
    ),
  ),
  offset: Type.Optional(Type.Number({ description: "Line offset for L2 pagination" })),
  limit: Type.Optional(Type.Number({ description: "Max lines for L2 pagination" })),
});

export function createOvReadTool(client: FsClient): ToolDefinition<typeof ReadSchema> {
  return defineTool({
    name: "ov_read",
    label: "Read Content",
    description: "Read content from the OpenViking knowledge base at L0 (abstract), L1 (overview), or L2 (full read) with optional pagination.",
    promptSnippet: "ov_read(uri, level?, offset?, limit?) — read content at abstract/overview/read level",
    parameters: ReadSchema,
    async execute(_toolCallId, params, signal) {
      try {
        const result = await client.read(
          new Uri(params.uri!),
          params.level,
          params.offset,
          params.limit,
          signal ?? undefined,
        );
        return {
          content: [{ type: "text" as const, text: result.body }],
          details: undefined,
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Read failed: ${err instanceof Error ? err.message : String(err)}` }],
          details: undefined,
        };
      }
    },
  });
}
