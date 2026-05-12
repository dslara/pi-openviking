import type { Transport } from "./transport";
import type { BrowseResult } from "./types";

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

export function createFsOps(t: Transport) {
  return {
    async fsList(uri: string, signal?: AbortSignal, recursive?: boolean, simple?: boolean): Promise<BrowseResult> {
      const params = new URLSearchParams({ uri });
      if (recursive !== undefined) params.set("recursive", String(recursive));
      if (simple !== undefined) params.set("simple", String(simple));
      const raw = (await t.request(
        "fsList",
        `/api/v1/fs/ls?${params.toString()}`,
        undefined,
        signal,
      )) as Array<OVFsEntry>;
      return { uri, children: raw.map(normalizeFsEntry) };
    },

    async fsTree(uri: string, signal?: AbortSignal): Promise<BrowseResult> {
      const raw = (await t.request(
        "fsTree",
        `/api/v1/fs/tree?uri=${encodeURIComponent(uri)}`,
        undefined,
        signal,
      )) as Array<OVFsEntry>;
      return { uri, children: raw.map(normalizeFsEntry) };
    },

    async fsStat(uri: string, signal?: AbortSignal): Promise<BrowseResult> {
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
  };
}
