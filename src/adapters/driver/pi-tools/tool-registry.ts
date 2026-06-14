import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Pipeline } from "../../../domain/pipeline/pipeline";
import { loggingMiddleware } from "../../../domain/pipeline/logging-middleware";
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
import type { SearchService } from "../../../domain/services/search-service";
import type { RecallService } from "../../../domain/recall/recall-service";
import type { SessionService } from "../../../domain/services/session-service";
import type { SearchResult } from "../../../domain/knowledge/model/search-result";
import type { GlobResult, GrepResult } from "../../../domain/ports/knowledge-base";
import type { RecallResult } from "../../../domain/recall/recall-service";
import type { AddSkillResult } from "../../../domain/ports/skill-store";
import type { ResourceImportResult } from "../../../domain/ports/resource-store";
import type { SessionInfo } from "../../../domain/ports/session-store";
import type { Logger } from "../../../domain/ports/logger";

export interface ToolServices {
  searchService: SearchService;
  fsClient: FsClient;
  recallService: RecallService;
  resourceStore: ResourceStore;
  skillStore: SkillStore;
  sessionService: SessionService;
}

export function registerAllTools(pi: ExtensionAPI, svcs: ToolServices, logger: Logger): void {
  // Non-FS tools still use Pipeline until slice #5
  const searchPipeline = new Pipeline<SearchResult>();
  searchPipeline.use(loggingMiddleware("search", logger));
  pi.registerTool(createOvSearchTool(svcs.searchService, searchPipeline));

  const globPipeline = new Pipeline<GlobResult>();
  globPipeline.use(loggingMiddleware("glob", logger));
  pi.registerTool(createOvGlobTool(svcs.searchService, globPipeline));

  const grepPipeline = new Pipeline<GrepResult>();
  grepPipeline.use(loggingMiddleware("grep", logger));
  pi.registerTool(createOvGrepTool(svcs.searchService, grepPipeline));

  const recallPipeline = new Pipeline<RecallResult>();
  recallPipeline.use(loggingMiddleware("recall", logger));
  pi.registerTool(createOvRecallTool(svcs.recallService, recallPipeline));

  const skillPipeline = new Pipeline<AddSkillResult>();
  skillPipeline.use(loggingMiddleware("skill", logger));
  pi.registerTool(createOvSkillTool(svcs.skillStore, skillPipeline));

  const importPipeline = new Pipeline<unknown>();
  importPipeline.use(loggingMiddleware("import", logger));
  pi.registerTool(createOvImportTool(svcs.resourceStore, importPipeline));

  const sessionPipeline = new Pipeline<SessionInfo>();
  sessionPipeline.use(loggingMiddleware("session", logger));
  pi.registerTool(createOvSessionTool(svcs.sessionService, sessionPipeline));

  // FS tools: no pipeline (migrated to FsClient in slice #3)
  pi.registerTool(createOvWriteTool(svcs.fsClient));
  pi.registerTool(createOvReadTool(svcs.fsClient));
  pi.registerTool(createOvListTool(svcs.fsClient));
  pi.registerTool(createOvTreeTool(svcs.fsClient));
  pi.registerTool(createOvStatTool(svcs.fsClient));
  pi.registerTool(createOvDeleteTool(svcs.fsClient));
  pi.registerTool(createOvResourceTool(svcs.fsClient));
}
