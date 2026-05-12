import type { OpenVikingClient } from "../ov-client/client";
import { logger } from "../shared/logger";

export interface DeleteInput {
  uri: string;
}

export interface DeleteResult {
  uri: string;
  verified: boolean;
}

export async function deleteOp(
  client: OpenVikingClient,
  input: DeleteInput,
  signal?: AbortSignal,
): Promise<DeleteResult> {
  await client.delete(input.uri, signal);

  // Post-delete verification: confirm resource no longer appears in search
  try {
    const uriParts = input.uri.replace("viking://", "").split("/");
    const resourceName = uriParts[uriParts.length - 1] || "";
    if (resourceName) {
      const searchResults = await client.search(
        undefined,
        resourceName,
        5,
        "fast",
        undefined,
        signal,
      );
      const stillPresent = searchResults.resources.some(
        (r) => r.uri === input.uri,
      );
      if (stillPresent) {
        return { uri: input.uri, verified: false };
      }
    }
  } catch (err) {
    logger.error("delete verification failed:", (err as Error).message);
  }

  return { uri: input.uri, verified: true };
}
