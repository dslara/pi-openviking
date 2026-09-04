/**
 * Adapter for OV system/status endpoint.
 *
 * See OV 07-system.md: GET /api/v1/system/status
 * Returns { initialized, user } on success.
 */
import type { Transport } from "./transport";
import type { OVSystemStatusResponse } from './ov-system';

export interface SystemStatus {
  initialized: boolean;
  user?: string;
}

export class SystemStatusClient {
  constructor(private readonly transport: Transport) {}

  /**
   * Fetch system status from OV.
   * Returns fallback values on any error — never throws.
   */
  async getStatus(): Promise<SystemStatus> {
    try {
      const raw = await this.transport.request<OVSystemStatusResponse>(
        "SystemStatus.getStatus",
        "/api/v1/system/status",
        undefined,
      );
      return {
        initialized: raw.initialized ?? false,
        user: raw.user,
      };
    } catch {
      return { initialized: false };
    }
  }
}
