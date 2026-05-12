import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { OpenVikingClient } from "../ov-client/client";
import type { SessionSyncLike } from "../session-sync/session";
import type { AutoRecallState } from "../auto-recall/auto-recall";

export interface CommandRegisterDeps {
  pi: ExtensionAPI;
  client: OpenVikingClient;
  sync: SessionSyncLike;
  autoRecallState: AutoRecallState;
}
