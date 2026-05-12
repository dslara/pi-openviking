import type { OpenVikingClient, BrowseResult } from "../ov-client/client";

export interface BrowseInput {
  uri: string;
  view: "list" | "tree" | "stat";
  recursive?: boolean;
  simple?: boolean;
}

export async function browseOp(
  client: OpenVikingClient,
  input: BrowseInput,
  signal?: AbortSignal,
): Promise<BrowseResult> {
  switch (input.view) {
    case "tree":
      return client.fsTree(input.uri, signal);
    case "stat":
      return client.fsStat(input.uri, signal);
    default:
      return client.fsList(input.uri, signal, input.recursive, input.simple);
  }
}
