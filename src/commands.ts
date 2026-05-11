import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { OpenVikingClient } from "./features/ov-client/client";
import type { SessionSyncLike } from "./session";
import type { AutoRecallState } from "./auto-recall";
import { logger } from "./shared/logger";
import { parseArgs } from "./shared/parse-args";
import { formatSearch } from "./shared/format-search";
import { formatBrowse } from "./shared/format-browse";
import { resolveSearchMode } from "./shared/search-mode";
import { resolveSource } from "./features/importer/source-resolver";

export interface RegisterCommandsDeps {
  pi: ExtensionAPI;
  client: OpenVikingClient;
  sessionSync: SessionSyncLike;
  autoRecallState: AutoRecallState;
}

export function registerCommands(deps: RegisterCommandsDeps): void {
  const { pi, client, sessionSync, autoRecallState } = deps;

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

        const sessionId = sessionSync.getOvSessionId();
        const resolvedMode = resolveSearchMode(mode, query, sessionId ?? undefined);

        const results = await client.search(sessionId, query, limit, resolvedMode, uri);
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

  pi.registerCommand("ov-recall", {
    description: "Toggle auto-recall on or off for the current session",
    handler: async (args, ctx) => {
      const booleans = new Set(["status"]);
      const parsed = parseArgs(args, booleans);

      if ("status" in parsed.flags) {
        const status = autoRecallState.enabled ? "enabled" : "disabled";
        ctx.ui.notify(`Auto-recall is ${status} (session-only)`, "info");
        return;
      }

      autoRecallState.enabled = !autoRecallState.enabled;
      const status = autoRecallState.enabled ? "enabled" : "disabled";
      ctx.ui.notify(`Auto-recall ${status} for this session. Resets on reload.`, "info");
    },
  });

  pi.registerCommand("ov-commit", {
    description: "Commit the current conversation to OpenViking",
    handler: async (_args, ctx) => {
      try {
        await sessionSync.flush();
        const result = await sessionSync.commit();
        ctx.ui.notify(`✓ Session committed. Task: ${result.task_id}`, "info");
      } catch (err) {
        const message = (err as Error).message ?? "Unknown error";
        logger.error("commit command failed:", message);
        ctx.ui.notify(`✗ Commit failed: ${message}`, "error");
      }
    },
  });
}
