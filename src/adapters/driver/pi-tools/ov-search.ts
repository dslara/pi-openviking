import { Type } from "@sinclair/typebox";
import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { SearchClient } from "../../../domain/client/open-viking-client";
import type { SearchResult } from "../../../domain/knowledge/model/search-result";
import type { RecallConfig } from "../../../domain/common/recall-config";
import type { Logger } from "../../../domain/ports/logger";
import { Uri } from "../../../domain/common/uri";

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
    promptSnippet: "ov_search(query, mode?, limit?, targetUri?, scoreThreshold?, since?, until?, timeField?, level?, includeProvenance?) — search knowledge base",
    parameters: SearchSchema,
    async execute(_toolCallId, params, signal) {
      const start = Date.now();
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
        };

        let result: SearchResult;
        if (mode === "find") {
          result = await client.find(
            { query: params.query!, limit: params.limit, targetUri, peerId: params.peerId },
            opts,
            signal ?? undefined,
          );
        } else {
          result = await client.search(
            { query: params.query!, limit: params.limit, targetUri, sessionId: undefined, peerId: params.peerId },
            opts,
            signal ?? undefined,
          );
        }

        const durationMs = Date.now() - start;
        logger.info("ov_search completed", { mode, durationMs, total: result.total });

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          details: undefined,
        };
      } catch (err) {
        const durationMs = Date.now() - start;
        logger.error("ov_search failed", { durationMs, error: err instanceof Error ? err.message : String(err) });
        return {
          content: [{ type: "text" as const, text: `Search failed: ${err instanceof Error ? err.message : String(err)}` }],
          details: undefined,
        };
      }
    },
  });
}
