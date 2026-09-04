import { curate, estimateTokens } from "./curate";
import type { CuratedItem, CuratedResult, Scorer } from "./curate";
import type { SearchResult } from "../knowledge/search-result";
import type { RecallConfig } from "../common/recall-config";
import type { Logger } from "../ports/logger";
import type { GraphExpander } from "./graph-expander";

export class RecallCurator {
  constructor(
    private readonly config: RecallConfig,
    private readonly scorers: Scorer[],
    private readonly logger: Logger,
    private readonly graphExpander?: GraphExpander,
  ) {}

  async curate(results: SearchResult): Promise<CuratedResult> {
    const curated = curate(results, {
      topN: this.config.topN,
      scoreThreshold: this.config.scoreThreshold,
      maxTokens: this.config.maxTokens,
      scorers: this.scorers.length > 0 ? this.scorers : undefined,
    });

    this.logger.info(
      `curated ${results.total} items → ${curated.items.length} items, ${curated.tokens} tokens`,
    );

    if (this.graphExpander && this.config.expandGraph && curated.items.length > 0) {
      const budget = {
        remaining: this.config.maxTokens - curated.tokens,
        original: this.config.maxTokens,
      };

      const graphItems = await this.graphExpander.expand(curated.items, budget);

      if (graphItems.length > 0) {
        const merged = [...curated.items, ...graphItems].sort(
          (a, b) => b.score - a.score,
        );
        const graphTokens = graphItems.reduce(
          (s, i) => s + estimateTokens(i.text) + 60,
          0,
        );

        this.logger.info(
          `graph expanded: added ${graphItems.length} items, ${graphTokens} tokens`,
        );

        return {
          items: merged,
          tokens: curated.tokens + graphTokens,
          dropped: curated.dropped,
        };
      }
    }

    return curated;
  }
}
