import type { OpenVikingConfig } from "../shared/config";
import { createTransport, OpenVikingError } from "./transport";
import type { Transport } from "./transport";
import type { OpenVikingClient, SearchResult, ReadResult } from "./types";
import { createFsOps } from "./fs-ops";
import { createSessionOps } from "./session-ops";

export { OpenVikingError };
export type { OpenVikingClient, SearchResult, ReadResult, BrowseResult, CommitResult, MemorySearchItem, ResourceSearchItem, SkillSearchItem } from "./types";

export function createClient(config: OpenVikingConfig, transport?: Transport): OpenVikingClient {
  const t = transport ?? createTransport(config);
  const fs = createFsOps(t);
  const session = createSessionOps(t, config.commitTimeout);

  return {
    ...session,

    async search(sessionId, query, limit = 10, mode = "fast", target_uri, signal?) {
      const useDeep = mode === "deep" && !!sessionId;
      const path = useDeep ? "/api/v1/search/search" : "/api/v1/search/find";
      const body: Record<string, unknown> = { query, limit };
      if (sessionId) body.session_id = sessionId;
      if (useDeep) body.mode = "deep";
      if (target_uri) body.target_uri = target_uri;
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

    ...fs,

    async delete(uri, signal?) {
      try {
        return (await t.request(
          "delete",
          `/api/v1/fs?uri=${encodeURIComponent(uri)}`,
          { httpMethod: "DELETE" },
          signal,
        )) as { uri: string };
      } catch (err) {
        const msg = (err as Error).message ?? "";
        const isDirectory = msg.includes("recursive") || msg.includes("directory");
        if (!isDirectory) throw err;
        return (await t.request(
          "delete",
          `/api/v1/fs?uri=${encodeURIComponent(uri)}&recursive=true`,
          { httpMethod: "DELETE" },
          signal,
        )) as { uri: string };
      }
    },

    async addResource(params, signal?) {
      const endpoint = params.kind === "skill" ? "/api/v1/skills" : "/api/v1/resources";
      const { kind: _kind, ...body } = params;
      if (endpoint === "/api/v1/skills" && "reason" in body) {
        delete (body as any).reason;
      }
      const result = (await t.request(
        "addResource",
        endpoint,
        { body },
        signal,
      )) as { root_uri: string; status: string; errors: string[] };
      return result;
    },

    async tempUpload(fileBody, filename, signal?) {
      const form = new FormData();
      form.append("file", new Blob([fileBody]), filename);
      const result = (await t.request(
        "tempUpload",
        "/api/v1/resources/temp_upload",
        { body: form },
        signal,
      )) as { temp_file_id: string };
      return result;
    },
  };
}
