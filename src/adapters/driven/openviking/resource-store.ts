/**
 * Adapter for OV resource import endpoint.
 *
 * See OV 02-resources.md.
 */
import type { Transport } from "./transport";
import { toResourceImportResult } from "./mappers/ov-mappers";
import type { ResourceImportResult, ImportOptions } from "../../../domain/client/ov-types";
import type { OVResourceImportResponse } from "./types/ov-resource";

export class ResourceStoreAdapter {
  constructor(private readonly transport: Transport) {}

  async importUrl(url: string, options?: ImportOptions, signal?: AbortSignal): Promise<ResourceImportResult> {
    const body: Record<string, unknown> = { path: url };

    if (options?.targetUri) body.to = options.targetUri;
    if (options?.reason) body.reason = options.reason;
    if (options?.wait) body.wait = true;

    const raw = await this.transport.request<OVResourceImportResponse>(
      "ResourceStore.importUrl",
      "/api/v1/resources",
      { method: "POST", body: JSON.stringify(body) },
      signal,
    );

    return toResourceImportResult(raw);
  }
}
