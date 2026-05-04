import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { loadConfig } from "./config";
import { createClient } from "./client";
import { registerMemsearchTool } from "./tools";
import { SessionSync } from "./session";

export default function openVikingExtension(pi: ExtensionAPI) {
  let registered = false;
  let sessionSync: SessionSync | undefined;

  pi.on("session_start", (_event, ctx) => {
    if (!registered) {
      registered = true;

      const config = loadConfig(ctx.cwd);
      const client = createClient(config);
      registerMemsearchTool(pi, client);

      sessionSync = new SessionSync(client, {
        getSessionFile: () => ctx.sessionManager.getSessionFile(),
        getBranch: () => ctx.sessionManager.getBranch(),
        appendEntry: (type, data) => pi.appendEntry(type, data),
      });
    }

    sessionSync?.onSessionStart();
  });

  pi.on("message_end", (event) => {
    sessionSync?.onMessageEnd(event.message);
  });

  pi.on("session_shutdown", () => {
    sessionSync?.onShutdown();
  });
}
