import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Logger } from "../../../domain/ports/logger";
import type { RecallService } from "../../../domain/recall/recall-service";
import type { SessionManager } from "../../../domain/services/session-service";
import type { OVAdapter } from "../../driven/openviking/adapter";
import type { ProfileManager } from "../../../domain/profile/service/ProfileManager";
import type { Part } from "../../../domain/common/part";
import type { SessionId } from "../../../domain/common/session-id";
import { Uri } from "../../../domain/common/uri";
import { OVWidget } from "../ov-widget";
import { RepoContext } from "../../../infrastructure/repo-context";
import { agentMessageToParts } from "./message-mapper";
import { buildTurnParts } from "./build-turn-parts";
import { SessionSync, DEFAULT_AUTO_COMMIT_INTERVAL_MS } from "../../../domain/services/session-sync-service";
import { RecallCache } from "../../../domain/common/recall-cache";

// ── Shared bag of services consumed by lifecycle hooks and per-session handler ──

export interface LifecycleServices {
  logger: Logger;
  sessionService: SessionManager;
  recallService: RecallService;
  adapter: OVAdapter;
  widget: OVWidget;
  profileManager: ProfileManager;
  repoContext?: RepoContext;
  autoDetectRules?: Record<string, string>;
  autoCommitIntervalMs?: number;
  sessionSync: SessionSync;
}

// ── Simple string hash for cache keys ──

function hashString(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    const char = s.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return hash.toString(36);
}

/**
 * Extract the text content of the latest user message from the message array.
 * Returns empty string if no user message found.
 *
 * Accepts AgentMessage[] which may include custom message types (BashExecutionMessage, etc.)
 * that lack a `content` field — handled via the `msg` role guard + optional chaining.
 */
function extractLatestUserText(messages: readonly { role: string; content?: unknown }[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "user") {
      const content = msg.content;
      if (typeof content === "string") return content;
      // If content is an array, concatenate text parts
      if (Array.isArray(content)) {
        return content
          .filter((p: any) => p.type === "text")
          .map((p: any) => p.text)
          .join(" ");
      }
    }
  }
  return "";
}

// ── Init-time: register Pi lifecycle hooks (runs once per process) ──

