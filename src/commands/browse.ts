import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { OpenVikingClient } from "../ov-client/client";
import { logger } from "../shared/logger";
import { parseArgs } from "../shared/parse-args";
import { formatBrowse } from "../shared/format-browse";

export interface CommandDeps {
  pi: ExtensionAPI;
  client: OpenVikingClient;
}

export function registerBrowseCommand(deps: CommandDeps): void {
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

        let result;
        switch (view) {
          case "tree":
            result = await client.fsTree(uri);
            break;
          case "stat":
            result = await client.fsStat(uri);
            break;
          default:
            result = await client.fsList(uri, undefined, recursive, simple);
            break;
        }

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
