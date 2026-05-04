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
  search(sessionId: string | undefined, query: string, limit?: number, signal?: AbortSignal): Promise<SearchResult>;
  read(uri: string, level?: "abstract" | "overview" | "read", signal?: AbortSignal): Promise<ReadResult>;
  fsList(uri: string, signal?: AbortSignal): Promise<BrowseResult>;
  fsTree(uri: string, signal?: AbortSignal): Promise<BrowseResult>;
  fsStat(uri: string, signal?: AbortSignal): Promise<BrowseResult>;
  commit(sessionId: string, signal?: AbortSignal): Promise<{ task_id: string; archived: boolean }>;
}

class OpenVikingError extends Error {
  constructor(method: string, message: string) {
    super(`OpenViking ${method} failed: ${message}`);
  }
}

/** Raw OV fs/ls and fs/tree entry shape */
interface OVFsEntry {
  uri: string;
  size?: number;
  isDir?: boolean;
  modTime?: string;
  abstract?: string;
  rel_path?: string;
  [k: string]: unknown;
}

/** Raw OV fs/stat response */
interface OVStatResult {
  name: string;
  size?: number;
  mode?: number;
  modTime?: string;
  isDir?: boolean;
  [k: string]: unknown;
}

function normalizeFsEntry(e: OVFsEntry): { uri: string; type: string; abstract?: string; [k: string]: unknown } {
  return {
    uri: e.uri,
    type: e.isDir ? "directory" : "file",
    abstract: e.abstract,
    size: e.size,
    modTime: e.modTime,
  };
}

export function createClient(config: OpenVikingConfig): OpenVikingClient {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-API-Key": config.apiKey,
    "X-OpenViking-Account": config.account,
    "X-OpenViking-User": config.user,
  };

  async function request(method: string, path: string, opts?: { body?: unknown; httpMethod?: string; timeout?: number }, signal?: AbortSignal): Promise<unknown> {
    const controller = new AbortController();
    const timeoutMs = opts?.timeout ?? config.timeout;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort);

    const httpMethod = opts?.httpMethod ?? (opts?.body ? "POST" : "GET");

    try {
      const res = await fetch(`${config.endpoint}${path}`, {
        method: httpMethod,
        headers,
        body: opts?.body ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });

      const json = (await res.json()) as { status: string; result?: unknown; error?: { code: string; message: string } };

      if (!res.ok) {
        const errMsg = json.error?.message ?? `HTTP ${res.status}`;
        throw new OpenVikingError(method, `${errMsg} (HTTP ${res.status})`);
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
      const result = (await request("createSession", "/api/v1/sessions", { httpMethod: "POST" }, signal)) as { session_id: string };
      return result.session_id;
    },

    async sendMessage(sessionId, role, content, signal?) {
      await request(
        "sendMessage",
        `/api/v1/sessions/${sessionId}/messages`,
        { body: { role, content } },
        signal,
      );
    },

    async search(sessionId, query, limit = 10, signal?) {
      return (await request(
        "search",
        "/api/v1/search/find",
        { body: { session_id: sessionId, query, mode: "fast", limit } },
        signal,
      )) as SearchResult;
    },

    async read(uri, level = "read", signal?) {
      const params = new URLSearchParams({ uri });
      const result = (await request(
        "read",
        `/api/v1/content/${level}?${params.toString()}`,
        undefined,
        signal,
      )) as string;
      return { content: result };
    },

    async fsList(uri, signal?) {
      const raw = (await request(
        "fsList",
        `/api/v1/fs/ls?uri=${encodeURIComponent(uri)}`,
        undefined,
        signal,
      )) as Array<OVFsEntry>;
      return { uri, children: raw.map(normalizeFsEntry) };
    },

    async fsTree(uri, signal?) {
      const raw = (await request(
        "fsTree",
        `/api/v1/fs/tree?uri=${encodeURIComponent(uri)}`,
        undefined,
        signal,
      )) as Array<OVFsEntry>;
      return { uri, children: raw.map(normalizeFsEntry) };
    },

    async fsStat(uri, signal?) {
      const raw = (await request(
        "fsStat",
        `/api/v1/fs/stat?uri=${encodeURIComponent(uri)}`,
        undefined,
        signal,
      )) as OVStatResult;
      const entryType = raw.isDir ? "directory" : "file";
      return {
        uri,
        children: [{ uri, type: entryType, abstract: raw.name }],
      };
    },

    async commit(sessionId, signal?) {
      const result = (await request(
        "commit",
        `/api/v1/sessions/${sessionId}/commit`,
        { body: {}, timeout: config.commitTimeout },
        signal,
      )) as { task_id: string; archived: boolean };
      return result;
    },
  };
}
