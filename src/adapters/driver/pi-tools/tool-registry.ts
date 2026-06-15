import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createOvSearchTool } from "./ov-search";
import { createOvGlobTool } from "./ov-glob";
import { createOvGrepTool } from "./ov-grep";
import { createOvWriteTool } from "./ov-write";
import { createOvReadTool } from "./ov-read";
import { createOvRecallTool } from "./ov-recall";
import { createOvListTool } from "./ov-list";
import { createOvTreeTool } from "./ov-tree";
import { createOvStatTool } from "./ov-stat";
import { createOvDeleteTool } from "./ov-delete";
import { createOvResourceTool } from "./ov-resource";
import { createOvSkillTool } from "./ov-skill";
import { createOvImportTool } from "./ov-import";
import { createOvSessionTool } from "./ov-session";
import type { SearchClient, FsClient, SessionClient } from "../../../domain/client/open-viking-client";
import type { ResourceStore } from "../../../domain/ports/resource-store";
import type { SkillStore } from "../../../domain/ports/skill-store";
import type { RecallService } from "../../../domain/recall/recall-service";
import type { SessionManager } from "../../../domain/services/session-service";
import type { RecallConfig } from "../../../domain/common/recall-config";
import type { Logger } from "../../../domain/ports/logger";

export interface ToolServices {
  searchClient: SearchClient;
  fsClient: FsClient;
  recallService: RecallService;
  resourceStore: ResourceStore;
  skillStore: SkillStore;
  sessionService: SessionManager;
  recallConfig: RecallConfig;
}

export function registerAllTools(pi: ExtensionAPI, svcs: ToolServices, logger: Logger): void {
  // No pipeline — inline try/catch + logger in each tool handler
  pi.registerTool(createOvSearchTool(svcs.searchClient, svcs.recallConfig, logger));
  pi.registerTool(createOvGlobTool(svcs.searchClient));
  pi.registerTool(createOvGrepTool(svcs.searchClient));
  pi.registerTool(createOvRecallTool(svcs.recallService, logger));
  pi.registerTool(createOvSkillTool(svcs.skillStore, logger));
  pi.registerTool(createOvImportTool(svcs.resourceStore, logger));
  pi.registerTool(createOvSessionTool(svcs.sessionService));
  pi.registerTool(createOvWriteTool(svcs.fsClient));
  pi.registerTool(createOvReadTool(svcs.fsClient));
  pi.registerTool(createOvListTool(svcs.fsClient));
  pi.registerTool(createOvTreeTool(svcs.fsClient));
  pi.registerTool(createOvStatTool(svcs.fsClient));
  pi.registerTool(createOvDeleteTool(svcs.fsClient));
  pi.registerTool(createOvResourceTool(svcs.fsClient));
}
