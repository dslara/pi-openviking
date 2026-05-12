import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import type { ToolRegisterDeps } from "../shared/tool-def";
import { defineTool } from "../shared/tool-def";
import { notifyOnce } from "../shared/notify";
import { searchOp } from "../operations/search";

const SEARCH_PARAMS = Type.Object({
  query: Type.String({ description: "Search query to find relevant memories and resources" }),
  limit: Type.Optional(Type.Number({ description: "Maximum results to return (default 10)" })),
  mode: Type.Optional(Type.Union([
    Type.Literal("auto"),
    Type.Literal("fast"),
    Type.Literal("deep"),
  ], { description: "Search mode: auto (default), fast (semantic), deep (context-aware with session)", default: "auto" })),
  uri: Type.Optional(Type.String({ description: "Optional viking:// URI to scope search to a specific namespace" })),
});

export function registerMemsearchTool(pi: ExtensionAPI, deps: ToolRegisterDeps) {
  defineTool(pi, deps, {
    name: "memsearch",
    label: "Memory Search",
    description:
      "Search OpenViking memory store for relevant context, memories, and resources. " +
      "Returns matching memories and resource URIs with relevance scores.",
    promptSnippet: "Search OpenViking memories and resources by query",
    promptGuidelines: [
      "Use memsearch when the user asks about past conversations, previously stored knowledge, or when you need additional context from the memory store.",
      "memsearch returns memories and resources with relevance scores — use the highest-scored results to inform your response.",
    ],
    parameters: SEARCH_PARAMS,

    async execute({ params, deps, signal, ctx }) {
      try {
        const sessionId = deps.sync.getOvSessionId();
        const results = await searchOp(deps.client, {
          query: params.query,
          limit: params.limit ?? 10,
          mode: params.mode ?? "auto",
          uri: params.uri,
          sessionId: sessionId ?? undefined,
        }, signal);

        if (results.total === 0) {
          return { text: "No results found." };
        }

        const payload: Record<string, unknown> = {
          total: results.total,
          memories: results.memories,
          resources: results.resources,
          skills: results.skills ?? [],
        };
        if (results.query_plan) {
          payload.query_plan = results.query_plan;
        }

        return { text: JSON.stringify(payload, null, 2) };
      } catch (err) {
        const msg = (err as Error).message;
        notifyOnce(ctx, `OpenViking error: ${msg}`, "error");
        return { text: msg, isError: true };
      }
    },
  });
}
