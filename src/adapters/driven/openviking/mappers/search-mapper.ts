/**
 * Mappers for OV search/find/glob/grep endpoints.
 *
 * See OV 06-retrieval.md and OV 03-filesystem.md (glob/grep).
 */
import type { SearchResult } from "../../../../domain/knowledge/model/search-result";
import type { KnowledgeItem } from "../../../../domain/knowledge/model/knowledge-item";
import type { ResourceItem } from "../../../../domain/knowledge/model/resource-item";
import type { SkillItem } from "../../../../domain/knowledge/model/skill-item";
import type { GlobResult, GrepResult } from "../../../../domain/client/ov-types";
import type { OVFindResponse, OVMatchedContext, OVGlobResponse, OVGrepResponse } from "../types/ov-search";

function toKnowledgeItem(raw: OVMatchedContext): KnowledgeItem {
  return {
    uri: raw.uri,
    text: raw.abstract || "",
    abstract: raw.abstract,
    overview: raw.overview ?? undefined,
    score: raw.score,
    category: raw.category,
    level: raw.level,
    modTime: undefined, // OVMatchedContext doesn't have modTime
    contextType: raw.context_type ?? undefined,
    matchReason: raw.match_reason ?? undefined,
  };
}

function toResourceItem(raw: OVMatchedContext): ResourceItem {
  return {
    uri: raw.uri,
    score: raw.score,
    abstract: raw.abstract,
  };
}

function toSkillItem(raw: OVMatchedContext): SkillItem {
  return {
    uri: raw.uri,
    score: raw.score,
    abstract: raw.abstract,
  };
}

export function toSearchResult(raw: OVFindResponse): SearchResult {
  // OV returns `query_plan` (snake_case) as object with reasoning/queries
  let queryPlan: string | undefined;
  const qp = raw.query_plan;
  if (typeof qp === "string") {
    queryPlan = qp;
  } else if (qp && typeof qp === "object") {
    queryPlan = JSON.stringify(qp);
  }

  return {
    memories: raw.memories.map(toKnowledgeItem),
    resources: raw.resources.map(toResourceItem),
    skills: raw.skills.map(toSkillItem),
    total: raw.total,
    queryPlan,
  };
}

export function toGlobResult(raw: OVGlobResponse): GlobResult {
  return {
    entries: raw.matches,
    total: raw.count,
  };
}

export function toGrepResult(raw: OVGrepResponse): GrepResult {
  const matches = raw.matches.map((m) => ({
    uri: m.uri,
    line: m.line,
    content: m.content,
  }));
  return {
    matches,
    total: raw.count,
  };
}
