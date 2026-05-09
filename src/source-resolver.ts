import { stat } from "node:fs/promises";
import { basename } from "node:path";
import { readFile } from "node:fs/promises";
import type { OpenVikingClient } from "./client";

export interface ImportResult {
  root_uri: string;
  status: string;
  errors: string[];
}

type AddParams = {
  path?: string;
  temp_file_id?: string;
  kind: "resource" | "skill";
  parent?: string;
  reason?: string;
};

export type ResolvedSource =
  | { type: "url"; params: AddParams }
  | { type: "file"; params: AddParams; body: Buffer; filename: string }
  | { type: "directory"; upload: (client: OpenVikingClient, signal?: AbortSignal) => Promise<ImportResult> };

export async function resolveSource(
  source: string,
  kind: "resource" | "skill",
  reason?: string,
  to?: string,
): Promise<ResolvedSource> {
  const isUrl = /^https?:\/\/|^git:\/\//.test(source);

  if (isUrl) {
    const params: AddParams = { path: source, kind };
    if (reason) params.reason = reason;
    if (to) params.parent = to;
    return { type: "url", params };
  }

  const stats = await stat(source);

  if (stats.isDirectory()) {
    const { uploadDirectory } = await import("./uploader");
    const dirSource = source;
    const dirKind = kind;
    const dirReason = reason;
    const dirTo = to;
    return {
      type: "directory",
      upload: (client, signal) =>
        uploadDirectory(client, dirSource, { kind: dirKind, reason: dirReason, parent: dirTo }, signal),
    };
  }

  const body = await readFile(source);
  const filename = basename(source);

  const params: AddParams = { kind };
  if (reason) params.reason = reason;
  if (to) params.parent = to;

  return { type: "file", params, body, filename };
}
