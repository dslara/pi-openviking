import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Uri } from "../../domain/common/uri";
import type { FsClient } from "../../domain/client/open-viking-client";
import type { ReindexMode } from "../../domain/client/ov-types";

export function createOvReindexCommand(client: FsClient) {
  return {
    description: "Reindex a resource or skill in OpenViking. Usage: /ov-reindex <uri> [--mode vectors_only|full]",
    getArgumentCompletions: (prefix: string) => {
      if (prefix.startsWith("--mode ")) return [];
      if (prefix.includes("--mode")) {
        return [
          { value: "vectors_only", label: "vectors_only", description: "Rebuild vector embeddings only (default)" },
          { value: "full", label: "full", description: "Rebuild both scalar and vector indexes" },
        ];
      }
      return [
        { value: "--mode", label: "--mode", description: "Reindex mode: vectors_only (default) or full" },
      ];
    },
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const trimmed = args.trim();
      if (!trimmed) {
        ctx.ui.notify("Usage: /ov-reindex <uri> [--mode vectors_only|full]", "warning");
        return;
      }

      // Parse mode flag from args
      let uriStr = trimmed;
      let mode: ReindexMode = "vectors_only";
      const modeMatch = trimmed.match(/^(.*?)\s+--mode\s+(vectors_only|full)$/);
      if (modeMatch) {
        uriStr = modeMatch[1].trim();
        mode = modeMatch[2] as ReindexMode;
      }

      let uri: Uri;
      try {
        uri = new Uri(uriStr);
      } catch {
        ctx.ui.notify(`Invalid URI: ${uriStr}`, "warning");
        return;
      }

      try {
        await client.reindex(uri, mode, ctx.signal ?? undefined);
        ctx.ui.notify(`Reindexed: ${uriStr} (${mode})`, "info");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.ui.notify(`Reindex failed: ${msg}`, "error");
      }
    },
  };
}
