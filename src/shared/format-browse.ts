import type { BrowseResult } from "../ov-client/client";

function formatChildren(children: BrowseResult["children"], indent = 0): string[] {
  const lines: string[] = [];
  for (const child of children) {
    const prefix = "  ".repeat(indent);
    lines.push(`${prefix}- ${child.uri} (${child.type})`);
    if (child.abstract) lines.push(`${prefix}  ${child.abstract}`);
  }
  return lines;
}

function formatTree(children: BrowseResult["children"], prefix = ""): string[] {
  const lines: string[] = [];
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const isLast = i === children.length - 1;
    const branch = isLast ? "└── " : "├── ";
    lines.push(`${prefix}${branch}${child.uri} (${child.type})`);
    if (child.abstract) lines.push(`${prefix}${isLast ? "    " : "│   "}${child.abstract}`);
    if ("children" in child && Array.isArray((child as any).children)) {
      lines.push(...formatTree((child as any).children, prefix + (isLast ? "    " : "│   ")));
    }
  }
  return lines;
}

export function formatBrowse(result: BrowseResult, view: "list" | "tree" | "stat" = "list"): string {
  const lines: string[] = [];
  lines.push(`URI: ${result.uri}`);

  if (view === "stat") {
    const entry = result.children[0];
    if (entry) {
      lines.push(`Type: ${entry.type}`);
      if (entry.abstract) lines.push(`Name: ${entry.abstract}`);
    }
    return lines.join("\n");
  }

  if (view === "tree") {
    if (result.children.length === 0) {
      lines.push("No children.");
    } else {
      lines.push(...formatTree(result.children));
    }
    return lines.join("\n");
  }

  // list view
  if (result.children.length === 0) {
    lines.push("No children.");
  } else {
    lines.push("Children:");
    lines.push(...formatChildren(result.children));
  }

  return lines.join("\n");
}
