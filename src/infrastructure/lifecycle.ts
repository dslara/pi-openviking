import { loadConfig, mergeBehaviorIntoRecall } from "./config";
import { FileLogger } from "../adapters/driven/logger/file-logger";
import { createOVAdapter, type OVAdapter } from "../adapters/driven/openviking/adapter";
import { OpenVikingClientAdapter } from "../adapters/driven/openviking/client/client-adapter";
import { RecallCurator } from "../domain/recall/recall-curator";
import { GraphExpander } from "../domain/recall/graph-expander";
import { relevanceScorer, temporalScorer } from "../domain/recall/curate";
import { RecallService } from "../domain/recall/recall-service";
import { SessionManager } from "../domain/services/session-service";

import { ProfileManager } from "../domain/profile/service/ProfileManager";
import { RepoContext } from "./repo-context";
import type { Logger } from "../domain/ports/logger";
import type { KnowledgeBase } from "../domain/ports/knowledge-base";
import type { FsStore } from "../domain/ports/fs-store";
import type { GraphStore } from "../domain/ports/graph-store";
import type { SessionStore } from "../domain/ports/session-store";
import type { ResourceStore } from "../domain/ports/resource-store";
import type { SkillStore } from "../domain/ports/skill-store";
import type { OpenVikingClient } from "../domain/client/open-viking-client";
import type { PiOVConfig } from "./config";

export async function init(cwd: string): Promise<{
  config: PiOVConfig;
  logger: Logger;
  adapter: OVAdapter;
  knowledgeBase: KnowledgeBase;
  fsStore: FsStore;
  graphStore: GraphStore;
  sessionStore: SessionStore;
  resourceStore: ResourceStore;
  skillStore: SkillStore;
  ovClient: OpenVikingClient;
  profileManager: ProfileManager;
  graphExpander: GraphExpander | undefined;
  recallCurator: RecallCurator;
  sessionService: SessionManager;
  recallService: RecallService;
  repoContext: RepoContext;
}> {
  const config = loadConfig(cwd);

  // P8: Under vitest, redirect log to /tmp/ unless OV_LOG_PATH explicitly set
  if (process.env.VITEST === "true" && !process.env.OV_LOG_PATH) {
    config.logger.path = "/tmp/test-pi-openviking.log";
  }

  const logger = new FileLogger(config.logger);

  // Create OV adapter and register all port implementations
  const adapter = createOVAdapter(config.ov, logger);

  // F# — Flat Hexagon: OpenVikingClient adapter (delegates to above ports)
  const clientAdapter = new OpenVikingClientAdapter(adapter);

  // F7a — ProfileManager: create, resolve active profile, merge into recall config
  const profileManager = new ProfileManager(
    config.profile.profiles,
    config.profile.activeProfile,
  );

  config.recall = mergeBehaviorIntoRecall(
    config.recall,
    profileManager.resolve(profileManager.getActive()),
  );

  // F4 — domain services
  const graphExpander = config.recall.expandGraph
    ? new GraphExpander(
        adapter.graphStore,
        adapter.fsStore,
        {
          expandGraphMaxRatio: config.recall.expandGraphMaxRatio,
          expandGraphMinSeedScore: config.recall.expandGraphMinSeedScore,
        },
        logger,
      )
    : undefined;

  const recallCurator = new RecallCurator(config.recall, [relevanceScorer, temporalScorer], logger, graphExpander);

  const sessionService = new SessionManager(clientAdapter, {
    commitTimeout: config.ov.commitTimeout,
  });

  const recallService = new RecallService(
    adapter.knowledgeBase,
    recallCurator,
    config.recall,
    logger,
    true,
  );

  // SkillStore and ResourceStore are registered via adapter above — no pass-through service needed

  // RepoContext: lists viking://resources/ with TTL cache for system prompt injection
  const repoContext = new RepoContext(adapter.fsStore, logger);

  return {
    config,
    logger,
    adapter,
    knowledgeBase: adapter.knowledgeBase,
    fsStore: adapter.fsStore,
    graphStore: adapter.graphStore,
    sessionStore: adapter.sessionStore,
    resourceStore: adapter.resourceStore,
    skillStore: adapter.skillStore,
    ovClient: clientAdapter,
    profileManager,
    graphExpander,
    recallCurator,
    sessionService,
    recallService,
    repoContext,
  };
}

export function shutdown(): void {
  // zero I/O — reset state only
}
