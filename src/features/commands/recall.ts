import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { AutoRecallState } from "../auto-recall/auto-recall";
import { parseArgs } from "../../shared/parse-args";

export interface CommandDeps {
  pi: ExtensionAPI;
  autoRecallState: AutoRecallState;
}

export function registerRecallCommand(deps: CommandDeps): void {
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
