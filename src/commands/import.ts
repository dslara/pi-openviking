import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { OpenVikingClient } from "../ov-client/client";
import { logger } from "../shared/logger";
import { parseArgs } from "../shared/parse-args";
import { resolveSource } from "../importer/source-resolver";

export interface CommandDeps {
  pi: ExtensionAPI;
  client: OpenVikingClient;
}

export function registerImportCommand(deps: CommandDeps): void {
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

        const resolved = await resolveSource(source, kind, reason, to);

        if (resolved.type === "directory") {
          const result = await resolved.upload(client);
          ctx.ui.notify(`✓ Imported: ${result.root_uri}`, "info");
          return;
        }

        if (resolved.type === "file") {
          const upload = await client.tempUpload(resolved.body, resolved.filename);
          resolved.params.temp_file_id = upload.temp_file_id;
        }

        const result = await client.addResource(resolved.params);
        ctx.ui.notify(`✓ Imported: ${result.root_uri}`, "info");
      } catch (err) {
        const msg = (err as Error).message;
        logger.error("ov-import command failed:", msg);
        ctx.ui.notify(`✗ Import failed: ${msg}`, "error");
      }
    },
  });
}
