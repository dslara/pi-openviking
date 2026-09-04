import { Type } from "@sinclair/typebox";
import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { SearchClient } from "../../domain/client/open-viking-client";
import type { SearchResult } from "../../domain/knowledge/search-result";
import type { RecallConfig } from "../../domain/common/recall-config";
import type { Logger } from "../../domain/ports/logger";
import { Uri } from "../../domain/common/uri";
import { withLogging } from "./with-logging";

const SearchSchema = Type.Object({
  query: Type.String({ description: "Search query" }),
  mode: Type.Optional(
    Type.Union(
      [Type.Literal("auto"), Type.Literal("find"), Type.Literal("search")],
      { description: 'Search mode: "auto" uses config default, "find" for simple semantic search, "search" for deep intent-aware search' },
    ),
  ),
  limit: Type.Optional(Type.Number({ description: "Maximum results" })),
  targetUri: Type.Optional(Type.String({ description: "Target URI scope" })),
  peerId: Type.Optional(Type.String({ description: "Stable interaction peer ID. When set, search includes memories from this peer" })),
  scoreThreshold: Type.Optional(Type.Number({ description: "Minimum relevance score threshold (0-1)" })),
  since: Type.Optional(Type.String({ description: "Filter results after this date/time (ISO 8601)" })),
  until: Type.Optional(Type.String({ description: "Filter results before this date/time (ISO 8601)" })),
  timeField: Type.Optional(Type.String({ description: "Time field to filter on: 'updated_at' or 'created_at'" })),
  level: Type.Optional(Type.Number({ description: "Content detail level for results" })),
  includeProvenance: Type.Optional(Type.Boolean({ description: "Include provenance information in results" })),
  readContent: Type.Optional(Type.Boolean({ description: "When true, each hit includes full visible content (OV v0.4.17+ read_content). Use sparingly — large payload" })),
});

export function createOvSearchTool(
  client: SearchClient,
  config: RecallConfig,
  logger: Logger,
): ToolDefinition<typeof SearchSchema> {
  return defineTool({
    name: "ov_search",
    label: "Search Knowledge",
    description: "Primary knowledge base for project memories, decisions, and patterns. ALWAYS check here first before using generic search tools. Supports fast (semantic find) and deep (intent-aware search) modes.",
    promptSnippet: "ov_search(query, mode?, limit?, targetUri?, scoreThreshold?, since?, until?, timeField?, level?, includeProvenance?, readContent?) — search knowledge base",
    parameters: SearchSchema,
    async execute(_toolCallId, params, signal) {
      try {
        const mode = params.mode === "auto" ? config.searchMode : (params.mode ?? config.searchMode);
        const targetUri = params.targetUri ? new Uri(params.targetUri) : undefined;
        const opts = {
          scoreThreshold: params.scoreThreshold,
          since: params.since,
          until: params.until,
          timeField: params.timeField,
          level: params.level,
          includeProvenance: params.includeProvenance,
          readContent: params.readContent,
        };
        const result = await withLogging<SearchResult>(logger, "ov_search", async () => {
          const r =
            mode === "find"
              ? await client.find(
                  { query: params.query!, limit: params.limit, targetUri, peerId: params.peerId },
                  opts,
                  signal ?? undefined,
                )
              : await client.search(
                  { query: params.query!, limit: params.limit, targetUri, sessionId: undefined, peerId: params.peerId },
                  opts,
                  signal ?? undefined,
                );
          return { value: r, extra: { mode, total: r.total } };
        });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          details: undefined,
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Search failed: ${err instanceof Error ? err.message : String(err)}` }],
          details: undefined,
        };
      }
    },
  });
}
