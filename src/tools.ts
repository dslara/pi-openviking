import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import type { OpenVikingClient } from "./client";
import type { SessionSyncLike } from "./session";
import { defineTool } from "./tool-def";
import { resolveSearchMode } from "./search-mode";
import { resolveSource } from "./source-resolver";
import { notifyOnce } from "./notify";

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

const MEMDELETE_PARAMS = Type.Object({
  uri: Type.String({ description: "viking:// URI to delete" }),
});

const MEMIMPORT_PARAMS = Type.Object({
  source: Type.String({ description: "URL (http://, https://, git://) or local file path to import" }),
  kind: Type.Optional(Type.Union([
    Type.Literal("resource"),
    Type.Literal("skill"),
  ], { description: "Import kind: resource (default) or skill", default: "resource" })),
  reason: Type.Optional(Type.String({ description: "Optional documentation of import intent" })),
  to: Type.Optional(Type.String({ description: "Optional target URI controlling where resource lands in the viking:// tree" })),
});

export function registerMemsearchTool(pi: ExtensionAPI, client: OpenVikingClient, sync: SessionSyncLike) {
  defineTool(pi, { client, sync }, {
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
        const resolvedMode = resolveSearchMode(params.mode ?? "auto", params.query, sessionId ?? undefined);

        const results = await deps.client.search(sessionId, params.query, params.limit ?? 10, resolvedMode, params.uri, signal);

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
        console.error("[ov] search failed:", msg);
        notifyOnce(ctx, `OpenViking error: ${msg}`, "error");
        return { text: msg, isError: true };
      }
    },
  });
}

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
      const view = params.view ?? "list";

      let result;
      switch (view) {
        case "tree":
          result = await deps.client.fsTree(params.uri, signal);
          break;
        case "stat":
          result = await deps.client.fsStat(params.uri, signal);
          break;
        default:
          result = await deps.client.fsList(params.uri, signal);
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

      return { text: parts.join("\n") };
    },
  });
}

export function registerMemdeleteTool(pi: ExtensionAPI, client: OpenVikingClient) {
  defineTool(pi, { client }, {
    name: "memdelete",
    label: "Memory Delete",
    description:
      "Delete a resource or directory from the OpenViking knowledge base by viking:// URI. " +
      "OV rm is idempotent — calling again on the same URI succeeds silently.",
    promptSnippet: "Delete a resource from OpenViking by viking:// URI",
    parameters: MEMDELETE_PARAMS,
    validateUri: true,

    async execute({ params, deps, signal }) {
      const result = await deps.client.delete(params.uri, signal);

      // Post-delete verification: confirm resource no longer appears in search
      try {
        const uriParts = params.uri.replace("viking://", "").split("/");
        const resourceName = uriParts[uriParts.length - 1] || "";
        if (resourceName) {
          const searchResults = await deps.client.search(undefined, resourceName, 5, "fast", undefined, signal);
          const stillPresent = searchResults.resources.some(r => r.uri === params.uri);
          if (stillPresent) {
            return {
              text: `Deleted: ${result.uri} (warning: resource may still appear in search due to async index sync)`,
              details: { uri: result.uri, verified: false },
            };
          }
        }
      } catch (err) {
        // Verification is best-effort; don't fail the delete on search errors
        console.error("[ov] delete verification failed:", (err as Error).message);
      }

      return { text: `Deleted: ${result.uri}`, details: { uri: result.uri, verified: true } };
    },
  });
}

export function registerMemimportTool(pi: ExtensionAPI, client: OpenVikingClient) {
  defineTool(pi, { client }, {
    name: "memimport",
    label: "Memory Import",
    description:
      "Import a remote URL or local file into the OpenViking knowledge base. " +
      "Supports http://, https://, and git:// URLs, as well as local filesystem paths. " +
      "Use kind=skill to import as a skill. Optional reason and to params control metadata and placement.",
    promptSnippet: "Import a URL or local file into OpenViking",
    parameters: MEMIMPORT_PARAMS,

    async execute({ params, deps, signal }) {
      const resolved = await resolveSource(params.source, params.kind ?? "resource", params.reason, params.to);

      if (resolved.type === "directory") {
        const result = await resolved.upload(deps.client, signal);
        return { text: `Imported: ${result.root_uri} (status: ${result.status})` };
      }

      if (resolved.type === "file") {
        const upload = await deps.client.tempUpload(resolved.body, resolved.filename, signal);
        resolved.params.temp_file_id = upload.temp_file_id;
      }

      const result = await deps.client.addResource(resolved.params, signal);
      return { text: `Imported: ${result.root_uri} (status: ${result.status})` };
    },
  });
}

export function registerMemcommitTool(
  pi: ExtensionAPI,
  client: OpenVikingClient,
  sync: SessionSyncLike,
) {
  defineTool(pi, { client, sync }, {
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

    async execute({ deps, onUpdate, signal }) {
      const ovSessionId = deps.sync.getOvSessionId();
      if (!ovSessionId) {
        return { text: "No OpenViking session mapped. Start a conversation first.", isError: true };
      }

      await deps.sync.flush();
      onUpdate?.({ content: [{ type: "text", text: "Committing session to OpenViking..." }], details: {} });
      const result = await deps.client.commit(ovSessionId, signal);
      return {
        text: `Committed to OpenViking. Task: ${result.task_id}, Archived: ${result.archived}`,
        details: {
          task_id: result.task_id,
          archived: result.archived,
        },
      };
    },
  });
}
