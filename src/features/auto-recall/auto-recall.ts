import type { OpenVikingClient } from "../ov-client/client";
import type { SessionSyncLike } from "../session-sync/session";
import { logger } from "../../shared/logger";
import { curate, DEFAULT_CURATE_OPTIONS, type CurateOptions, type CuratedItem } from "./recall-curator";

export interface AutoRecallState {
  enabled: boolean;
}

export interface AutoRecallOptions {
  limit?: number;
  timeout?: number;
  topN?: number;
  curateOptions?: Partial<CurateOptions>;
}

export interface AutoRecallEvent {
  prompt: string;
  systemPrompt: string;
}

export function createAutoRecall(
  client: OpenVikingClient,
  sessionSync: SessionSyncLike,
  state: AutoRecallState,
  options?: AutoRecallOptions,
): (event: AutoRecallEvent) => Promise<{ systemPrompt?: string }> {
  const limit = options?.limit ?? 10;
  const timeoutMs = options?.timeout ?? 5000;
  const curateOptions: CurateOptions = {
    ...DEFAULT_CURATE_OPTIONS,
    topN: options?.topN ?? DEFAULT_CURATE_OPTIONS.topN,
    ...options?.curateOptions,
  };

  return async function autoRecall(event: AutoRecallEvent): Promise<{ systemPrompt?: string }> {
    if (!state.enabled) return {};

    const sessionId = sessionSync.getOvSessionId();
    const mode = sessionId ? "deep" : "fast";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const results = await client.search(sessionId, event.prompt, limit, mode, undefined, controller.signal);
      const items = curate(results, event.prompt, curateOptions);
      if (items.length === 0) return {};
      const block = renderBlock(items);
      return { systemPrompt: `${event.systemPrompt}\n\n${block}` };
    } catch (err) {
      logger.error("auto-recall failed:", (err as Error).message);
      return {};
    } finally {
      clearTimeout(timeout);
    }
  };
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderBlock(items: CuratedItem[]): string {
  const lines: string[] = ["<relevant-memories>"];
  for (const item of items) {
    if (item.type === "memory") {
      lines.push(`<memory score="${item.score.toFixed(2)}">${escapeXml(item.text)}</memory>`);
    } else {
      const attr = `score="${item.score.toFixed(2)}" uri="${escapeXml(item.uri ?? "")}"`;
      lines.push(`<resource ${attr}>${escapeXml(item.text)}</resource>`);
    }
  }
  lines.push("</relevant-memories>");
  lines.push("");
  lines.push("Use the memread tool to retrieve full content of discovered resources.");
  return lines.join("\n");
}
