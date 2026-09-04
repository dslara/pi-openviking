import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { init } from "./infrastructure/lifecycle";
import { registerAllTools } from "./adapters/pi-tools/tool-registry";
import { registerAllCommands } from "./adapters/pi-commands/command-registry";
import { OVWidget } from "./adapters/ui/ov-widget";
import { SystemStatusClient } from "./adapters/ov-client/system-status";
import {
  registerLifecycleHooks,
  handleSessionStart,
  type LifecycleServices,
} from "./adapters/pi-lifecycle/register-lifecycle-hooks";

let initialized = false;
let lifecycleServices: LifecycleServices;

export default async function openVikingExtension(pi: ExtensionAPI): Promise<void> {
  pi.on("session_start", async (_event, ctx) => {
    // One-time initialization (guard prevents re-init on fork/resume/reload)
    if (!initialized) {
      const result = await init(ctx.cwd);
      const {
        config,
        logger,
        repoContext,
        adapter,
        ovClient,
        profileManager,
        sessionService,
        recallService,
      } = result;

      // Create shared widget instance (Driver adapter, not DI-registered)
      const widget = new OVWidget();

      const systemStatus = new SystemStatusClient(adapter.transport);

      // Register tools and commands (once per process)

      registerAllTools(pi, {
        searchClient: ovClient,
        recallConfig: config.recall,
        fsClient: ovClient,
        recallService,
        resourceClient: ovClient,
        skillClient: ovClient,
        sessionService,
      }, logger);
      registerAllCommands(pi, {
        recallService,
        sessionService,
        searchClient: ovClient,
        fsClient: ovClient,
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
        sessionSync: result.sessionSync,
      };
      registerLifecycleHooks(pi, lifecycleServices);

      initialized = true;
    }

    // Per-session work (runs on every session_start including fork/resume)
    await handleSessionStart(ctx, lifecycleServices, (_event as any).reason);
  });
}
