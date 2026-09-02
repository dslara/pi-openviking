import type { Part } from "../common/part";
import type { SessionId } from "../common/session-id";
import type { SessionManager } from "./session-service";
import type { Logger } from "../ports/logger";

const RETRY_DELAY_MS = 500;

export const DEFAULT_AUTO_COMMIT_INTERVAL_MS = 5 * 60 * 1000;

export type ConfirmFn = (title: string, message: string) => Promise<boolean>;

export class SessionSync {
  #dirtySinceLastCommit = false;
  #skipShutdownCommit = false;
  #autoCommitTimer: ReturnType<typeof setInterval> | null = null;
  readonly #sessionService: SessionManager;
  readonly #adapter: { circuitBreakerOpen: boolean };
  readonly #logger: Logger;

  constructor(
    sessionService: SessionManager,
    adapter: { circuitBreakerOpen: boolean },
    logger: Logger,
  ) {
    this.#sessionService = sessionService;
    this.#adapter = adapter;
    this.#logger = logger;
  }

  isDirty(): boolean {
    return this.#dirtySinceLastCommit;
  }

  getActiveSession(): SessionId | null {
    return this.#sessionService.getActive();
  }

  async onMessageEnd(sessionId: SessionId, role: string, parts: Part[]): Promise<void> {
    if (this.#adapter.circuitBreakerOpen) {
      this.#logger.debug("onMessageEnd: circuit breaker open, skipping sync");
      return;
    }
    if (parts.length === 0) return;

    try {
      await this.#sessionService.sendMessage(sessionId, role, parts);
      this.#dirtySinceLastCommit = true;
    } catch (err) {
      this.#logger.warn("onMessageEnd: failed to send message, retrying in 500ms", { error: (err as Error).message });
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      try {
        await this.#sessionService.sendMessage(sessionId, role, parts);
        this.#dirtySinceLastCommit = true;
      } catch (err2) {
        this.#logger.warn("onMessageEnd: failed to send message after retry", { error: (err2 as Error).message });
      }
    }
  }

  async onTurnEnd(sessionId: SessionId, parts: Part[]): Promise<void> {
    if (this.#adapter.circuitBreakerOpen) {
      this.#logger.debug("onTurnEnd: circuit breaker open, skipping sync");
      return;
    }
    if (parts.length === 0) return;

    try {
      await this.#sessionService.sendMessage(sessionId, "assistant", parts);
      this.#dirtySinceLastCommit = true;
    } catch (err) {
      this.#logger.warn("onTurnEnd: failed to send message", { error: (err as Error).message });
    }
  }

  async onBeforeSwitch(
    sessionId: SessionId,
    opts?: { confirm?: ConfirmFn; onCommitted?: () => void },
  ): Promise<{ cancel: boolean } | void> {
    // CB open — skip commit, don't block switch
    if (this.#adapter.circuitBreakerOpen) {
      this.#logger.debug("onBeforeSwitch: CB open, skipping commit");
      return;
    }

    // Attempt commit once
    let commitErr: Error | undefined;
    try {
      await this.#sessionService.commit(sessionId);
    } catch (err) {
      commitErr = err as Error;
    }

    // Retry once with backoff on failure
    if (commitErr) {
      this.#logger.warn("onBeforeSwitch: commit failed, retrying...", { error: commitErr.message });
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      try {
        await this.#sessionService.commit(sessionId);
        commitErr = undefined;
      } catch (err2) {
        commitErr = err2 as Error;
      }
    }

    if (commitErr) {
      // Both attempts failed — prompt user if confirm function provided
      if (opts?.confirm) {
        const proceed = await opts.confirm(
          "OV Commit Failed",
          `Failed to save session: ${commitErr.message}. Proceed with switch anyway?`,
        );
        if (!proceed) {
          this.#logger.debug("onBeforeSwitch: user cancelled switch after commit failure");
          return { cancel: true };
        }
      }
      // User chose to proceed or no confirm fn — skipShutdownCommit stays false
      return;
    }

    // Commit succeeded — skip duplicate commit in shutdown
    this.#skipShutdownCommit = true;
    opts?.onCommitted?.();
    this.#logger.debug("onBeforeSwitch: commit succeeded, skipShutdownCommit flag set");
  }

  async onShutdown(sessionId: SessionId): Promise<void> {
    this.stopAutoCommit();

    // C5: session_before_switch already committed — skip duplicate
    if (this.#skipShutdownCommit) {
      this.#skipShutdownCommit = false; // reset for next cycle
      this.#logger.debug("onShutdown: skipShutdownCommit flag set, skipping commit");
      return;
    }

    try {
      await this.#sessionService.commit(sessionId);
    } catch (err) {
      this.#logger.warn("onShutdown: commit failed, retrying...", { error: (err as Error).message });
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      try {
        await this.#sessionService.commit(sessionId);
      } catch (err2) {
        this.#logger.error("onShutdown: commit failed after retry — data may be lost", { error: (err2 as Error).message });
      }
    }
  }

  startAutoCommit(intervalMs: number): void {
    if (this.#autoCommitTimer !== null) {
      clearInterval(this.#autoCommitTimer);
    }
    this.#autoCommitTimer = setInterval(() => this.#onAutoCommitTick(), intervalMs);
    this.#logger.debug("auto-commit timer started", { intervalMs });
  }

  stopAutoCommit(): void {
    if (this.#autoCommitTimer !== null) {
      clearInterval(this.#autoCommitTimer);
      this.#autoCommitTimer = null;
      this.#logger.debug("auto-commit timer stopped");
    }
  }

  #onAutoCommitTick(): void {
    if (this.#adapter.circuitBreakerOpen) {
      this.#logger.debug("auto-commit: CB open, skipping cycle");
      return;
    }
    if (!this.#dirtySinceLastCommit) {
      this.#logger.debug("auto-commit: clean, skipping cycle");
      return;
    }
    this.#commitDirty();
  }

  async #commitDirty(): Promise<void> {
    const active = this.#sessionService.getActive();
    if (!active) return;

    try {
      const result = await this.#sessionService.commit(active);
      if (result.taskId) {
        // Fire-and-forget: poll task status in background
        this.#sessionService.waitForCommit(result.taskId).catch(async (err) => {
          this.#logger.warn("pollCommit: commit task timed out, retrying commit", {
            taskId: result.taskId,
            error: (err as Error).message,
          });
          try {
            await this.#sessionService.commit(active);
            this.#logger.info("pollCommit: retry commit succeeded");
          } catch (err2) {
            this.#logger.error("pollCommit: retry commit also failed", { error: (err2 as Error).message });
          }
        });
      }
      this.#dirtySinceLastCommit = false;
    } catch (err) {
      this.#logger.warn("auto-commit: commit failed", {
        sessionId: active.toString(),
        error: (err as Error).message,
      });
    }
  }
}
