import { DIContainer } from "../infrastructure/di/container";
import { loadConfig, mergeBehaviorIntoRecall } from "./config";
import { FileLogger } from "../adapters/driven/logger/file-logger";
import { createOVAdapter } from "../adapters/driven/openviking/adapter";
import { OpenVikingClientAdapter } from "../adapters/driven/openviking/client/client-adapter";
import { RecallCurator } from "../domain/recall/recall-curator";
import { GraphExpander } from "../domain/recall/graph-expander";
import { relevanceScorer, temporalScorer } from "../domain/recall/curate";
import { RecallService } from "../domain/recall/recall-service";
import { SessionManager } from "../domain/services/session-service";
import { SearchService } from "../domain/services/search-service";
import { ProfileManager } from "../domain/profile/service/ProfileManager";
import { RepoContext } from "./repo-context";
import type { Logger } from "../domain/ports/logger";
import type { PiOVConfig } from "./config";

export async function init(cwd: string): Promise<{
  config: PiOVConfig;
  logger: Logger;
  container: DIContainer;
  repoContext: RepoContext;
}> {
  const config = loadConfig(cwd);

  // P8: Under vitest, redirect log to /tmp/ unless OV_LOG_PATH explicitly set
  if (process.env.VITEST === "true" && !process.env.OV_LOG_PATH) {
    config.logger.path = "/tmp/test-pi-openviking.log";
  }

  const logger = new FileLogger(config.logger);
  const container = new DIContainer();

  container.register("config", () => config, true);
  container.register("logger", () => logger, true);

  // Create OV adapter and register all port implementations
  const adapter = createOVAdapter(config.ov, logger);
  container.register("adapter", () => adapter, true);
  container.register("knowledgeBase", () => adapter.knowledgeBase, true);
  container.register("fsStore", () => adapter.fsStore, true);
  container.register("graphStore", () => adapter.graphStore, true);
  container.register("sessionStore", () => adapter.sessionStore, true);
  container.register("resourceStore", () => adapter.resourceStore, true);
  container.register("skillStore", () => adapter.skillStore, true);

  // F# — Flat Hexagon: OpenVikingClient adapter (delegates to above ports)
  const clientAdapter = new OpenVikingClientAdapter(adapter);
  container.register("ovClient", () => clientAdapter, true);

  // F7a — ProfileManager: create, resolve active profile, merge into recall config
  const profileManager = new ProfileManager(
    config.profile.profiles,
    config.profile.activeProfile,
  );
  container.register("profileManager", () => profileManager, true);

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
  container.register("graphExpander", () => graphExpander, true);

  const recallCurator = new RecallCurator(config.recall, [relevanceScorer, temporalScorer], logger, graphExpander);
  container.register("recallCurator", () => recallCurator, true);

  const sessionService = new SessionManager(clientAdapter, {
    commitTimeout: config.ov.commitTimeout,
  });
  container.register("sessionService", () => sessionService, true);

  const recallService = new RecallService(
    adapter.knowledgeBase,
    recallCurator,
    config.recall,
    logger,
    true,
  );
  container.register("recallService", () => recallService, true);

  // F5 — application services
  const searchService = new SearchService(adapter.knowledgeBase, config.recall, logger);
  container.register("searchService", () => searchService, true);

  // SkillStore and ResourceStore are registered via adapter above — no pass-through service needed

  // RepoContext: lists viking://resources/ with TTL cache for system prompt injection
  const repoContext = new RepoContext(adapter.fsStore, logger);
  container.register("repoContext", () => repoContext, true);

  return { config, logger, container, repoContext };
}

export function shutdown(): void {
  // zero I/O — reset state only
}
