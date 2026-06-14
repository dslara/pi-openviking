import { Type } from "@sinclair/typebox";
import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Uri } from "../../../domain/common/uri";
import type { FsClient } from "../../../domain/client/open-viking-client";

const WriteSchema = Type.Object({
  action: Type.Union(
    [Type.Literal("save"), Type.Literal("mkdir"), Type.Literal("mv")],
    { description: 'Action: "save" writes content, "mkdir" creates directory, "mv" moves/renames' },
  ),
  uri: Type.String({ description: "Source URI (viking://...)" }),
  content: Type.Optional(Type.String({ description: "Content to write (save action only)" })),
  targetUri: Type.Optional(Type.String({ description: "Destination URI (mv action only)" })),
  mode: Type.Optional(
    Type.Union(
      [Type.Literal("replace"), Type.Literal("append"), Type.Literal("create")],
      { description: 'Write mode for save action: "replace" (default), "append", "create"' },
    ),
  ),
});

export function createOvWriteTool(client: FsClient): ToolDefinition<typeof WriteSchema> {
  return defineTool({
    name: "ov_write",
    label: "Write / Modify Content",
    description: "Write or modify content in the OpenViking knowledge base. Supports save, mkdir, and mv actions.",
    promptSnippet: 'ov_write(action, uri, content?, targetUri?, mode?) — write/mkdir/mv',
    parameters: WriteSchema,
    async execute(_toolCallId, params, signal) {
      try {
        let result: unknown;
        switch (params.action) {
          case "save":
            result = await client.save(
              new Uri(params.uri!),
              params.content ?? "",
              params.mode,
              signal ?? undefined,
            );
            break;
          case "mkdir":
            await client.mkdir(new Uri(params.uri!), signal ?? undefined);
            result = "ok";
            break;
          case "mv": {
            if (!params.targetUri) throw new Error("targetUri required for mv action");
            await client.mv(
              new Uri(params.uri!),
              new Uri(params.targetUri),
              signal ?? undefined,
            );
            result = "ok";
            break;
          }
          default:
            throw new Error(`Unknown action: ${params.action}`);
        }
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
