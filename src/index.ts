import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { loadConfig } from "./config";
import { createClient } from "./client";
import { registerMemsearchTool } from "./tools";

export default function openVikingExtension(pi: ExtensionAPI) {
  let registered = false;

  pi.on("session_start", (_event, ctx) => {
    if (registered) return;
    registered = true;

    const config = loadConfig(ctx.cwd);
    const client = createClient(config);
    registerMemsearchTool(pi, client);
  });
}
