import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Uri } from "../../domain/common/uri";
import type { FsClient } from "../../domain/client/open-viking-client";

export function createOvTreeCommand(client: FsClient) {
  return {
    description: "Show the OV filesystem tree. Usage: /ov-tree [uri]",
    getArgumentCompletions: (_prefix: string) => null,
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const uriStr = args.trim() || "viking://";
      let uri: Uri;
      try {
        uri = new Uri(uriStr);
      } catch {
        ctx.ui.notify(`Invalid URI: ${uriStr}`, "warning");
        return;
      }

      try {
        const entries = await client.tree(uri, ctx.signal ?? undefined);
        if (entries.length === 0) {
          ctx.ui.notify("(empty)", "info");
          return;
        }
        const formatted = formatTree(entries);
        ctx.ui.notify(formatted, "info");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.ui.notify(`Tree failed: ${msg}`, "error");
      }
    },
  };
}

function formatTree(entries: { uri: Uri; type: "file" | "directory" }[]): string {
  if (entries.length === 0) return "(empty)";

  // Find common prefix to compute relative paths for indentation
  const uris = entries.map((e) => e.uri.toString());
  const commonPrefix = findCommonPrefix(uris);

  const lines = entries.map((e) => {
    const rel = e.uri.toString().slice(commonPrefix.length).replace(/^\//, "");
    const depth = rel.split("/").length - 1;
    const indent = "  ".repeat(depth);
    const icon = e.type === "directory" ? "📁" : "📄";
    const name = rel.split("/").pop() || rel;
    return `${indent}${icon} ${name}`;
  });

  return lines.join("\n");
}

function findCommonPrefix(uris: string[]): string {
  if (uris.length === 0) return "";
  let prefix = uris[0];
  for (let i = 1; i < uris.length; i++) {
    while (uris[i].indexOf(prefix) !== 0) {
      prefix = prefix.slice(0, -1);
      if (prefix === "") return "";
    }
  }
  // ensure prefix ends with /
  const lastSlash = prefix.lastIndexOf("/");
  return lastSlash >= 0 ? prefix.slice(0, lastSlash + 1) : prefix;
}
