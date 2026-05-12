import type { CommandRegisterDeps } from "./types";
import { logger } from "../shared/logger";
import { parseArgs } from "../shared/parse-args";
import { formatSearch } from "../shared/format-search";
import { searchOp } from "../operations/search";

export function registerSearchCommand(deps: CommandRegisterDeps): void {
  const { pi, client, sync } = deps;

  pi.registerCommand("ov-search", {
    description: "Search OpenViking memories and resources",
    handler: async (args, ctx) => {
      try {
        const booleans = new Set(["deep", "fast"]);
        const parsed = parseArgs(args, booleans);
        const query = parsed.positional.join(" ") || "";
        if (!query) {
          ctx.ui.notify("Usage: /ov-search [--deep|--fast] [--limit N] [--uri <uri>] <query>", "error");
          return;
        }

        const limit = parsed.flags.limit ? parseInt(parsed.flags.limit, 10) : 10;
        const mode = "deep" in parsed.flags ? "deep" : "fast" in parsed.flags ? "fast" : "auto";
        const uri = parsed.flags.uri;
        const sessionId = sync.getOvSessionId();

        const results = await searchOp(client, {
          query,
          limit,
          mode,
          uri,
          sessionId: sessionId ?? undefined,
        });

        const text = formatSearch(results, query);

        pi.sendMessage(
          {
            customType: "ov-search",
            content: [{ type: "text", text }],
            display: true,
            details: { total: results.total },
          },
          { triggerTurn: true, deliverAs: "steer" },
        );
      } catch (err) {
        const msg = (err as Error).message;
        logger.error("ov-search command failed:", msg);
        ctx.ui.notify(`✗ Search failed: ${msg}`, "error");
      }
    },
  });
}
