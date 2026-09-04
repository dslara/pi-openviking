import type { RelationClient, FsClient } from "../client/open-viking-client";
import type { Logger } from "../ports/logger";
import type { CuratedItem } from "./curate";
import { Uri } from "../common/uri";

export interface GraphExpanderConfig {
  expandGraphMaxRatio: number;
  expandGraphMinSeedScore: number;
}

export class GraphExpander {
  constructor(
    private readonly relations: RelationClient,
    private readonly fs: FsClient,
    private readonly config: GraphExpanderConfig,
    private readonly logger: Logger,
  ) {}

  async expand(
    seeds: CuratedItem[],
    budget: { remaining: number; original: number },
  ): Promise<CuratedItem[]> {
    const qualified = seeds
      .filter(s => s.score >= this.config.expandGraphMinSeedScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    if (qualified.length === 0) {
      return [];
    }

    // Collect relations for all qualified seeds
    const seen = new Set(qualified.map(s => s.uri));
    const candidates: { uri: string; reason: string; seedScore: number }[] = [];

    for (const s of qualified) {
      const relations = await this.relations.graph(new Uri(s.uri));
      for (const r of relations) {
        if (seen.has(r.uri)) continue; // dedup across seeds + other relations
        seen.add(r.uri);
        candidates.push({ uri: r.uri, reason: r.reason ?? "", seedScore: s.score });
      }
    }

    if (candidates.length === 0) {
      return [];
    }

    // Priority: longer reason first
    candidates.sort((a, b) => b.reason.length - a.reason.length);

    // Budget: max expandGraphMaxRatio of original budget
    const graphBudget = Math.min(
      Math.floor(budget.original * this.config.expandGraphMaxRatio),
      budget.remaining,
    );

    // Read content in parallel
    const reads = candidates.map(c =>
      this.fs.read(new Uri(c.uri), "abstract").then(content => ({
        ...c,
        body: content.body,
      })),
    );
    const results = await Promise.all(reads);

    // Build graph items with budget guard
    const items: CuratedItem[] = [];
    let used = 0;

    for (const r of results) {
      const tokens = Math.ceil(r.body.length / 4) + 60;
      if (used + tokens > graphBudget && items.length > 0) {
        continue;
      }
      items.push({
        uri: r.uri,
        text: r.body,
        score: r.seedScore * 0.8,
        source: "graph" as const,
      });
      used += tokens;
    }

    return items;
  }
}
