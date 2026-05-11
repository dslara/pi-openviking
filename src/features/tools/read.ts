import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import type { OpenVikingClient } from "../ov-client/client";
import { defineTool } from "../../shared/tool-def";

const MEMREAD_PARAMS = Type.Object({
  uri: Type.String({ description: "viking:// URI to read" }),
  level: Type.Optional(Type.Union([
    Type.Literal("auto"),
    Type.Literal("abstract"),
    Type.Literal("overview"),
    Type.Literal("read"),
  ], { description: "Content level (auto detects from fs/stat)", default: "auto" })),
});

export function registerMemreadTool(pi: ExtensionAPI, client: OpenVikingClient) {
  defineTool(pi, { client }, {
    name: "memread",
    label: "Memory Read",
    description:
      "Read content from a viking:// URI at a specific detail level. " +
      "Use after memsearch to retrieve full content of a discovered resource.",
    promptSnippet: "Read content from a viking:// URI",
    parameters: MEMREAD_PARAMS,
    validateUri: true,

    async execute({ params, deps, signal }) {
      const level = params.level ?? "auto";

      let resolvedLevel = level;
      if (resolvedLevel === "auto") {
        const stat = await deps.client.fsStat(params.uri, signal);
        const entry = stat.children?.[0];
        resolvedLevel = entry?.type === "directory" ? "overview" : "read";
      }
      const result = await deps.client.read(params.uri, resolvedLevel, signal);
      return { text: result.content };
    },
  });
}
