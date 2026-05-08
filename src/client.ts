import type { OpenVikingConfig } from "./config";
import { createTransport, OpenVikingError } from "./transport";
import type { Transport } from "./transport";

export { OpenVikingError };

export interface SearchResult {
  memories: Array<{ text: string; score: number;[k: string]: unknown }>;
  resources: Array<{ uri: string; score: number;[k: string]: unknown }>;
  skills: Array<{ uri: string; score: number;[k: string]: unknown }>;
  total: number;
  query_plan?: string;
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
  search(sessionId: string | undefined, query: string, limit?: number, mode?: "fast" | "deep", signal?: AbortSignal): Promise<SearchResult>;
  read(uri: string, level?: "abstract" | "overview" | "read", signal?: AbortSignal): Promise<ReadResult>;
  fsList(uri: string, signal?: AbortSignal): Promise<BrowseResult>;
  fsTree(uri: string, signal?: AbortSignal): Promise<BrowseResult>;
  fsStat(uri: string, signal?: AbortSignal): Promise<BrowseResult>;
  commit(sessionId: string, signal?: AbortSignal): Promise<{ task_id: string; archived: boolean }>;
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

export function createClient(config: OpenVikingConfig, transport?: Transport): OpenVikingClient {
  const t = transport ?? createTransport(config);

  return {
    async createSession(signal?) {
      const result = (await t.request("createSession", "/api/v1/sessions", { httpMethod: "POST" }, signal)) as { session_id: string };
      return result.session_id;
    },

    async sendMessage(sessionId, role, content, signal?) {
      await t.request(
        "sendMessage",
        `/api/v1/sessions/${sessionId}/messages`,
        { body: { role, content } },
        signal,
      );
    },

    async search(sessionId, query, limit = 10, mode = "fast", signal?) {
      const useDeep = mode === "deep" && !!sessionId;
      const path = useDeep ? "/api/v1/search/search" : "/api/v1/search/find";
      const body: Record<string, unknown> = { query, limit };
      if (sessionId) body.session_id = sessionId;
      if (useDeep) body.mode = "deep";
      return (await t.request("search", path, { body }, signal)) as SearchResult;
    },

    async read(uri, level = "read", signal?) {
      const params = new URLSearchParams({ uri });
      const result = (await t.request(
        "read",
        `/api/v1/content/${level}?${params.toString()}`,
        undefined,
        signal,
      )) as string;
      return { content: result };
    },

    async fsList(uri, signal?) {
      const raw = (await t.request(
        "fsList",
        `/api/v1/fs/ls?uri=${encodeURIComponent(uri)}`,
        undefined,
        signal,
      )) as Array<OVFsEntry>;
      return { uri, children: raw.map(normalizeFsEntry) };
    },

    async fsTree(uri, signal?) {
      const raw = (await t.request(
        "fsTree",
        `/api/v1/fs/tree?uri=${encodeURIComponent(uri)}`,
        undefined,
        signal,
      )) as Array<OVFsEntry>;
      return { uri, children: raw.map(normalizeFsEntry) };
    },

    async fsStat(uri, signal?) {
      const raw = (await t.request(
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
      const result = (await t.request(
        "commit",
        `/api/v1/sessions/${sessionId}/commit`,
        { body: {}, timeout: config.commitTimeout },
        signal,
      )) as { task_id: string; archived: boolean };
      return result;
    },
  };
}
