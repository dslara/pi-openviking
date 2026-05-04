import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import type { OpenVikingClient } from "./client";
import type { SessionSyncLike } from "./session";

const SEARCH_PARAMS = Type.Object({
  query: Type.String({ description: "Search query to find relevant memories and resources" }),
  limit: Type.Optional(Type.Number({ description: "Maximum results to return (default 10)" })),
});

const MEMREAD_PARAMS = Type.Object({
  uri: Type.String({ description: "viking:// URI to read" }),
  level: Type.Optional(Type.Union([
    Type.Literal("auto"),
    Type.Literal("abstract"),
    Type.Literal("overview"),
    Type.Literal("read"),
  ], { description: "Content level (auto detects from fs/stat)", default: "auto" })),
});

const MEMBROWSE_PARAMS = Type.Object({
  uri: Type.String({ description: "viking:// URI to browse" }),
  view: Type.Optional(Type.Union([
    Type.Literal("list"),
    Type.Literal("tree"),
    Type.Literal("stat"),
  ], { description: "Browse view", default: "list" })),
});

export function registerMemreadTool(pi: ExtensionAPI, client: OpenVikingClient) {
  pi.registerTool({
    name: "memread",
    label: "Memory Read",
    description:
      "Read content from a viking:// URI at a specific detail level. " +
      "Use after memsearch to retrieve full content of a discovered resource.",
    promptSnippet: "Read content from a viking:// URI",
    parameters: MEMREAD_PARAMS,

    async execute(_toolCallId, params, signal) {
      const uri = params.uri as string;
      if (!uri.startsWith("viking://")) {
        return {
          content: [{ type: "text", text: "Invalid URI: must start with viking://" }],
          details: {},
          isError: true,
        };
      }

      const level = (params.level as "auto" | "abstract" | "overview" | "read" | undefined) ?? "auto";

      try {
        let resolvedLevel = level;
        if (resolvedLevel === "auto") {
          const stat = await client.fsStat(uri, signal);
          const entry = stat.children?.[0];
          resolvedLevel = entry?.type === "directory" ? "overview" : "read";
        }
        const result = await client.read(uri, resolvedLevel, signal);
        return {
          content: [{ type: "text", text: result.content }],
          details: {},
        };
      } catch (err) {
        const msg = (err as Error).message;
        return {
          content: [{ type: "text", text: msg }],
          details: {},
          isError: true,
        };
      }
    },
  });
}

export function registerMembrowseTool(pi: ExtensionAPI, client: OpenVikingClient) {
  pi.registerTool({
    name: "membrowse",
    label: "Memory Browse",
    description:
      "Browse the OpenViking filesystem at a viking:// URI. " +
      "Use after memsearch to explore directories or inspect file metadata.",
    promptSnippet: "Browse the OpenViking filesystem at a viking:// URI",
    parameters: MEMBROWSE_PARAMS,

    async execute(_toolCallId, params, signal) {
      const uri = params.uri as string;
      if (!uri.startsWith("viking://")) {
        return {
          content: [{ type: "text", text: "Invalid URI: must start with viking://" }],
          details: {},
          isError: true,
        };
      }

      const view = (params.view as "list" | "tree" | "stat" | undefined) ?? "list";

      try {
        let result;
        switch (view) {
          case "tree":
            result = await client.fsTree(uri, signal);
            break;
          case "stat":
            result = await client.fsStat(uri, signal);
            break;
          default:
            result = await client.fsList(uri, signal);
            break;
        }

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

        return {
          content: [{ type: "text", text: parts.join("\n") }],
          details: {},
        };
      } catch (err) {
        const msg = (err as Error).message;
        return {
          content: [{ type: "text", text: msg }],
          details: {},
          isError: true,
        };
      }
    },
  });
}

export function registerMemcommitTool(
  pi: ExtensionAPI,
  client: OpenVikingClient,
  sync: SessionSyncLike,
) {
  pi.registerTool({
    name: "memcommit",
    label: "Memory Commit",
    description:
      "Commit the current conversation to OpenViking long-term memory. " +
      "Flushes pending messages and triggers background memory extraction.",
    promptSnippet: "Commit conversation to OpenViking memory",
    promptGuidelines: [
      "Use memcommit when the user explicitly asks to save the conversation to memory.",
      "memcommit requires an active OpenViking session. If no session exists, inform the user to start a conversation first.",
    ],
    parameters: Type.Object({}),

    async execute(_toolCallId, _params, signal) {
      const ovSessionId = sync.getOvSessionId();
      if (!ovSessionId) {
        return {
          content: [{ type: "text", text: "No OpenViking session mapped. Start a conversation first." }],
          details: {},
          isError: true,
        };
      }

      try {
        await sync.flush();
        const result = await client.commit(ovSessionId, signal);
        return {
          content: [{ type: "text", text: `Committed to OpenViking. Task: ${result.task_id}, Archived: ${result.archived}` }],
          details: {
            task_id: result.task_id,
            archived: result.archived,
            memories_extracted: 0,
          },
        };
      } catch (err) {
        const msg = (err as Error).message;
        return {
          content: [{ type: "text", text: msg }],
          details: {},
          isError: true,
        };
      }
    },
  });
}

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
