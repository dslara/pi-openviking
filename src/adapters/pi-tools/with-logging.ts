import type { Logger } from "../../domain/ports/logger";

export async function withLogging<T>(
  logger: Logger,
  label: string,
  fn: () => Promise<{ value: T; extra?: Record<string, unknown> }>,
): Promise<T> {
  const start = Date.now();
  try {
    const { value, extra } = await fn();
    logger.info(`${label} completed`, { durationMs: Date.now() - start, ...extra });
    return value;
  } catch (err) {
    const durationMs = Date.now() - start;
    logger.error(`${label} failed`, { durationMs, error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}
