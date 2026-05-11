import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import type { OpenVikingClient } from "../ov-client/client";
import { defineTool } from "../shared/tool-def";
import { resolveSource } from "../importer/source-resolver";

const MEMIMPORT_PARAMS = Type.Object({
  source: Type.String({ description: "URL (http://, https://, git://) or local file path to import" }),
  kind: Type.Optional(Type.Union([
    Type.Literal("resource"),
    Type.Literal("skill"),
  ], { description: "Import kind: resource (default) or skill", default: "resource" })),
  reason: Type.Optional(Type.String({ description: "Optional documentation of import intent" })),
  to: Type.Optional(Type.String({ description: "Optional target URI controlling where resource lands in the viking:// tree" })),
});

export function registerMemimportTool(pi: ExtensionAPI, client: OpenVikingClient) {
  defineTool(pi, { client }, {
    name: "memimport",
    label: "Memory Import",
    description:
      "Import a remote URL or local file into the OpenViking knowledge base. " +
      "Supports http://, https://, and git:// URLs, as well as local filesystem paths. " +
      "Use kind=skill to import as a skill. Optional reason and to params control metadata and placement.",
    promptSnippet: "Import a URL or local file into OpenViking",
    parameters: MEMIMPORT_PARAMS,

    async execute({ params, deps, signal }) {
      const resolved = await resolveSource(params.source, params.kind ?? "resource", params.reason, params.to);

      if (resolved.type === "directory") {
        const result = await resolved.upload(deps.client, signal);
        return { text: `Imported: ${result.root_uri} (status: ${result.status})` };
      }

      if (resolved.type === "file") {
        const upload = await deps.client.tempUpload(resolved.body, resolved.filename, signal);
        resolved.params.temp_file_id = upload.temp_file_id;
      }

      const result = await deps.client.addResource(resolved.params, signal);
      return { text: `Imported: ${result.root_uri} (status: ${result.status})` };
    },
  });
}
