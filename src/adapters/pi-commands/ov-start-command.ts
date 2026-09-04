import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { SessionManager } from "../../domain/session/session-service";

export function createOvStartCommand(
  sessionService: SessionManager,
  widgetUpdater?: (field: string, value: string) => void,
) {
  return {
    description: "Create a new OV session and set it as active. Usage: /ov-start",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      try {
        const sessionId = await sessionService.createAndSet();
        widgetUpdater?.("session", sessionId.toString());
        ctx.ui.notify(`Session created: ${sessionId.toString()}`, "info");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.ui.notify(`Failed to create session: ${msg}`, "error");
      }
    },
  };
}
