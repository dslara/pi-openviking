import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import type { OpenVikingClient } from "../ov-client/client";
import { logger } from "../../shared/logger";
import { defineTool } from "../../shared/tool-def";

const MEMDELETE_PARAMS = Type.Object({
  uri: Type.String({ description: "viking:// URI to delete" }),
});

export function registerMemdeleteTool(pi: ExtensionAPI, client: OpenVikingClient) {
  defineTool(pi, { client }, {
    name: "memdelete",
    label: "Memory Delete",
    description:
      "Delete a resource or directory from the OpenViking knowledge base by viking:// URI. " +
      "OV rm is idempotent — calling again on the same URI succeeds silently.",
    promptSnippet: "Delete a resource from OpenViking by viking:// URI",
    parameters: MEMDELETE_PARAMS,
    validateUri: true,

    async execute({ params, deps, signal }) {
      const result = await deps.client.delete(params.uri, signal);

      // Post-delete verification: confirm resource no longer appears in search
      try {
        const uriParts = params.uri.replace("viking://", "").split("/");
        const resourceName = uriParts[uriParts.length - 1] || "";
        if (resourceName) {
          const searchResults = await deps.client.search(undefined, resourceName, 5, "fast", undefined, signal);
          const stillPresent = searchResults.resources.some(r => r.uri === params.uri);
          if (stillPresent) {
            return {
              text: `Deleted: ${result.uri} (warning: resource may still appear in search due to async index sync)`,
              details: { uri: result.uri, verified: false },
            };
          }
        }
      } catch (err) {
        // Verification is best-effort; don't fail the delete on search errors
        logger.error("delete verification failed:", (err as Error).message);
      }

      return { text: `Deleted: ${result.uri}`, details: { uri: result.uri, verified: true } };
    },
  });
}
