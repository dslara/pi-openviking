import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import type { OpenVikingClient } from "../ov-client/client";
import { defineTool } from "../shared/tool-def";
import { browseOp } from "../operations/browse";

const MEMBROWSE_PARAMS = Type.Object({
  uri: Type.String({ description: "viking:// URI to browse" }),
  view: Type.Optional(Type.Union([
    Type.Literal("list"),
    Type.Literal("tree"),
    Type.Literal("stat"),
  ], { description: "Browse view", default: "list" })),
  recursive: Type.Optional(Type.Boolean({ description: "List all descendants recursively" })),
  simple: Type.Optional(Type.Boolean({ description: "Return URI-only output" })),
});

export function registerMembrowseTool(pi: ExtensionAPI, client: OpenVikingClient) {
  defineTool(pi, { client }, {
    name: "membrowse",
    label: "Memory Browse",
    description:
      "Browse the OpenViking filesystem at a viking:// URI. " +
      "Use after memsearch to explore directories or inspect file metadata.",
    promptSnippet: "Browse the OpenViking filesystem at a viking:// URI",
    parameters: MEMBROWSE_PARAMS,
    validateUri: true,

    async execute({ params, deps, signal }) {
      const result = await browseOp(deps.client, {
        uri: params.uri,
        view: params.view ?? "list",
        recursive: params.recursive,
        simple: params.simple,
      }, signal);

      const parts: string[] = [];
      parts.push(`URI: ${result.uri}`);
      if (result.children && result.children.length > 0) {
        parts.push("Children:");
        for (const child of result.children) {
          parts.push(`- ${child.uri} (${child.type})`);
          if (child.abstract) parts.push(`  ${child.abstract}`);
        }
      } else {
        parts.push("No children.");
      }

      return { text: parts.join("\n") };
    },
  });
}
