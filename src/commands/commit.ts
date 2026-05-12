import type { CommandRegisterDeps } from "./types";
import { logger } from "../shared/logger";
import { commitOp } from "../operations/commit";

export function registerCommitCommand(deps: CommandRegisterDeps): void {
  const { pi, sync } = deps;

  pi.registerCommand("ov-commit", {
    description: "Commit the current conversation to OpenViking",
    handler: async (_args, ctx) => {
      try {
        const result = await commitOp(sync);
        ctx.ui.notify(`✓ Session committed. Task: ${result.task_id}`, "info");
      } catch (err) {
        const message = (err as Error).message ?? "Unknown error";
        logger.error("commit command failed:", message);
        ctx.ui.notify(`✗ Commit failed: ${message}`, "error");
      }
    },
  });
}
