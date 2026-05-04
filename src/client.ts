import type { OpenVikingConfig } from "./config";

export interface SearchResult {
  memories: Array<{ text: string; score: number;[k: string]: unknown }>;
  resources: Array<{ uri: string; score: number;[k: string]: unknown }>;
  total: number;
  [k: string]: unknown;
}

export interface ReadResult {
  content: string;
  [k: string]: unknown;
}

export interface BrowseResult {
  uri: string;
  children: Array<{ uri: string; type: string; abstract?: string; [k: string]: unknown }>;
  [k: string]: unknown;
}

export interface OpenVikingClient {
  createSession(signal?: AbortSignal): Promise<string>;
  sendMessage(sessionId: string, role: string, content: string, signal?: AbortSignal): Promise<void>;
  search(sessionId: string, query: string, limit?: number, signal?: AbortSignal): Promise<SearchResult>;
  read(uri: string, offset?: number, limit?: number, signal?: AbortSignal): Promise<ReadResult>;
  browse(uri: string, signal?: AbortSignal): Promise<BrowseResult>;
  commit(sessionId: string, signal?: AbortSignal): Promise<string>;
}

class OpenVikingError extends Error {
  constructor(method: string, message: string) {
    super(`OpenViking ${method} failed: ${message}`);
  }
}

export function createClient(config: OpenVikingConfig): OpenVikingClient {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-API-Key": config.apiKey,
    "X-OpenViking-Account": config.account,
    "X-OpenViking-User": config.user,
  };

  async function request(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeout);

    // Link external signal
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort);

    try {
      const res = await fetch(`${config.endpoint}${path}`, {
        method: "POST",
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const json = (await res.json()) as { status: string; result?: unknown; error?: { code: string; message: string } };

      if (!res.ok) {
        throw new OpenVikingError(method, `server error (HTTP ${res.status})`);
      }

      return json.result;
    } catch (err) {
      if (err instanceof OpenVikingError) throw err;
      if (controller.signal.aborted) {
        if (signal?.aborted) {
          throw new OpenVikingError(method, "request aborted");
        }
        throw new OpenVikingError(method, "request timed out");
      }
      throw new OpenVikingError(method, (err as Error).message);
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    }
  }

  return {
    async createSession(signal?) {
      const result = (await request("createSession", "/api/v1/sessions", undefined, signal)) as { session_id: string };
      return result.session_id;
    },

    async sendMessage(sessionId, role, content, signal?) {
      await request(
        "sendMessage",
        `/api/v1/sessions/${sessionId}/messages`,
        { role, content },
        signal,
      );
    },

    async search(sessionId, query, limit = 10, signal?) {
      return (await request(
        "search",
        "/api/v1/search/find",
        { session_id: sessionId, query, mode: "fast", limit },
        signal,
      )) as SearchResult;
    },

    async read(uri, offset, limit, signal?) {
      const params = new URLSearchParams({ uri });
      if (offset !== undefined) params.set("offset", String(offset));
      if (limit !== undefined) params.set("limit", String(limit));
      const result = (await request(
        "read",
        `/api/v1/content/read?${params.toString()}`,
        undefined,
        signal,
      )) as string;
      return { content: result };
    },

    async browse(uri, signal?) {
      return (await request(
        "browse",
        `/api/v1/content/overview?uri=${encodeURIComponent(uri)}`,
        undefined,
        signal,
      )) as BrowseResult;
    },

    async commit(sessionId, signal?) {
      const result = (await request(
        "commit",
        `/api/v1/sessions/${sessionId}/commit`,
        {},
        signal,
      )) as { task_id: string };
      return result.task_id;
    },
  };
}
