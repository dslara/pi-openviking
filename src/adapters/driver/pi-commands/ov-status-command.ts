import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { SessionManager } from "../../../domain/services/session-service";
import type { RecallService } from "../../../domain/recall/recall-service";
import type { OVAdapterConfig } from "../../../infrastructure/config";
import type { RecallConfig } from "../../../domain/common/recall-config";
import type { SystemStatusClient } from "../../driven/openviking/system-status";

export function createOvStatusCommand(
  ovConfig: OVAdapterConfig,
  sessionService: SessionManager,
  recallService: RecallService,
  recallConfig: RecallConfig,
  systemStatus?: SystemStatusClient,
) {
  return {
    description: "Show OpenViking connection state, active session, recall toggle, server status, and target scope",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      const endpoint = ovConfig.endpoint;
      const active = sessionService.getActive();
      const activeStr = active ? active.toString() : "none";
      const recallOn = recallService.isEnabled() ? "on" : "off";
      const targetScope = recallConfig.targetUri ?? "(global)";
      const searchMode = recallConfig.searchMode;

      // Fetch live server status (graceful fallback)
      let serverStatus = "unavailable";
      let serverUser = "";
      if (systemStatus) {
        const status = await systemStatus.getStatus();
        if (status.initialized) {
          serverStatus = "live";
          serverUser = status.user ? ` (user: ${status.user})` : "";
        }
      }

      const lines = [
        `Endpoint: ${endpoint}`,
        `Server: ${serverStatus}${serverUser}`,
        `Active Session: ${activeStr}`,
        `Recall: ${recallOn}`,
        `Target Scope: ${targetScope}`,
        `Search Mode: ${searchMode}`,
      ];

      ctx.ui.notify(lines.join("\n"), "info");
    },
  };
}
