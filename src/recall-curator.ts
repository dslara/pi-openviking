import type { SearchResult, MemorySearchItem } from "./client";

// ── Output ──

export interface CuratedItem {
  type: "memory" | "resource";
  score: number;
  text: string;
  uri?: string;
  category?: string;
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

interface QueryProfile {
  tokens: string[];
  wantsPreference: boolean;
  wantsTemporal: boolean;
}

function buildQueryProfile(query: string): QueryProfile {
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

function isEventMemory(item: MemorySearchItem): boolean {
  const cat = (item.category ?? "").toLowerCase();
  return cat === "events" || item.uri.includes("/events/");
}

function isPreferencesMemory(item: MemorySearchItem): boolean {
  const cat = (item.category ?? "").toLowerCase();
  return cat === "preferences" || item.uri.includes("/preferences/") || item.uri.endsWith("/preferences");
}

function isLeafLike(item: MemorySearchItem): boolean {
  return item.level === 2;
}

// ── Multi-factor scoring ──

function lexicalOverlapBoost(tokens: string[], text: string): number {
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

interface ScoredItem {
  item: CuratedItem;
  compositeScore: number;
}

function scoreItem(
  item: CuratedItem,
  original: MemorySearchItem | undefined,
  profile: QueryProfile,
): number {
  const baseScore = clampScore(item.score);
  const abstract = original
    ? (original.abstract ?? original.overview ?? "").trim()
    : "";
  const leafBoost = original && isLeafLike(original) ? 0.12 : 0;
  const eventBoost = profile.wantsTemporal && original && isEventMemory(original) ? 0.1 : 0;
  const prefBoost = profile.wantsPreference && original && isPreferencesMemory(original) ? 0.08 : 0;
  const overlapBoost = lexicalOverlapBoost(profile.tokens, `${item.uri ?? ""} ${abstract}`);
  return baseScore + leafBoost + eventBoost + prefBoost + overlapBoost;
}

// ── Dedup ──

function normalizeDedupeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function isEventOrCaseMemory(item: MemorySearchItem): boolean {
  const cat = (item.category ?? "").toLowerCase();
  const uri = item.uri.toLowerCase();
  return cat === "events" || cat === "cases" || uri.includes("/events/") || uri.includes("/cases/");
}

function getMemoryDedupeKey(original: MemorySearchItem): string {
  const abstract = normalizeDedupeText(original.abstract ?? original.overview ?? "");
  const cat = (original.category ?? "").toLowerCase() || "unknown";
  if (abstract && !isEventOrCaseMemory(original)) {
    return `abstract:${cat}:${abstract}`;
  }
  return `uri:${original.uri}`;
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

// ── Main ──

export function curate(
  results: SearchResult,
  query: string,
  options: CurateOptions = DEFAULT_CURATE_OPTIONS,
): CuratedItem[] {
  const profile = buildQueryProfile(query);

  // 1. Merge memories + resources, track originals for scoring
  const originals = new Map<CuratedItem, MemorySearchItem | undefined>();
  const raw: CuratedItem[] = [];

  for (const m of results.memories) {
    const text = options.preferAbstract && m.abstract
      ? truncate(m.abstract, options.maxContentChars)
      : truncate(m.content ?? m.text, options.maxContentChars);
    const item: CuratedItem = {
      type: "memory",
      score: m.score,
      text,
      uri: m.uri,
      category: m.category,
    };
    raw.push(item);
    originals.set(item, m);
  }

  for (const r of results.resources) {
    const text = truncate(
      (r as Record<string, unknown>).abstract as string ?? "",
      options.maxContentChars,
    );
    const item: CuratedItem = {
      type: "resource",
      score: r.score,
      text,
      uri: r.uri,
    };
    raw.push(item);
    originals.set(item, undefined);
  }

  // 2. Score
  const scored: ScoredItem[] = raw.map((item) => ({
    item,
    compositeScore: scoreItem(item, originals.get(item), profile),
  }));

  // 3. Sort by composite score desc
  scored.sort((a, b) => b.compositeScore - a.compositeScore);

  // 4. Dedup — use original MemorySearchItem URI/abstract for memories, URI for resources
  const seenKeys = new Set<string>();
  const deduped: ScoredItem[] = [];
  for (const s of scored) {
    const original = originals.get(s.item);
    let key: string;
    if (original) {
      key = getMemoryDedupeKey(original);
    } else {
      key = `resource:${s.item.uri ?? ""}`;
    }
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    // Update score on the item to reflect composite
    s.item.score = s.compositeScore;
    deduped.push(s);
  }

  // 5. Filter by scoreThreshold, prefer leaves, take topN
  const leaves = deduped.filter((s) => {
    const original = originals.get(s.item);
    return original && isLeafLike(original) && clampScore(s.compositeScore) >= options.scoreThreshold;
  });

  const picked: CuratedItem[] = [];
  const usedUris = new Set<string>();

  // Fill with leaves first
  for (const s of leaves) {
    if (picked.length >= options.topN) break;
    if (s.item.uri) usedUris.add(s.item.uri);
    picked.push(s.item);
  }

  // Supplement with non-leaves
  for (const s of deduped) {
    if (picked.length >= options.topN) break;
    if (s.item.uri && usedUris.has(s.item.uri)) continue;
    if (clampScore(s.compositeScore) < options.scoreThreshold) continue;
    if (s.item.uri) usedUris.add(s.item.uri);
    picked.push(s.item);
  }

  // 6. Budget-trim from bottom (account for XML wrapper overhead)
  // Wrapper is ~150 chars: tags, attributes, trailing instructions
  const wrapperOverhead = 150;
  const budgetForText = Math.max(0, options.maxTokens - Math.ceil(wrapperOverhead / 4));
  for (let count = picked.length; count > 0; count--) {
    const subset = picked.slice(0, count);
    const totalTokens = subset.reduce((sum, i) => sum + estimateTokens(i.text), 0);
    if (totalTokens <= budgetForText) {
      return subset;
    }
  }

  return [];
}
