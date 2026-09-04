import type { SearchClient } from "../client/open-viking-client";
import type { RecallCurator } from "./recall-curator";
import type { CuratedItem, CuratedResult } from "./curate";
import type { RecallConfig } from "../common/recall-config";
import type { Logger } from "../ports/logger";
import { ConnectionError } from "../errors/domain-error";
import { Uri } from "../common/uri";
import type { SessionId } from "../common/session-id";
import { setTimeout, clearTimeout } from "node:timers";

export interface RecallResult {
  items: CuratedItem[];
  tokens: number;
  formatted: string;
  total: number;
  /** true when OV search timed out — recall will retry on next turn */
  timedOut?: boolean;
}

export class RecallService {
  private cooldownTurns = 0;

  constructor(
    private readonly kb: SearchClient,
    private readonly curator: RecallCurator,
    private readonly config: RecallConfig,
    private readonly logger: Logger,
    private enabled: boolean,
  ) {}

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.logger.info(`recall ${enabled ? "enabled" : "disabled"}`);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async recall(prompt: string, sessionId?: SessionId): Promise<RecallResult> {
    if (!this.enabled) {
      return { items: [], tokens: 0, formatted: "", total: 0, timedOut: false };
    }

    // Cooldown guard: skip if OV recently timed out
    if (this.cooldownTurns > 0) {
      this.cooldownTurns--;
      this.logger.debug(`recall in cooldown (${this.cooldownTurns} turns remaining), skipping`);
      return { items: [], tokens: 0, formatted: '', total: 0, timedOut: false };
    }

    const timeoutMs = this.config.recallSearchTimeout ?? 10000;
    const targetUri = this.config.targetUri ? new Uri(this.config.targetUri) : undefined;

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort(new DOMException("Timeout", "TimeoutError"));
    }, timeoutMs);

    try {
      const result = this.config.searchMode === "find"
        ? await this.kb.find({ query: prompt, limit: this.config.topN, targetUri }, undefined, abortController.signal)
        : await this.kb.search({ query: prompt, limit: this.config.topN, sessionId, targetUri }, undefined, abortController.signal);

      // Success clears cooldown
      this.cooldownTurns = 0;

      const curated: CuratedResult = await this.curator.curate(result);
      return {
        items: curated.items,
        tokens: curated.tokens,
        formatted: this.formatItems(curated.items),
        total: curated.items.length,
      };
    } catch (err) {
      const isTimeout = abortController.signal.aborted;

      // ConnectionError from transport (OV down, timeout, abort)
      if (err instanceof ConnectionError) {
        this.logger.warn(
          isTimeout
            ? `OV search timed out after ${timeoutMs}ms, skipping recall`
            : `OV unavailable, skipping recall`,
        );
        // Enter cooldown on timeout to avoid hammering saturated OV
        if (isTimeout) {
          this.cooldownTurns = 3;
        }
        return { items: [], tokens: 0, formatted: '', total: 0, timedOut: isTimeout };
      }

      // DOMException (signal abort/timeout not caught by transport) — handle gracefully
      if (
        err instanceof DOMException ||
        (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError"))
      ) {
        this.logger.warn(
          isTimeout
            ? `OV search timed out after ${timeoutMs}ms (DOMException), skipping recall`
            : `OV search aborted, skipping recall`,
        );
        if (isTimeout) {
          this.cooldownTurns = 3;
        }
        return { items: [], tokens: 0, formatted: '', total: 0, timedOut: isTimeout };
      }

      // TypeError (e.g. .trim() on undefined, null propagation in pipeline)
      // — protect against any unexpected null/type errors in recall pipeline
      if (err instanceof TypeError) {
        this.logger.warn(`recall: TypeError in pipeline — ${(err as Error).message}`, { error: (err as Error).stack });
        return { items: [], tokens: 0, formatted: '', total: 0, timedOut: false };
      }

      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private formatItems(items: CuratedItem[]): string {
    if (items.length === 0) return "";
    const header = "📋 OpenViking found relevant memories. Use `ov_search` to explore deeper or `ov_recall` for targeted search on a specific topic.";
    const body = items.map(i => `[${i.source}] ${i.uri}\n${i.text}`).join("\n\n");
    return `${header}\n---\n${body}`;
  }
}
