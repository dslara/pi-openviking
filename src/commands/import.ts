import type { CommandRegisterDeps } from "./types";
import { logger } from "../shared/logger";
import { parseArgs } from "../shared/parse-args";
import { importOp } from "../operations/import";

export function registerImportCommand(deps: CommandRegisterDeps): void {
  const { pi, client } = deps;

  pi.registerCommand("ov-import", {
    description: "Import a URL or local file into OpenViking",
    handler: async (args, ctx) => {
      try {
        const parsed = parseArgs(args);
        const source = parsed.positional[0];
        if (!source) {
          ctx.ui.notify("Usage: /ov-import [--kind resource|skill] [--to <uri>] [--reason <text>] <source>", "error");
          return;
        }

        const kind = (parsed.flags.kind as "resource" | "skill") ?? "resource";
        const to = parsed.flags.to;
        const reason = parsed.flags.reason;

        const result = await importOp(client, { source, kind, reason, to });
        ctx.ui.notify(`✓ Imported: ${result.root_uri}`, "info");
      } catch (err) {
        const msg = (err as Error).message;
        logger.error("ov-import command failed:", msg);
        ctx.ui.notify(`✗ Import failed: ${msg}`, "error");
      }
    },
  });
}
