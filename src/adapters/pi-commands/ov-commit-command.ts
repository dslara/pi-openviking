import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { SessionManager } from "../../domain/session/session-service";

export function createOvCommitCommand(sessionService: SessionManager, widgetUpdater?: (field: string, value: string) => void) {
  return {
    description: "Commit the current OV session. Usage: /ov-commit [--wait]",
    getArgumentCompletions: (_prefix: string) => [
      { value: "--wait", label: "--wait", description: "Wait for commit to complete before returning" },
    ],
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const active = sessionService.getActive();
      if (!active) {
        ctx.ui.notify("No active session — start one first", "warning");
        return;
      }

      const doWait = args.trim() === "--wait";

      try {
        const result = await sessionService.commit(active);
        let msg = `Session committed. Task ID: ${result.taskId ?? "none"}`;

        if (doWait && result.taskId) {
          ctx.ui.notify("Waiting for commit to complete...", "info");
          const status = await sessionService.waitForCommit(result.taskId);
          msg += `\nStatus: ${status.status}`;
          if (status.status === "completed") {
            widgetUpdater?.("memories", "updated");
          }
        }

        ctx.ui.notify(msg, "info");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.ui.notify(`Commit failed: ${msg}`, "error");
      }
    },
  };
}
