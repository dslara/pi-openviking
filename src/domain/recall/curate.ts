import type { SearchResult } from "../knowledge/search-result";

export interface CuratedItem {
  uri: string;
  text: string;
  score: number;
  source: "memory" | "resource" | "graph";
  category?: string;
  modTime?: string;
}

export interface CuratedResult {
  items: CuratedItem[];
  tokens: number;
  dropped: number;
}

export type Scorer = (item: CuratedItem, query: string) => number;

export interface CurateOpts {
  topN: number;
  scoreThreshold: number;
  maxTokens: number;
  scorers?: Scorer[];
  query?: string;
}

export const relevanceScorer: Scorer = (item, query) => {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return 0;
  const text = (item.text + " " + item.uri).toLowerCase();
  let hits = 0;
  for (const t of terms) if (text.includes(t)) hits++;
  return (hits / terms.length) * 0.5;
};

export const temporalScorer: Scorer = (item) => {
  if (!item.modTime) return 0;
  const then = new Date(item.modTime).getTime();
  const now = Date.now();
  const daysAgo = (now - then) / (1000 * 60 * 60 * 24);
  if (daysAgo < 0) return 0.5; // future-dated → cap
  return 0.5 * Math.exp(-daysAgo / 7); // half-life 7 days, max 0.5
};

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function merge(results: SearchResult): CuratedItem[] {
  const items: CuratedItem[] = [];
  for (const m of results.memories) {
    items.push({ uri: m.uri, text: m.abstract ?? m.text, score: m.score ?? 0, source: "memory", category: m.category, modTime: m.modTime });
  }
  for (const r of results.resources) {
    items.push({ uri: r.uri, text: r.abstract ?? "", score: r.score ?? 0, source: "resource" });
  }
  return items;
}

function dedup(items: CuratedItem[]): CuratedItem[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = item.uri;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function curate(results: SearchResult, opts: CurateOpts): CuratedResult {
  const merged = merge(results);
  const deduped = dedup(merged);
  const sorted = deduped.sort((a, b) => b.score - a.score);

  // Apply scorers if present
  const query = opts.query ?? "";
  const scorers = opts.scorers;
  const scored = scorers && scorers.length > 0
    ? sorted.map(item => {
        let bonus = 0;
        for (const s of scorers) bonus += s(item, query);
        return { ...item, score: item.score + bonus };
      }).sort((a, b) => b.score - a.score)
    : sorted;

  const aboveThreshold = scored.filter(i => i.score >= opts.scoreThreshold);
  const selected = aboveThreshold.slice(0, opts.topN);

  // Trim to budget
  let tokens = 0;
  const trimmed: CuratedItem[] = [];
  const overhead = 130;
  for (const item of selected) {
    const itemTokens = estimateTokens(item.text) + 60;
    if (tokens + itemTokens + overhead > opts.maxTokens) break;
    tokens += itemTokens;
    trimmed.push(item);
  }

  return {
    items: trimmed,
    tokens,
    dropped: merged.length - trimmed.length,
  };
}
