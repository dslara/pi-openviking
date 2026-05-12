import type { CommandRegisterDeps } from "./types";
import { logger } from "../shared/logger";
import { parseArgs } from "../shared/parse-args";
import { deleteOp } from "../operations/delete";

export function registerDeleteCommand(deps: CommandRegisterDeps): void {
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

        const result = await deleteOp(client, { uri });
        const label = result.verified
          ? `✓ Deleted: ${result.uri}`
          : `✓ Deleted: ${result.uri} (warning: may still appear in search due to async index sync)`;
        ctx.ui.notify(label, "info");
      } catch (err) {
        const msg = (err as Error).message;
        logger.error("ov-delete command failed:", msg);
        ctx.ui.notify(`✗ Delete failed: ${msg}`, "error");
      }
    },
  });
}
