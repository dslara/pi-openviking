import { Type } from "@sinclair/typebox";
import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { SessionManager } from "../../domain/session/session-service";
import { SessionId } from "../../domain/common/session-id";

const SessionSchema = Type.Object({
  sessionId: Type.Optional(Type.String({ description: "Session ID (defaults to active session)" })),
});

export function createOvSessionTool(
  svc: SessionManager,
): ToolDefinition<typeof SessionSchema> {
  return defineTool({
    name: "ov_session",
    label: "Session Info",
    description: "Get OpenViking session metadata (message count, commit count, memories extracted, etc.). Uses active session by default.",
    promptSnippet: "ov_session(sessionId?) — get OV session info",
    parameters: SessionSchema,
    async execute(_toolCallId, params, signal) {
      try {
        let sessionId = svc.getActive();

        if (params.sessionId) {
          sessionId = new SessionId(params.sessionId);
        }

        if (!sessionId) {
          return {
            content: [{ type: "text" as const, text: "No active session. Use `/ov-start` or wait for auto-create on next turn." }],
            details: undefined,
          };
        }

        const info = await svc.getSession(sessionId);

        return {
          content: [{ type: "text" as const, text: JSON.stringify(info, null, 2) }],
          details: undefined,
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Session info failed: ${err instanceof Error ? err.message : String(err)}` }],
          details: undefined,
        };
      }
    },
  });
}
