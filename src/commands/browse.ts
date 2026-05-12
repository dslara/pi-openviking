import type { CommandRegisterDeps } from "./types";
import { logger } from "../shared/logger";
import { parseArgs } from "../shared/parse-args";
import { formatBrowse } from "../shared/format-browse";
import { browseOp } from "../operations/browse";

export function registerBrowseCommand(deps: CommandRegisterDeps): void {
  const { pi, client } = deps;

  pi.registerCommand("ov-ls", {
    description: "Browse the OpenViking filesystem",
    handler: async (args, ctx) => {
      try {
        const booleans = new Set(["tree", "stat", "recursive", "simple"]);
        const parsed = parseArgs(args, booleans);
        const uri = parsed.positional[0] || "viking://";
        const view = "tree" in parsed.flags ? "tree" : "stat" in parsed.flags ? "stat" : "list";
        const recursive = parsed.flags.recursive !== undefined;
        const simple = parsed.flags.simple !== undefined;

        const result = await browseOp(client, { uri, view, recursive, simple });

        const text = formatBrowse(result, view);

        pi.sendMessage(
          {
            customType: "ov-ls",
            content: [{ type: "text", text }],
            display: true,
            details: { uri },
          },
          { triggerTurn: true, deliverAs: "steer" },
        );
      } catch (err) {
        const msg = (err as Error).message;
        logger.error("ov-ls command failed:", msg);
        ctx.ui.notify(`✗ Browse failed: ${msg}`, "error");
      }
    },
  });
}
