import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { init } from "./infrastructure/lifecycle";
import type { OpenVikingClient } from "./domain/client/open-viking-client";

import type { RecallService } from "./domain/recall/recall-service";
import type { SessionManager } from "./domain/services/session-service";
import type { OVAdapter } from "./adapters/driven/openviking/adapter";
import type { KnowledgeBase } from "./domain/ports/knowledge-base";
import type { SkillStore } from "./domain/ports/skill-store";
import type { ResourceStore } from "./domain/ports/resource-store";
import type { ProfileManager } from "./domain/profile/service/ProfileManager";
import { registerAllTools } from "./adapters/driver/pi-tools/tool-registry";
import { registerAllCommands } from "./adapters/driver/pi-commands/command-registry";
import { OVWidget } from "./adapters/driver/ov-widget";
import { SystemStatusClient } from "./adapters/driven/openviking/system-status";
import {
  registerLifecycleHooks,
  handleSessionStart,
  type LifecycleServices,
} from "./adapters/driver/pi-lifecycle/register-lifecycle-hooks";

let initialized = false;
let lifecycleServices: LifecycleServices;

export default async function openVikingExtension(pi: ExtensionAPI): Promise<void> {
  pi.on("session_start", async (_event, ctx) => {
    // One-time initialization (guard prevents re-init on fork/resume/reload)
    if (!initialized) {
      const result = await init(ctx.cwd);
      const { config, logger, container, repoContext } = result;

      // Create shared widget instance (Driver adapter, not DI-registered)
      const widget = new OVWidget();

      // Resolve all services from DI container
      const ovClient = container.resolve<OpenVikingClient>("ovClient");

      const recallService = container.resolve<RecallService>("recallService");
      const sessionService = container.resolve<SessionManager>("sessionService");
      const knowledgeBase = container.resolve<KnowledgeBase>("knowledgeBase");
      const profileManager = container.resolve<ProfileManager>("profileManager");
      const adapter = container.resolve<OVAdapter>("adapter");

      const systemStatus = new SystemStatusClient(adapter.transport);

      // Register tools and commands (once per process)
      const skillStore = container.resolve<SkillStore>("skillStore");
      const resourceStore = container.resolve<ResourceStore>("resourceStore");
      registerAllTools(pi, {
        searchClient: ovClient,
        recallConfig: config.recall,
        fsClient: ovClient,
        recallService,
        resourceStore,
        skillStore,
        sessionService,
      }, logger);
      registerAllCommands(pi, {
        recallService,
        sessionService,
        searchClient: ovClient,
        fsClient: ovClient,
        knowledgeBase,
        profileManager,
        autoDetectRules: config.profile.autoDetectRules,
        ovConfig: config.ov,
        recallConfig: config.recall,
        widgetUpdater: (field, value) => widget.update(field, value),
        systemStatus,
      });

      // Register lifecycle hooks and store services for per-session handler
      lifecycleServices = {
        logger,
        sessionService,
        recallService,
        adapter,
        widget,
        profileManager,
        repoContext,
        autoCommitIntervalMs: config.ov.autoCommitIntervalMs,
        autoDetectRules: config.profile.autoDetectRules,
      };
      registerLifecycleHooks(pi, lifecycleServices);

      initialized = true;
    }

    // Per-session work (runs on every session_start including fork/resume)
    await handleSessionStart(ctx, lifecycleServices, (_event as any).reason);
  });
}
