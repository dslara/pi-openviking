import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { OpenVikingClient } from "../ov-client/client";
import type { SessionSyncLike } from "../session-sync/session";
import type { AutoRecallState } from "../auto-recall/auto-recall";
import { registerSearchCommand } from "./search";
import { registerBrowseCommand } from "./browse";
import { registerImportCommand } from "./import";
import { registerDeleteCommand } from "./delete";
import { registerRecallCommand } from "./recall";
import { registerCommitCommand } from "./commit";

export interface RegisterCommandsDeps {
  pi: ExtensionAPI;
  client: OpenVikingClient;
  sessionSync: SessionSyncLike;
  autoRecallState: AutoRecallState;
}

export function registerCommands(deps: RegisterCommandsDeps): void {
  const { pi, client, sessionSync, autoRecallState } = deps;

  registerSearchCommand({ pi, client, sessionSync });
  registerBrowseCommand({ pi, client });
  registerImportCommand({ pi, client });
  registerDeleteCommand({ pi, client });
  registerRecallCommand({ pi, autoRecallState });
  registerCommitCommand({ pi, sessionSync });
}
