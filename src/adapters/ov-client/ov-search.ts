/**
 * OV wire-format types for search/find endpoints.
 *
 * See OV 06-retrieval.md find/search parameter tables.
 */

export interface OVQueryPlanQuery {
  query: string;
  context_type?: string;
  intent?: string;
  priority?: number;
}

export interface OVQueryPlan {
  reasoning?: string;
  queries?: OVQueryPlanQuery[];
}

export interface OVMatchedContext {
  context_type: "memory" | "resource" | "skill";
  uri: string;
  level: number;
  score: number;
  category: string;
  match_reason: string;
  abstract: string;
  overview?: string | null;
  relations?: { relation: string; uri: string }[];
}

export interface OVFindResponse {
  memories: OVMatchedContext[];
  resources: OVMatchedContext[];
  skills: OVMatchedContext[];
  total: number;
  query_plan?: OVQueryPlan | string;
}

export interface OVFindRequest {
  query: string;
  target_uri?: string | string[];
  node_limit?: number;
  score_threshold?: number;
  since?: string;
  until?: string;
  time_field?: "updated_at" | "created_at";
  level?: string;
  filter?: Record<string, unknown>;
  include_provenance?: boolean;
  peer_id?: string;
  telemetry?: boolean | Record<string, unknown>;
}

export interface OVSearchRequest extends OVFindRequest {
  session_id?: string;
}

export interface OVGlobResponse {
  matches: string[];
  count: number;
}

export interface OVGrepMatch {
  uri: string;
  line: number;
  content: string;
}

export interface OVGrepResponse {
  matches: OVGrepMatch[];
  count: number;
}
