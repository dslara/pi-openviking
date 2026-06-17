/**
 * Adapter for OV filesystem endpoints (read, write, ls, tree, stat, mkdir, mv, delete, reindex).
 *
 * See OV 03-filesystem.md.
 */
import { Transport, sleepWithSignal } from "./transport";
import { toContent } from "./mappers/ov-mappers";
import { toWriteResult, toFsEntries, toFsEntry } from "./mappers/fs-mapper";
import type { Uri } from "../../../domain/common/uri";
import type { ContentLevel } from "../../../domain/common/content-level";
import type { WriteMode } from "../../../domain/common/write-mode";
import type { Content, FsEntry, WriteResult, ReindexMode } from "../../../domain/client/ov-types";
import { ConnectionError, ValidationError } from "../../../domain/errors/domain-error";
import type { Logger } from "../../../domain/ports/logger";
import type { OVWriteResponse, OVFsEntry } from "./types/ov-fs";
import type { OVContentReadResponse } from "./types/ov-common";

function buildQuery(
  uri: Uri,
  offset?: number,
  limit?: number,
): string {
  const params = new URLSearchParams();
  params.set("uri", uri.value);
  if (offset !== undefined) params.set("offset", String(offset));
  if (limit !== undefined) params.set("limit", String(limit));
  return params.toString();
}

function uriQuery(uri: Uri): string {
  return `uri=${encodeURIComponent(uri.value)}`;
}

/**
 * OV v0.3.24+ has three content endpoints:
 *
 *   GET /api/v1/content/read?uri=X&offset=Y&limit=Z   — full file content
 *   GET /api/v1/content/abstract?uri=X                 — L0 abstract (directories only)
 *   GET /api/v1/content/overview?uri=X                 — L1 overview (directories only)
 *
 * The abstract/overview endpoints return 412 FAILED_PRECONDITION
 * when called on a file (must be a directory).
 */
function buildReadPath(
  uri: Uri,
  level?: ContentLevel,
  offset?: number,
  limit?: number,
): string {
  const encoded = encodeURIComponent(uri.value);
  if (level === "abstract") {
    return `/api/v1/content/abstract?uri=${encoded}`;
  }
  if (level === "overview") {
    return `/api/v1/content/overview?uri=${encoded}`;
  }
  // level === "read" or undefined
  const query = buildQuery(uri, offset, limit);
  return `/api/v1/content/read?${query}`;
}

export class FsStoreAdapter {
  constructor(
    private readonly transport: Transport,
    private readonly logger?: Logger,
  ) {}

  async read(
    uri: Uri,
    level?: ContentLevel,
    offset?: number,
    limit?: number,
    signal?: AbortSignal,
  ): Promise<Content> {
    const path = buildReadPath(uri, level, offset, limit);

    const raw = await this.transport.request<OVContentReadResponse>(
      "FsStore.read",
      path,
      undefined,
      signal,
    );

    return toContent(raw, uri, level);
  }

  async write(uri: Uri, content: string, mode?: WriteMode, signal?: AbortSignal): Promise<WriteResult> {
    const body = JSON.stringify({
      uri: uri.value,
      content,
      mode,
      wait: false,
    });

    const raw = await this.transport.request<OVWriteResponse>(
      "FsStore.write",
      "/api/v1/content/write",
      { method: "POST", body },
      signal,
    );

    return toWriteResult(raw, uri.value);
  }

  async list(uri: Uri, recursive?: boolean, signal?: AbortSignal): Promise<FsEntry[]> {
    const query = recursive ? `uri=${encodeURIComponent(uri.value)}&recursive=true` : uriQuery(uri);
    const raw = await this.transport.request<OVFsEntry[]>(
      "FsStore.list",
      `/api/v1/fs/ls?${query}`,
      undefined,
      signal,
    );
    return toFsEntries(raw);
  }

  async tree(uri: Uri, signal?: AbortSignal): Promise<FsEntry[]> {
    const raw = await this.transport.request<OVFsEntry[]>(
      "FsStore.tree",
      `/api/v1/fs/tree?${uriQuery(uri)}`,
      undefined,
      signal,
    );
    return toFsEntries(raw);
  }

  async stat(uri: Uri, signal?: AbortSignal): Promise<FsEntry> {
    const raw = await this.transport.request<OVFsEntry>(
      "FsStore.stat",
      `/api/v1/fs/stat?${uriQuery(uri)}`,
      undefined,
      signal,
    );
    return toFsEntry(raw, uri.value);
  }

  async mkdir(uri: Uri, signal?: AbortSignal): Promise<void> {
    const body = JSON.stringify({ uri: uri.value });
    await this.transport.request<unknown>(
      "FsStore.mkdir",
      "/api/v1/fs/mkdir",
      { method: "POST", body },
      signal,
    );
  }

  async mv(from: Uri, to: Uri, signal?: AbortSignal): Promise<void> {
    const body = JSON.stringify({ from_uri: from.value, to_uri: to.value });
    await this.transport.request<unknown>(
      "FsStore.mv",
      "/api/v1/fs/mv",
      { method: "POST", body },
      signal,
    );
  }

  async reindex(uri: Uri, mode: ReindexMode = "vectors_only", signal?: AbortSignal): Promise<void> {
    const body = JSON.stringify({ uri: uri.value, mode });
    await this.transport.request<unknown>(
      "FsStore.reindex",
      "/api/v1/content/reindex",
      { method: "POST", body },
      signal,
    );
  }

  async delete(uri: Uri, recursive?: boolean, signal?: AbortSignal): Promise<void> {
    const query = recursive
      ? `uri=${encodeURIComponent(uri.value)}&recursive=true`
      : uriQuery(uri);

    try {
      await this.transport.request<unknown>(
        "FsStore.delete",
        `/api/v1/fs?${query}`,
        { method: "DELETE" },
        signal,
      );
    } catch (err: unknown) {
      // P12: Retry on 409 Conflict (resource being processed, e.g. indexing)
      if (err instanceof ValidationError && err.message.includes("Conflict")) {
        for (let attempt = 1; attempt <= 2; attempt++) {
          await sleepWithSignal(500, signal);
          try {
            await this.transport.request<unknown>(
              "FsStore.delete",
              `/api/v1/fs?${query}`,
              { method: "DELETE" },
              signal,
            );
            return;
          } catch (retryErr: unknown) {
            // Last attempt — log and throw
            if (attempt === 2) {
              this.logger?.error("FsStore.delete: conflict retry failed after 3 attempts", {
                uri: uri.value,
                error: (retryErr as Error).message,
              });
              throw retryErr;
            }
          }
        }
        return;
      }

      // If recursive required and we haven't tried with recursive, retry
      if (
        !recursive &&
        err instanceof ValidationError &&
        err.message.toLowerCase().includes("recursive")
      ) {
        await this.transport.request<unknown>(
          "FsStore.delete",
          `/api/v1/fs?${uriQuery(uri)}&recursive=true`,
          { method: "DELETE" },
          signal,
        );
        return;
      }

      // P11: Log raw error for server-side bugs (e.g. ENOTDIR)
      this.logger?.error("FsStore.delete: unexpected error", {
        uri: uri.value,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }
}
