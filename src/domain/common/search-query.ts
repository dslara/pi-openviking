import { Uri } from "./uri";
import { SessionId } from "./session-id";

/**
 * FindQuery: simple semantic search without session context.
 * Maps to OV POST /api/v1/search/find.
 */
export interface FindQuery {
  query: string;
  limit?: number;
  targetUri?: Uri;
  peerId?: string;
}

/**
 * SearchRequest: deep search with optional session context for intent analysis.
 * Maps to OV POST /api/v1/search/search.
 */
export interface SearchRequest {
  query: string;
  limit?: number;
  sessionId?: SessionId;
  targetUri?: Uri;
  peerId?: string;
}

/**
 * SearchOptions: advanced search parameters for filtering and provenance.
 * Passed alongside FindQuery or SearchRequest.
 *
 * peerId is NOT here — it belongs on FindQuery / SearchRequest (request-level param,
 * matching OV's POST /api/v1/search/{find,search} API contract).
 */
export interface SearchOptions {
  scoreThreshold?: number;
  since?: string;
  until?: string;
  timeField?: string;
  level?: number;
  includeProvenance?: boolean;
  readContent?: boolean;
}
