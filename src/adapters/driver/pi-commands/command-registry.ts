import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { FsClient } from "../../../domain/client/open-viking-client";
import type { RecallService } from "../../../domain/recall/recall-service";
import type { SessionManager } from "../../../domain/services/session-service";
import type { SearchService } from "../../../domain/services/search-service";
import type { KnowledgeBase } from "../../../domain/ports/knowledge-base";
import type { ProfileManager } from "../../../domain/profile/service/ProfileManager";
import type { OVAdapterConfig } from "../../../infrastructure/config";
import type { RecallConfig } from "../../../domain/common/recall-config";
import type { SystemStatusClient } from "../../driven/openviking/system-status";
import { createOvRecallCommand } from "./ov-recall-command";
import { createOvStatusCommand } from "./ov-status-command";
import { createOvTreeCommand } from "./ov-tree-command";
import { createOvCommitCommand } from "./ov-commit-command";
import { createOvSearchCommand } from "./ov-search-command";
import { createOvDeleteCommand } from "./ov-delete-command";
import { createOvProfileCommand } from "./ov-profile-command";
import { createOvStartCommand } from "./ov-start-command";
import { createOvReindexCommand } from "./ov-reindex-command";

export interface CommandServices {
  recallService: RecallService;
  sessionService: SessionManager;
  searchService: SearchService;
  fsClient: FsClient;
  knowledgeBase: KnowledgeBase;
  profileManager: ProfileManager;
  autoDetectRules: Record<string, string>;
  ovConfig: OVAdapterConfig;
  recallConfig: RecallConfig;
  /** Callback to update OVWidget when command changes state */
  widgetUpdater?: (field: string, value: string) => void;
  /** Optional — injected when available, shows live server status in /ov-status */
  systemStatus?: SystemStatusClient;
}

export function registerAllCommands(pi: ExtensionAPI, svcs: CommandServices): void {
  pi.registerCommand("ov-recall", createOvRecallCommand(svcs.recallService, svcs.widgetUpdater));
  pi.registerCommand("ov-status", createOvStatusCommand(svcs.ovConfig, svcs.sessionService, svcs.recallService, svcs.recallConfig, svcs.systemStatus));
  pi.registerCommand("ov-tree", createOvTreeCommand(svcs.fsClient));
  pi.registerCommand("ov-commit", createOvCommitCommand(svcs.sessionService, svcs.widgetUpdater));
  pi.registerCommand("ov-search", createOvSearchCommand(svcs.searchService));
  pi.registerCommand("ov-delete", createOvDeleteCommand(svcs.fsClient, svcs.knowledgeBase));
  pi.registerCommand("ov-profile", createOvProfileCommand(
    svcs.profileManager,
    svcs.autoDetectRules,
  ));
  pi.registerCommand("ov-start", createOvStartCommand(svcs.sessionService, svcs.widgetUpdater));
  pi.registerCommand("ov-reindex", createOvReindexCommand(svcs.fsClient));
}
