import type { OpenVikingClient, SearchResult } from "./client";
import type { SessionSyncLike } from "./session";

export interface AutoRecallOptions {
  limit?: number;
  timeout?: number;
  topN?: number;
  enabled?: boolean;
}

export interface AutoRecallEvent {
  prompt: string;
  systemPrompt: string;
}

export function createAutoRecall(
  client: OpenVikingClient,
  sessionSync: SessionSyncLike,
  options?: AutoRecallOptions,
): (event: AutoRecallEvent) => Promise<{ systemPrompt?: string }> {
  const limit = options?.limit ?? 10;
  const timeoutMs = options?.timeout ?? 5000;
  const topN = options?.topN ?? 5;
  const enabled = options?.enabled ?? true;

  return async function autoRecall(event: AutoRecallEvent): Promise<{ systemPrompt?: string }> {
    if (!enabled) return {};

    const sessionId = sessionSync.getOvSessionId();
    const mode = sessionId ? "deep" : "fast";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const results = await client.search(sessionId, event.prompt, limit, mode, controller.signal);
      const block = formatResults(results, topN);
      if (!block) return {};
      return { systemPrompt: `${event.systemPrompt}\n\n${block}` };
    } catch {
      return {};
    } finally {
      clearTimeout(timeout);
    }
  };
}

type CombinedItem =
  | { type: "memory"; score: number; key: string; text: string }
  | { type: "resource"; score: number; key: string; uri: string; abstract?: string };

function formatResults(results: SearchResult, topN: number, maxTokens = 500): string | undefined {
  const combined: CombinedItem[] = [];

  for (const m of results.memories) {
    combined.push({ type: "memory", score: m.score, key: m.text, text: m.text });
  }

  for (const r of results.resources) {
    const abstract = (r as Record<string, unknown>).abstract as string | undefined;
    const key = abstract ? `${abstract}|${r.uri}` : r.uri;
    combined.push({ type: "resource", score: r.score, key, uri: r.uri, abstract });
  }

  combined.sort((a, b) => b.score - a.score);

  const seen = new Set<string>();
  const top: CombinedItem[] = [];
  for (const item of combined) {
    if (seen.has(item.key)) continue;
    seen.add(item.key);
    top.push(item);
    if (top.length >= topN) break;
  }

  // Trim bottom-up until under token budget
  for (let count = top.length; count > 0; count--) {
    const block = renderBlock(top.slice(0, count));
    if (estimateTokens(block) <= maxTokens) {
      return block;
    }
  }
  return undefined;
}

function renderBlock(items: CombinedItem[]): string {
  const lines: string[] = ["<relevant-memories>"];
  for (const item of items) {
    if (item.type === "memory") {
      lines.push(`<memory score="${item.score.toFixed(2)}">${escapeXml(item.text)}</memory>`);
    } else {
      const attr = `score="${item.score.toFixed(2)}" uri="${escapeXml(item.uri)}"`;
      lines.push(`<resource ${attr}>${escapeXml(item.abstract ?? "")}</resource>`);
    }
  }
  lines.push("</relevant-memories>");
  lines.push("");
  lines.push("Use the memread tool to retrieve full content of discovered resources.");
  return lines.join("\n");
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
