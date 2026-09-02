/**
 * Adapter for OV search/find/glob/grep endpoints.
 *
 * See OV 06-retrieval.md and OV 03-filesystem.md (glob/grep).
 */
import type { Transport } from "./transport";
import { toSearchResult, toGlobResult, toGrepResult } from "./search-mapper";

import type { FindQuery, SearchRequest, SearchOptions } from "../../domain/common/search-query";
import type { GrepOptions } from "../../domain/client/ov-types";
import type { SearchResult } from "../../domain/knowledge/search-result";
import type { GlobResult, GrepResult } from "../../domain/client/ov-types";
import type { OVFindResponse, OVGlobResponse, OVGrepResponse } from './ov-search';

export class KnowledgeBaseAdapter {
  constructor(private readonly transport: Transport) {}

  async find(query: FindQuery, opts?: SearchOptions, signal?: AbortSignal): Promise<SearchResult> {
    const body: Record<string, unknown> = { query: query.query };
    if (query.limit !== undefined) body.node_limit = query.limit;
    if (query.targetUri) body.target_uri = query.targetUri.value;
    if (query.peerId) body.peer_id = query.peerId;
    if (opts?.scoreThreshold !== undefined) body.score_threshold = opts.scoreThreshold;
    if (opts?.since !== undefined) body.since = opts.since;
    if (opts?.until !== undefined) body.until = opts.until;
    if (opts?.timeField !== undefined) body.time_field = opts.timeField;
    if (opts?.level !== undefined) body.level = opts.level;
    if (opts?.includeProvenance !== undefined) body.include_provenance = opts.includeProvenance;

    const raw = await this.transport.request<OVFindResponse>(
      "KnowledgeBase.find",
      "/api/v1/search/find",
      { method: "POST", body: JSON.stringify(body) },
      signal,
    );

    return toSearchResult(raw);
  }

  async search(request: SearchRequest, opts?: SearchOptions, signal?: AbortSignal): Promise<SearchResult> {
    const body: Record<string, unknown> = { query: request.query };
    if (request.limit !== undefined) body.node_limit = request.limit;
    if (request.sessionId) body.session_id = request.sessionId.value;
    if (request.targetUri) body.target_uri = request.targetUri.value;
    if (request.peerId) body.peer_id = request.peerId;
    if (opts?.scoreThreshold !== undefined) body.score_threshold = opts.scoreThreshold;
    if (opts?.since !== undefined) body.since = opts.since;
    if (opts?.until !== undefined) body.until = opts.until;
    if (opts?.timeField !== undefined) body.time_field = opts.timeField;
    if (opts?.level !== undefined) body.level = opts.level;
    if (opts?.includeProvenance !== undefined) body.include_provenance = opts.includeProvenance;

    const raw = await this.transport.request<OVFindResponse>(
      "KnowledgeBase.search",
      "/api/v1/search/search",
      { method: "POST", body: JSON.stringify(body) },
      signal,
    );

    return toSearchResult(raw);
  }

  async glob(pattern: string, uri?: string, limit?: number, signal?: AbortSignal): Promise<GlobResult> {
    const body: Record<string, unknown> = { pattern };
    if (uri !== undefined) body.uri = uri;
    if (limit !== undefined) body.node_limit = limit;

    const raw = await this.transport.request<OVGlobResponse>(
      "KnowledgeBase.glob",
      "/api/v1/search/glob",
      { method: "POST", body: JSON.stringify(body) },
      signal,
    );

    return toGlobResult(raw);
  }

  async grep(pattern: string, opts?: GrepOptions, signal?: AbortSignal): Promise<GrepResult> {
    const body: Record<string, unknown> = {
      pattern,
      uri: opts?.uri ?? "",
    };
    if (opts?.caseInsensitive !== undefined) body.case_insensitive = opts.caseInsensitive;
    if (opts?.excludeUri !== undefined) body.exclude_uri = opts.excludeUri;
    if (opts?.levelLimit !== undefined) body.level_limit = opts.levelLimit;
    if (opts?.nodeLimit !== undefined) body.node_limit = opts.nodeLimit;

    const raw = await this.transport.request<OVGrepResponse>(
      "KnowledgeBase.grep",
      "/api/v1/search/grep",
      { method: "POST", body: JSON.stringify(body) },
      signal,
    );

    return toGrepResult(raw);
  }
}
