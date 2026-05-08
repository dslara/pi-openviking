import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { loadConfig } from "./config";
import { createClient } from "./client";
import {
  registerMemsearchTool,
  registerMemreadTool,
  registerMembrowseTool,
  registerMemcommitTool,
} from "./tools";
import { SessionSync } from "./session";
import { createAutoRecall } from "./auto-recall";

export interface BootstrapContext {
  cwd: string;
  sessionManager: {
    getSessionFile(): string | undefined;
    getBranch(): Array<{ type: string; customType?: string; data?: unknown }>;
  };
}

export interface BootstrapResult {
  sessionSync: SessionSync;
}

export function bootstrapExtension(
  pi: ExtensionAPI,
  ctx: BootstrapContext,
): BootstrapResult {
  const config = loadConfig(ctx.cwd);
  const client = createClient(config);

  const sessionSync = new SessionSync(client, {
    getSessionFile: () => ctx.sessionManager.getSessionFile(),
    getBranch: () => ctx.sessionManager.getBranch(),
    appendEntry: (type, data) => pi.appendEntry(type, data),
  });

  registerMemsearchTool(pi, client, sessionSync);
  registerMemreadTool(pi, client);
  registerMembrowseTool(pi, client);
  registerMemcommitTool(pi, client, sessionSync);

  const autoRecall = createAutoRecall(client, sessionSync, {
    limit: config.autoRecallLimit,
    timeout: config.autoRecallTimeout,
    topN: config.autoRecallTopN,
  });
  pi.on("before_agent_start", async (event) => {
    return autoRecall(event);
  });

  return { sessionSync };
}
