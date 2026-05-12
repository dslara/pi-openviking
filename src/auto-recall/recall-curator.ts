import type { SearchResult, ResourceSearchItem } from "../ov-client/client";

// ── Output ──

export interface RecallItem {
  type: "memory" | "resource";
  score: number;
  text: string;
  uri: string;
  category?: string;
  // Raw fields for scoring (populated during merge, used by rankItem)
  abstract?: string;
  overview?: string;
  rawContent?: string;
  level?: number;
}

// ── Options ──

export interface CurateOptions {
  topN: number;
  maxTokens: number;
  maxContentChars: number;
  scoreThreshold: number;
  preferAbstract: boolean;
}

export const DEFAULT_CURATE_OPTIONS: CurateOptions = {
  topN: 5,
  maxTokens: 500,
  maxContentChars: 500,
  scoreThreshold: 0.15,
  preferAbstract: true,
};

// ── Score clamping ──

function clampScore(value: number | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

// ── Query profiling ──

const STOPWORDS = new Set([
  "what", "when", "where", "which", "who", "whom", "whose", "why", "how",
  "did", "does", "is", "are", "was", "were", "the", "and", "for", "with",
  "from", "that", "this", "your", "you",
]);

const TOKEN_RE = /[a-z0-9]{2,}/gi;

const PREFERENCE_RE = /prefer|preference|favorite|favourite|like/i;
const TEMPORAL_RE = /when|what time|date|day|month|year|yesterday|today|tomorrow|last|next/i;

export interface QueryProfile {
  tokens: string[];
  wantsPreference: boolean;
  wantsTemporal: boolean;
}

export function buildQueryProfile(query: string): QueryProfile {
  const text = query.trim();
  const allTokens = text.toLowerCase().match(TOKEN_RE) ?? [];
  const tokens = allTokens.filter((t) => !STOPWORDS.has(t));
  return {
    tokens,
    wantsPreference: PREFERENCE_RE.test(text),
    wantsTemporal: TEMPORAL_RE.test(text),
  };
}

// ── Category helpers ──

function isEventMemory(item: RecallItem): boolean {
  const cat = (item.category ?? "").toLowerCase();
  return cat === "events" || item.uri.includes("/events/");
}

function isPreferencesMemory(item: RecallItem): boolean {
  const cat = (item.category ?? "").toLowerCase();
  return cat === "preferences" || item.uri.includes("/preferences/") || item.uri.endsWith("/preferences");
}

function isLeafLike(item: RecallItem): boolean {
  return item.level === 2;
}

// ── Multi-factor scoring ──

export function lexicalOverlapBoost(tokens: string[], text: string): number {
  if (tokens.length === 0 || !text) return 0;
  const haystack = ` ${text.toLowerCase()} `;
  let matched = 0;
  for (const token of tokens.slice(0, 8)) {
    if (haystack.includes(` ${token} `) || haystack.includes(token)) {
      matched += 1;
    }
  }
  return Math.min(0.2, (matched / Math.min(tokens.length, 4)) * 0.2);
}

export function rankItem(item: RecallItem, profile: QueryProfile): number {
  const baseScore = clampScore(item.score);
  const abstract = (item.abstract ?? item.overview ?? "").trim();
  const leafBoost = isLeafLike(item) ? 0.12 : 0;
  const eventBoost = profile.wantsTemporal && isEventMemory(item) ? 0.1 : 0;
  const prefBoost = profile.wantsPreference && isPreferencesMemory(item) ? 0.08 : 0;
  const overlapBoost = lexicalOverlapBoost(profile.tokens, `${item.uri} ${abstract}`);
  return baseScore + leafBoost + eventBoost + prefBoost + overlapBoost;
}

// ── Dedup ──

function normalizeDedupeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function isEventOrCaseMemory(item: RecallItem): boolean {
  const cat = (item.category ?? "").toLowerCase();
  const uri = item.uri.toLowerCase();
  return cat === "events" || cat === "cases" || uri.includes("/events/") || uri.includes("/cases/");
}

function getDedupeKey(item: RecallItem): string {
  if (item.type === "resource") return `resource:${item.uri}`;
  const abstract = normalizeDedupeText(item.abstract ?? item.overview ?? "");
  const cat = (item.category ?? "").toLowerCase() || "unknown";
  if (abstract && !isEventOrCaseMemory(item)) {
    return `abstract:${cat}:${abstract}`;
  }
  return `uri:${item.uri}`;
}

// ── Truncation ──

function truncate(text: string, maxChars: number): string {
  if (!text) return "";
  return text.length > maxChars ? text.slice(0, maxChars) + "..." : text;
}

// ── Token estimation ──

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ── Step 1: Merge search results into RecallItem[] ──

function mergeResults(results: SearchResult): RecallItem[] {
  const items: RecallItem[] = [];

  for (const m of results.memories) {
    items.push({
      type: "memory",
      score: m.score,
      text: "",
      uri: m.uri,
      category: m.category,
      abstract: m.abstract,
      overview: m.overview,
      rawContent: m.content ?? m.text,
      level: m.level,
    });
  }

  for (const r of results.resources) {
    items.push({
      type: "resource",
      score: r.score,
      text: "",
      uri: r.uri,
      abstract: (r as ResourceSearchItem).abstract,
    });
  }

  return items;
}

// ── Step 2: Score, sort, dedup, select ──

export function pickItems(
  items: RecallItem[],
  limit: number,
  query: string,
  scoreThreshold: number = 0,
): RecallItem[] {
  if (items.length === 0 || limit <= 0) return [];

  const profile = buildQueryProfile(query);

  // Score + sort
  const scored = items.map((item) => ({
    item,
    compositeScore: rankItem(item, profile),
  }));
  scored.sort((a, b) => b.compositeScore - a.compositeScore);

  // Dedup
  const seen = new Set<string>();
  const deduped: Array<{ item: RecallItem; compositeScore: number }> = [];
  for (const s of scored) {
    const key = getDedupeKey(s.item);
    if (seen.has(key)) continue;
    seen.add(key);
    s.item.score = s.compositeScore;
    deduped.push(s);
  }

  // Filter by threshold, prefer leaves, take limit
  const leaves = deduped.filter(
    (s) => isLeafLike(s.item) && clampScore(s.compositeScore) >= scoreThreshold,
  );

  const picked: RecallItem[] = [];
  const usedUris = new Set<string>();

  // Fill with leaves first
  for (const s of leaves) {
    if (picked.length >= limit) break;
    if (s.item.uri) usedUris.add(s.item.uri);
    picked.push(s.item);
  }

  // Supplement with non-leaves
  for (const s of deduped) {
    if (picked.length >= limit) break;
    if (s.item.uri && usedUris.has(s.item.uri)) continue;
    if (clampScore(s.compositeScore) < scoreThreshold) continue;
    if (s.item.uri) usedUris.add(s.item.uri);
    picked.push(s.item);
  }

  return picked;
}

// ── Step 3: Truncate display text ──

export function truncateItems(
  items: RecallItem[],
  maxContentChars: number,
  preferAbstract: boolean,
): RecallItem[] {
  return items.map((item) => {
    const displayText = preferAbstract && item.abstract
      ? truncate(item.abstract, maxContentChars)
      : truncate(item.rawContent ?? item.abstract ?? "", maxContentChars);
    return { ...item, text: displayText };
  });
}

// ── Step 4: Budget trim ──

export function trimToBudget(items: RecallItem[], maxTokens: number): RecallItem[] {
  const wrapperOverhead = 130;
  const itemOverhead = 60;
  for (let count = items.length; count > 0; count--) {
    const subset = items.slice(0, count);
    const totalOverhead = wrapperOverhead + count * itemOverhead;
    const budgetForText = Math.max(0, maxTokens - Math.ceil(totalOverhead / 4));
    const totalTokens = subset.reduce((sum, i) => sum + estimateTokens(i.text), 0);
    if (totalTokens <= budgetForText) {
      return subset;
    }
  }
  return [];
}

// ── Main ──

export function curate(
  results: SearchResult,
  query: string,
  options: CurateOptions = DEFAULT_CURATE_OPTIONS,
): RecallItem[] {
  const merged = mergeResults(results);
  const picked = pickItems(merged, options.topN, query, options.scoreThreshold);
  const truncated = truncateItems(picked, options.maxContentChars, options.preferAbstract);
  return trimToBudget(truncated, options.maxTokens);
}
