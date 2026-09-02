import { describe, it, expect, vi } from "vitest";
import { SystemStatusClient } from "./system-status";
import type { Transport } from "./transport";

function mockTransport(): Transport {
  return {
    request: vi.fn(),
  } as unknown as Transport;
}

describe("SystemStatusClient", () => {
  it("returns initialized and user on success", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      initialized: true,
      user: "alice",
    });

    const client = new SystemStatusClient(transport);
    const status = await client.getStatus();

    expect(status.initialized).toBe(true);
    expect(status.user).toBe("alice");
    const [label, path] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(label).toBe("SystemStatus.getStatus");
    expect(path).toBe("/api/v1/system/status");
  });

  it("returns fallback on HTTP error (503)", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("OV /api/v1/system/status returned 503"),
    );

    const client = new SystemStatusClient(transport);
    const status = await client.getStatus();

    expect(status.initialized).toBe(false);
    expect(status.user).toBeUndefined();
  });

  it("returns fallback on connection error (fetch failed)", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("fetch failed"),
    );

    const client = new SystemStatusClient(transport);
    const status = await client.getStatus();

    expect(status.initialized).toBe(false);
    expect(status.user).toBeUndefined();
  });

  it("never throws on any error", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("unexpected error"),
    );

    const client = new SystemStatusClient(transport);
    await expect(client.getStatus()).resolves.toEqual({ initialized: false });
  });
});
