/**
 * RepoContext
 *
 * Fetches `viking://resources/` via FsStore.list() on session_start,
 * caches with TTL, and builds a system prompt snippet listing indexed
 * repos with tool guidance. Returns empty string when no repos indexed.
 */
import type { FsClient } from "../domain/client/open-viking-client";
import type { FsEntry } from "../domain/client/ov-types";
import type { Logger } from "../domain/ports/logger";
import { Uri } from "../domain/common/uri";

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface RepoContextConfig {
  ttlMs?: number;
}

export class RepoContext {
  private cache: { entries: string; timestamp: number } | null = null;
  private readonly ttlMs: number;

  constructor(
    private readonly fsClient: FsClient,
    private readonly logger?: Logger,
    config?: RepoContextConfig,
  ) {
    this.ttlMs = config?.ttlMs ?? DEFAULT_TTL_MS;
  }

  /**
   * Returns a formatted system prompt snippet listing resources at
   * viking://resources/. Returns empty string if nothing indexed.
   *
   * Results are cached with TTL; refresh() forces a re-fetch.
   */
  async getSystemPromptSnippet(): Promise<string> {
    const now = Date.now();
    if (this.cache && now - this.cache.timestamp < this.ttlMs) {
      return this.cache.entries;
    }

    const snippet = await this.fetchAndFormat();
    this.cache = { entries: snippet, timestamp: now };
    return snippet;
  }

  /** Force re-fetch on next getSystemPromptSnippet() call */
  invalidateCache(): void {
    this.cache = null;
  }

  private async fetchAndFormat(): Promise<string> {
    try {
      const uri = new Uri("viking://resources/");
      const entries = await this.fsClient.list(uri, false);

      if (!entries || entries.length === 0) return "";

      const lines = entries.map((e: FsEntry) => this.formatEntry(e));
      return [
        "The following resources are indexed in OpenViking:",
        ...lines,
        "",
        "Use `ov_search` to search across all resources, `ov_read` to read content, and `ov_resource` to add new resources.",
      ].join("\n");
    } catch (err) {
      this.logger?.warn("repo-context: failed to list resources", {
        error: (err as Error).message,
      });
      return "";
    }
  }

  private formatEntry(e: FsEntry): string {
    const type = e.type === "directory" ? "📁" : "📄";
    const size = e.size !== undefined ? ` (${e.size} bytes)` : "";
    return `  ${type} ${e.uri}${size}`;
  }
}
