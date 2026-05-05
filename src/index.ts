import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { loadConfig } from "./config";
import { createClient } from "./client";
import { registerMemsearchTool, registerMemreadTool, registerMembrowseTool, registerMemcommitTool } from "./tools";
import { SessionSync } from "./session";
import { createAutoRecall } from "./auto-recall";

export default function openVikingExtension(pi: ExtensionAPI) {
  let registered = false;
  let sessionSync: SessionSync | undefined;

  pi.on("session_start", (_event, ctx) => {
    if (!registered) {
      registered = true;

      const config = loadConfig(ctx.cwd);
      const client = createClient(config);

      sessionSync = new SessionSync(client, {
        getSessionFile: () => ctx.sessionManager.getSessionFile(),
        getBranch: () => ctx.sessionManager.getBranch(),
        appendEntry: (type, data) => pi.appendEntry(type, data),
      });

      registerMemsearchTool(pi, client, sessionSync);
      registerMemreadTool(pi, client);
      registerMembrowseTool(pi, client);
      registerMemcommitTool(pi, client, sessionSync);

      const autoRecall = createAutoRecall(client, sessionSync);
      pi.on("before_agent_start", async (event) => {
        return autoRecall(event);
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
