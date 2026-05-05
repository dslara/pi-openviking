import type { OpenVikingClient, SearchResult } from "./client";
import type { SessionSyncLike } from "./session";

export interface AutoRecallEvent {
  prompt: string;
  systemPrompt: string;
}

export function createAutoRecall(
  client: OpenVikingClient,
  sessionSync: SessionSyncLike,
): (event: AutoRecallEvent) => Promise<{ systemPrompt?: string }> {
  return async function autoRecall(event: AutoRecallEvent): Promise<{ systemPrompt?: string }> {
    const sessionId = sessionSync.getOvSessionId();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const results = await client.search(sessionId, event.prompt, 10, "fast", controller.signal);
      const block = formatResults(results);
      if (!block) return {};
      return { systemPrompt: `${event.systemPrompt}\n\n${block}` };
    } catch {
      return {};
    } finally {
      clearTimeout(timeout);
    }
  };
}

function formatResults(results: SearchResult): string | undefined {
  const combined: Array<
    | { type: "memory"; score: number; key: string; text: string }
    | { type: "resource"; score: number; key: string; uri: string; abstract?: string }
  > = [];

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
  const top: typeof combined = [];
  for (const item of combined) {
    if (seen.has(item.key)) continue;
    seen.add(item.key);
    top.push(item);
    if (top.length >= 5) break;
  }

  if (top.length === 0) return undefined;

  const lines: string[] = ["<relevant-memories>"];
  for (const item of top) {
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

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
