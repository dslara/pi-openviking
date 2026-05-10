import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { loadConfig } from "./config";
import { createClient } from "./client";
import { logger } from "./logger";
import {
  registerMemsearchTool,
  registerMemreadTool,
  registerMembrowseTool,
  registerMemcommitTool,
  registerMemdeleteTool,
  registerMemimportTool,
} from "./tools";
import { SessionSync } from "./session";
import { createAutoRecall } from "./auto-recall";
import { registerCommands } from "./commands";

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

  logger.debug("session sync created");

  registerMemsearchTool(pi, client, sessionSync);
  registerMemreadTool(pi, client);
  registerMembrowseTool(pi, client);
  registerMemcommitTool(pi, client, sessionSync);
  registerMemdeleteTool(pi, client);
  registerMemimportTool(pi, client);

  const autoRecallState = { enabled: config.openVikingAutoRecall };

  registerCommands({ pi, client, sessionSync, autoRecallState });

  const autoRecall = createAutoRecall(client, sessionSync, autoRecallState, {
    limit: config.autoRecallLimit,
    timeout: config.autoRecallTimeout,
    topN: config.autoRecallTopN,
    curateOptions: {
      scoreThreshold: config.autoRecallScoreThreshold,
      maxContentChars: config.autoRecallMaxContentChars,
      preferAbstract: config.autoRecallPreferAbstract,
      maxTokens: config.autoRecallTokenBudget,
    },
  });
  pi.on("before_agent_start", async (event) => {
    return autoRecall(event);
  });

  return { sessionSync };
}
