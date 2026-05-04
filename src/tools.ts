import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import type { OpenVikingClient } from "./client";

const SEARCH_PARAMS = Type.Object({
  query: Type.String({ description: "Search query to find relevant memories and resources" }),
  limit: Type.Optional(Type.Number({ description: "Maximum results to return (default 10)" })),
});

export function registerMemsearchTool(pi: ExtensionAPI, client: OpenVikingClient) {
  let sessionId: string | undefined;
  const notifiedPerCtx = new WeakMap<object, boolean>();

  pi.registerTool({
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

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      try {
        if (!sessionId) {
          sessionId = await client.createSession(signal);
        }

        const results = await client.search(sessionId, params.query, params.limit ?? 10, signal);

        if (results.total === 0) {
          return {
            content: [{ type: "text", text: "No results found." }],
            details: {},
          };
        }

        const parts: string[] = [];
        if (results.memories.length > 0) {
          parts.push("## Memories");
          for (const m of results.memories) {
            parts.push(`- [${m.score.toFixed(2)}] ${m.text}`);
          }
        }
        if (results.resources.length > 0) {
          parts.push("## Resources");
          for (const r of results.resources) {
            parts.push(`- [${r.score.toFixed(2)}] ${r.uri}`);
            if (r.abstract) parts.push(`  ${r.abstract}`);
          }
        }
        parts.push(`\nTotal: ${results.total}`);

        return {
          content: [{ type: "text", text: parts.join("\n") }],
          details: {},
        };
      } catch (err) {
        const msg = (err as Error).message;
        // First-failure notification (debounced per session)
        const ctxObj = typeof ctx === "object" && ctx !== null ? ctx : null;
        if (ctxObj && !notifiedPerCtx.get(ctxObj) && (ctxObj as any).hasUI) {
          notifiedPerCtx.set(ctxObj, true);
          (ctxObj as any).ui.notify(`OpenViking error: ${msg}`, "error");
        }
        return {
          content: [{ type: "text", text: msg }],
          details: {},
          isError: true,
        };
      }
    },
  });
}
