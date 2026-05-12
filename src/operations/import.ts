import type { OpenVikingClient } from "../ov-client/client";
import { resolveSource } from "../importer/source-resolver";

export interface ImportInput {
  source: string;
  kind?: "resource" | "skill";
  reason?: string;
  to?: string;
}

export interface ImportResult {
  root_uri: string;
  status: string;
}

export async function importOp(
  client: OpenVikingClient,
  input: ImportInput,
  signal?: AbortSignal,
): Promise<ImportResult> {
  const resolved = await resolveSource(
    input.source,
    input.kind ?? "resource",
    input.reason,
    input.to,
  );

  if (resolved.type === "directory") {
    return resolved.upload(client, signal);
  }

  if (resolved.type === "file") {
    const upload = await client.tempUpload(resolved.body, resolved.filename, signal);
    resolved.params.temp_file_id = upload.temp_file_id;
  }

  return client.addResource(resolved.params, signal);
}
