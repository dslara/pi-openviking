/**
 * Auto-detect profile based on workspace path.
 *
 * Matches cwd against a set of glob rules
 * (e.g., `star/star/web-app/star/star` maps to "web-dev").
 * Simple glob matcher without external dependencies.
 */

export function autoDetectProfile(
  cwd: string,
  rules: Record<string, string>,
): string | null {
  const entries = Object.entries(rules);
  if (entries.length === 0) return null;

  // Normalize backslashes to forward slashes (Windows support)
  const normalized = cwd.replace(/\\/g, "/");

  for (const [pattern, profileName] of entries) {
    if (matchGlob(normalized, pattern)) {
      return profileName;
    }
  }

  return null;
}

/**
 * Simple glob matcher for path patterns.
 * Supports globstar and single-star wildcards.
 */
function matchGlob(path: string, pattern: string): boolean {
  // Escape regex special chars, then convert glob wildcards to regex
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "<<GS>>")
    .replace(/\*/g, "[^/]*")
    .replace(/<<GS>>/g, ".*")
    .replace(/\?/g, "[^/]");

  return new RegExp(`^${regexStr}$`).test(path);
}
