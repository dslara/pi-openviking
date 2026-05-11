import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { zipSync } from "fflate";
import type { OpenVikingClient } from "../ov-client/client";

const EXCLUDED_DIRS = new Set([".git", "node_modules"]);

export interface UploadDirectoryOptions {
  kind?: "resource" | "skill";
  reason?: string;
  parent?: string;
}

export async function uploadDirectory(
  client: OpenVikingClient,
  dirPath: string,
  options?: UploadDirectoryOptions,
  signal?: AbortSignal,
): Promise<{ root_uri: string; status: string; errors: string[] }> {
  const files: Record<string, Uint8Array> = {};

  function walk(dir: string) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRS.has(entry.name)) {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        const rel = relative(dirPath, fullPath);
        files[rel] = new Uint8Array(readFileSync(fullPath));
      }
    }
  }

  walk(dirPath);

  const zipped = zipSync(files, { level: 6 });
  const dirname = dirPath.replace(/\\/g, "/").split("/").pop() || "archive";
  const filename = `${dirname}.zip`;

  const upload = await client.tempUpload(zipped, filename, signal);
  return client.addResource({
    temp_file_id: upload.temp_file_id,
    kind: options?.kind ?? "resource",
    reason: options?.reason,
    parent: options?.parent,
  }, signal);
}
