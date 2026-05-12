import type { OpenVikingClient, SearchResult } from "../ov-client/client";
import { resolveSearchMode } from "../shared/search-mode";

export interface SearchInput {
  query: string;
  limit?: number;
  mode?: "auto" | "fast" | "deep";
  uri?: string;
  sessionId?: string;
}

export async function searchOp(
  client: OpenVikingClient,
  input: SearchInput,
  signal?: AbortSignal,
): Promise<SearchResult> {
  const resolvedMode = resolveSearchMode(
    input.mode ?? "auto",
    input.query,
    input.sessionId,
  );
  return client.search(
    input.sessionId,
    input.query,
    input.limit ?? 10,
    resolvedMode,
    input.uri,
    signal,
  );
}