export function registerLifecycleHooks(pi: ExtensionAPI, svcs: LifecycleServices): void {
  const { logger, sessionService, recallService, adapter, widget, repoContext, sessionSync } = svcs;

  // ── AutoCommit timer: periodically commits active session ──
  const autoCommitInterval = svcs.autoCommitIntervalMs ?? DEFAULT_AUTO_COMMIT_INTERVAL_MS;
  if (autoCommitInterval > 0) {
    sessionSync.startAutoCommit(autoCommitInterval);
  }

  // before_agent_start: inject repo context into system prompt (separate from memory recall)
  pi.on("before_agent_start", async (event) => {
    if (!repoContext) return;
    const snippet = await repoContext.getSystemPromptSnippet();
    if (snippet) {
      return {
        systemPrompt: event.systemPrompt + "\n\n" + snippet,
      };
    }
  });

  // Context hook: auto-recall with cache, fires before each LLM call
  // Replaces the former before_agent_start approach (see ADR-019).
  const cache = new RecallCache();

  pi.on("context", async (event) => {
    // Guard 1: recall toggle
    if (!recallService.isEnabled()) {
      widget.update("lastRecall", "");
      return; // No injection when recall off — guard becomes log-only per ADR-019
    }

    // Guard 2: circuit breaker OPEN
    if (adapter.circuitBreakerOpen) {
      widget.update("lastRecall", "");
      logger?.debug("context: circuit breaker open, skipping recall");
      return;
    }

    // Extract latest user text for the recall query
    const query = extractLatestUserText(event.messages);
    if (!query) {
      logger?.debug("context: no user message text, skipping recall");
      return;
    }

    const queryHash = hashString(query);

    // Check cache: if same query hash exists, return cached block
    const cached = cache.get(queryHash);
    if (cached) {
      // Same query in same turn — inject cached block
      widget.update("lastRecall", cache.getStats(queryHash) ?? "");
      logger?.debug("context: recall cache hit", { queryHash });
      return {
        messages: [
          ...event.messages,
          {
            role: "custom" as const,
            customType: "memory_context",
            content: cached,
            display: false,
            timestamp: Date.now(),
          },
        ],
      };
    }

    // Guard 3: no active session — auto-create as fallback
    let sessionId = sessionService.getActive();
    if (!sessionId) {
      try {
        sessionId = await sessionService.createAndSet();
        widget.update("session", sessionId.toString());
        logger?.info("context: auto-created OV session", { sessionId: sessionId.toString() });
      } catch {
        logger?.warn("context: failed to auto-create OV session");
        return;
      }
    }

    // Recall — wrap in try/catch so the hook never throws
    let result;
    try {
      result = await recallService.recall(query, sessionId);
    } catch (err) {
      logger?.warn("context: recall threw unexpectedly", { error: (err as Error).message });
      return;
    }

    if (result.timedOut) {
      logger?.debug("context: recall timed out");
      return;
    }
    if (!result.formatted) {
      widget.update("lastRecall", "0it 0tk");
      logger?.debug("context: no relevant memories found");
      return;
    }

    // Track used contexts so OV can improve ranking
    const usedItems = result.items ?? [];
    if (usedItems.length > 0) {
      const usedUris = usedItems.map((item: { uri: string }) => new Uri(item.uri));
      sessionService.sessionUsed(sessionId, usedUris).catch((err) => {
        logger?.warn("context: failed to record used contexts", { error: (err as Error).message });
      });
    }

    // Update widget with recall stats
    const recallStats = `${usedItems.length}it ${result.tokens}tk`;
    widget.update("lastRecall", recallStats);

    // Cache the result by query hash
    cache.set(queryHash, result.formatted, recallStats);

    // Inject as a custom message appended after user messages
    return {
      messages: [
        ...event.messages,
        {
          role: "custom" as const,
          customType: "memory_context",
          content: result.formatted,
          display: false,
          timestamp: Date.now(),
        },
      ],
    };
  });

  // message_end: sync user messages to OV session immediately
  pi.on("message_end", async (event) => {
    if (event.message.role !== "user") return;

    const active = sessionService.getActive();
    if (!active) {
      logger?.debug("message_end: no active session, skipping user sync");
      return;
    }

    const parts = agentMessageToParts(event.message);
    if (parts.length === 0) return;

    await sessionSync.onMessageEnd(active, "user", parts);
  });

  // turn_end: sync assistant message + tool results as one structured message
  pi.on("turn_end", async (event) => {
    const active = sessionService.getActive();
    if (!active) {
      logger?.debug("turn_end: no active session, skipping");
      return;
    }

    const assistantParts = agentMessageToParts(event.message);
    if (assistantParts.length === 0) return;

    const merged = buildTurnParts(assistantParts, event.toolResults);

    await sessionSync.onTurnEnd(active, merged, event.toolResults);
  });

  // session_before_switch: commit active session before switching to another
  pi.on("session_before_switch", async (_event, ctx) => {
    const active = sessionService.getActive();
    if (!active) {
      logger?.debug("session_before_switch: no active session, nothing to commit");
      return;
    }

    await sessionSync.onBeforeSwitch(active, { confirm: ctx.ui.confirm });
  });

  // session_shutdown: commit active session, clear recall cache
  pi.on("session_shutdown", async () => {
    const active = sessionService.getActive();
    if (!active) {
      logger?.debug("session_shutdown: no active session, skipping commit");
      return;
    }

    await sessionSync.onShutdown(active);
    cache.invalidate();
  });
}

// ── Per-session: run on every session_start (including fork/resume/reload) ──

/**
 * Minimum number of items for chunking when re-hydrating a session.
 * OV batch endpoint accepts up to 100 messages per call; 50 is a safe conservative limit.
 */
const REHYDRATE_CHUNK_SIZE = 50;

