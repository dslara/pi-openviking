import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { loadConfig } from "./shared/config";
import type { ToolRegisterDeps } from "./shared/tool-def";
import { createClient } from "./ov-client/client";
import { logger } from "./shared/logger";
import { registerMemsearchTool } from "./tools/search";
import { registerMemreadTool } from "./tools/read";
import { registerMembrowseTool } from "./tools/browse";
import { registerMemcommitTool } from "./tools/commit";
import { registerMemdeleteTool } from "./tools/delete";
import { registerMemimportTool } from "./tools/import";
import { registerSearchCommand } from "./commands/search";
import { registerBrowseCommand } from "./commands/browse";
import { registerImportCommand } from "./commands/import";
import { registerDeleteCommand } from "./commands/delete";
import { registerRecallCommand } from "./commands/recall";
import { registerCommitCommand } from "./commands/commit";
import type { CommandRegisterDeps } from "./commands/types";
import { SessionSync } from "./session-sync/session";
import { createAutoRecall } from "./auto-recall/auto-recall";

export const TOOLS = [
  registerMemsearchTool,
  registerMemreadTool,
  registerMembrowseTool,
  registerMemcommitTool,
  registerMemdeleteTool,
  registerMemimportTool,
];

export const COMMANDS = [
  registerSearchCommand,
  registerBrowseCommand,
  registerImportCommand,
  registerDeleteCommand,
  registerRecallCommand,
  registerCommitCommand,
];

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

  const toolDeps: ToolRegisterDeps = { client, sync: sessionSync };
  for (const register of TOOLS) register(pi, toolDeps);

  const autoRecallState = { enabled: config.openVikingAutoRecall };

  const cmdDeps: CommandRegisterDeps = { pi, client, sync: sessionSync, autoRecallState };
  for (const register of COMMANDS) register(cmdDeps);

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
