import type { CommandRegisterDeps } from "./types";
import { parseArgs } from "../shared/parse-args";

export function registerRecallCommand(deps: CommandRegisterDeps): void {
  const { pi, autoRecallState } = deps;

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
}
