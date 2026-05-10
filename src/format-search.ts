import type { SearchResult, MemorySearchItem, ResourceSearchItem, SkillSearchItem } from "./client";

function formatItem(item: MemorySearchItem | ResourceSearchItem | SkillSearchItem, type: string): string {
  const score = item.score.toFixed(2);
  const uri = item.uri;
  let text = "";
  if (type === "memory") {
    text = (item as MemorySearchItem).text ?? "";
  } else {
    text = (item as ResourceSearchItem | SkillSearchItem).abstract ?? "";
  }
  const preview = text.length > 200 ? text.slice(0, 200) + "…" : text;
  const parts: string[] = [];
  parts.push(`  [${score}] ${uri || "(memory)"}`);
  if (preview) parts.push(`    ${preview}`);
  return parts.join("\n");
}

export function formatSearch(result: SearchResult, query: string): string {
  const lines: string[] = [];
  lines.push(`OpenViking search: "${query}"`);
  lines.push(`Total: ${result.total}`);

  if (result.memories.length > 0) {
    lines.push("\nMemories:");
    for (const m of result.memories) lines.push(formatItem(m, "memory"));
  }

  if (result.resources.length > 0) {
    lines.push("\nResources:");
    for (const r of result.resources) lines.push(formatItem(r, "resource"));
  }

  if (result.skills && result.skills.length > 0) {
    lines.push("\nSkills:");
    for (const s of result.skills) lines.push(formatItem(s, "skill"));
  }

  if (result.total === 0) {
    lines.push("\nNo results found.");
  }

  return lines.join("\n");
}
