import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { SessionSyncLike } from "../session-sync/session";
import { logger } from "../shared/logger";
import { commitOp } from "../operations/commit";

export interface CommandDeps {
  pi: ExtensionAPI;
  sessionSync: SessionSyncLike;
}

export function registerCommitCommand(deps: CommandDeps): void {
  const { pi, sessionSync } = deps;

  pi.registerCommand("ov-commit", {
    description: "Commit the current conversation to OpenViking",
    handler: async (_args, ctx) => {
      try {
        const result = await commitOp(sessionSync);
        ctx.ui.notify(`✓ Session committed. Task: ${result.task_id}`, "info");
      } catch (err) {
        const message = (err as Error).message ?? "Unknown error";
        logger.error("commit command failed:", message);
        ctx.ui.notify(`✗ Commit failed: ${message}`, "error");
      }
    },
  });
}
