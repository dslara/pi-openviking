import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { bootstrapExtension } from "./bootstrap";
import type { SessionSync } from "./session-sync/session";

export default function openVikingExtension(pi: ExtensionAPI) {
  let sessionSync: SessionSync | undefined;

  pi.on("session_start", (_event, ctx) => {
    if (!sessionSync) {
      const result = bootstrapExtension(pi, {
        cwd: ctx.cwd,
        sessionManager: ctx.sessionManager,
      });
      sessionSync = result.sessionSync;
    }

    sessionSync.onSessionStart();
  });

  pi.on("message_end", (event) => {
    sessionSync?.onMessageEnd(event.message);
  });

  pi.on("session_shutdown", async () => {
    await sessionSync?.onShutdown();
    sessionSync = undefined;
  });
}
