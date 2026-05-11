import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { OpenVikingClient } from "../ov-client/client";
import { logger } from "../../shared/logger";
import { parseArgs } from "../../shared/parse-args";

export interface CommandDeps {
  pi: ExtensionAPI;
  client: OpenVikingClient;
}

export function registerDeleteCommand(deps: CommandDeps): void {
  const { pi, client } = deps;

  pi.registerCommand("ov-delete", {
    description: "Delete a resource or directory from OpenViking by URI",
    handler: async (args, ctx) => {
      try {
        const parsed = parseArgs(args);
        const uri = parsed.positional[0];
        if (!uri) {
          ctx.ui.notify("Usage: /ov-delete <viking://uri>", "error");
          return;
        }

        await client.delete(uri);
        ctx.ui.notify(`✓ Deleted: ${uri}`, "info");
      } catch (err) {
        const msg = (err as Error).message;
        logger.error("ov-delete command failed:", msg);
        ctx.ui.notify(`✗ Delete failed: ${msg}`, "error");
      }
    },
  });
}