/**
 * Map a Pi session entry to MessageInput for agentMessageToParts.
 * getBranch() entries have shape { type: "message", message: { role, content, ... } }.
 * message_end event passes { role, content } directly — both handled here.
 */
function entryToMessageInput(entry: {
  type?: string;
  message?: {
    role: string;
    content?: string | Array<{ type: string; text?: string; id?: string; name?: string; arguments?: Record<string, unknown> }>;
    toolCallId?: string;
    toolName?: string;
    isError?: boolean;
  };
  // Direct role/content for message_end event shape fallback
  role?: string;
  content?: string | Array<{ type: string; text?: string; id?: string; name?: string; arguments?: Record<string, unknown> }>;
}): { role: string; content?: string | Array<{ type: string; text?: string; id?: string; name?: string; arguments?: Record<string, unknown> }> } {
  // getBranch() entries: { type: "message", message: { role, content } }
  if (entry.type === "message" && entry.message) {
    const m = entry.message;
    return { role: m.role, content: m.content };
  }
  // Fallback for direct { role, content } shape
  return { role: (entry as any).role ?? "", content: (entry as any).content };
}

export async function handleSessionStart(
  ctx: { cwd: string; ui: any; sessionManager?: { getBranch?: () => unknown[] } },
  svcs: LifecycleServices,
  reason?: string,
): Promise<void> {
  const { widget, sessionService, recallService, logger, profileManager, autoDetectRules } = svcs;

  // F7b: Auto-detect profile from workspace path
  if (profileManager && autoDetectRules) {
    const { autoDetectProfile } = await import("../../../domain/profile/service/auto-detect");
    const detected = autoDetectProfile(ctx.cwd, autoDetectRules);
    if (detected) {
      profileManager.apply(detected);
      logger.info(`auto-detected profile: ${detected}`);
    }
  }

  widget.attach(ctx.ui);

  try {
    await sessionService.createAndSet();
    const active = sessionService.getActive();
    widget.update("session", active?.toString() ?? "-");
    widget.update("recall", recallService.isEnabled() ? "on" : "off");

    // ── Re-hydrate on resume/fork — replay previous session history into OV ──
    if ((reason === "resume" || reason === "fork") && active) {
      await rehydrateSession(ctx, sessionService, active, logger);
    }
  } catch {
    widget.update("session", "none");
  }
}

/**
 * Re-hydrate a new OV session with recent entries from the previous Pi session.
 * Reads last 50 entries from session history, filters to user/assistant,
 * maps via agentMessageToParts(), and sends in batches.
 */
async function rehydrateSession(
  ctx: { cwd: string; ui: any; sessionManager?: { getBranch?: () => unknown[] } },
  sessionService: SessionManager,
  active: SessionId,
  logger?: Logger,
): Promise<void> {
  const branch = ctx.sessionManager?.getBranch?.();
  if (!branch || !Array.isArray(branch) || branch.length === 0) {
    logger?.debug("rehydrate: no branch entries found, skipping");
    return;
  }

  // Last 50 entries only
  const entries = branch.slice(-REHYDRATE_CHUNK_SIZE);

  // Filter to user and assistant, map to OV message batches
  const messages: { role: string; content: Part[] }[] = [];

  for (const entry of entries) {
    const input = entryToMessageInput(entry as any);
    if (input.role !== "user" && input.role !== "assistant") continue;

    const parts = agentMessageToParts(input as any);
    if (parts.length === 0) continue;

    messages.push({ role: input.role, content: parts });
  }

  if (messages.length === 0) {
    logger?.debug("rehydrate: no user/assistant messages found, skipping");
    return;
  }

  logger?.info(`rehydrating ${messages.length} message(s) into OV session`);

  // Send in chunks of REHYDRATE_CHUNK_SIZE (safe limit for OV batch endpoint)
  for (let i = 0; i < messages.length; i += REHYDRATE_CHUNK_SIZE) {
    const chunk = messages.slice(i, i + REHYDRATE_CHUNK_SIZE);
    await sessionService.sendMessages(active, chunk);
  }

  logger?.debug(`rehydrate complete: ${messages.length} message(s) sent`);
}
