import { loadConfig, mergeBehaviorIntoRecall } from "./config";
import { FileLogger } from "../adapters/logging/file-logger";
import { createOVAdapter, type OVAdapter } from "../adapters/ov-client/adapter";
import { OpenVikingClientAdapter } from "../adapters/ov-client/client-adapter";
import { RecallCurator } from "../domain/recall/recall-curator";
import { GraphExpander } from "../domain/recall/graph-expander";
import { relevanceScorer, temporalScorer } from "../domain/recall/curate";
import { RecallService } from "../domain/recall/recall-service";
import { SessionManager } from "../domain/session/session-service";
import { SessionSync } from "../domain/session/session-sync-service";

import { ProfileManager } from "../domain/profile/ProfileManager";
import { RepoContext } from "./repo-context";
import type { Logger } from "../domain/ports/logger";
import type { FsClient, OpenVikingClient } from "../domain/client/open-viking-client";
import type { PiOVConfig } from "./config";

export async function init(cwd: string): Promise<{
  config: PiOVConfig;
  logger: Logger;
  adapter: OVAdapter;
  ovClient: OpenVikingClient;
  profileManager: ProfileManager;
  graphExpander: GraphExpander | undefined;
  recallCurator: RecallCurator;
  sessionService: SessionManager;
  recallService: RecallService;
  repoContext: RepoContext;
  sessionSync: SessionSync;
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
        clientAdapter,
        clientAdapter,
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

  const sessionSync = new SessionSync(sessionService, adapter, logger);

  const recallService = new RecallService(
    clientAdapter,
    recallCurator,
    config.recall,
    logger,
    true,
  );

  // SkillStore and ResourceStore are registered via adapter above — no pass-through service needed

  // RepoContext: lists viking://resources/ with TTL cache for system prompt injection
  const repoContext = new RepoContext(clientAdapter, logger);

  return {
    config,
    logger,
    adapter,
    ovClient: clientAdapter,
    profileManager,
    graphExpander,
    recallCurator,
    sessionService,
    sessionSync,
    recallService,
    repoContext,
  };
}

export function shutdown(): void {
  // zero I/O — reset state only
}
