export function resolveSearchMode(
  requestedMode: "auto" | "fast" | "deep" | undefined,
  query: string,
  sessionId?: string,
): "fast" | "deep" {
  if (requestedMode === "fast" || requestedMode === "deep") {
    return requestedMode;
  }
  if (sessionId) {
    return "deep";
  }
  const normalized = query.trim();
  const wordCount = normalized ? normalized.split(/\s+/).length : 0;
  if (normalized.includes("?") || normalized.length >= 80 || wordCount >= 8) {
    return "deep";
  }
  return "fast";
}
