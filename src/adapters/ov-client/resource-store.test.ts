import { describe, it, expect, vi } from "vitest";
import { ResourceStoreAdapter } from "./resource-store";
import type { Transport } from "./transport";

function mockTransport(): Transport {
  return { request: vi.fn() } as unknown as Transport;
}

describe("ResourceStoreAdapter.importUrl", () => {
  it("calls POST /api/v1/resources with path", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "success",
      root_uri: "viking://resources/guide.md",
      source_path: "https://example.com/guide.md",
    });

    const rs = new ResourceStoreAdapter(transport);
    const result = await rs.importUrl("https://example.com/guide.md");

    const [label, path, opts] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(label).toBe("ResourceStore.importUrl");
    expect(path).toBe("/api/v1/resources");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body);
    expect(body.path).toBe("https://example.com/guide.md");
    expect(body.to).toBeUndefined();
    expect(body.reason).toBeUndefined();
    expect(body.wait).toBeUndefined();

    expect(result.status).toBe("success");
    expect(result.rootUri).toBe("viking://resources/guide.md");
  });

  it("includes targetUri when provided", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "success",
      root_uri: "viking://resources/custom.md",
      source_path: "https://example.com/doc.md",
    });

    const rs = new ResourceStoreAdapter(transport);
    await rs.importUrl("https://example.com/doc.md", { targetUri: "viking://resources/custom.md" });

    const [, , opts] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.to).toBe("viking://resources/custom.md");
  });

  it("includes reason when provided", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "success",
      root_uri: "",
      source_path: "",
    });

    const rs = new ResourceStoreAdapter(transport);
    await rs.importUrl("https://example.com/doc.md", { reason: "User guide" });

    const [, , opts] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.reason).toBe("User guide");
  });

  it("sets wait=true when wait option provided", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "success",
      root_uri: "",
      source_path: "",
    });

    const rs = new ResourceStoreAdapter(transport);
    await rs.importUrl("https://example.com/doc.md", { wait: true });

    const [, , opts] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.wait).toBe(true);
  });

  it("does not set wait when wait option is false", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "success",
      root_uri: "",
      source_path: "",
    });

    const rs = new ResourceStoreAdapter(transport);
    await rs.importUrl("https://example.com/doc.md", { wait: false });

    const [, , opts] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.wait).toBeUndefined();
  });

  it("omits all options when none provided", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "success",
      root_uri: "",
      source_path: "",
    });

    const rs = new ResourceStoreAdapter(transport);
    await rs.importUrl("https://example.com/doc.md", {});

    const [, , opts] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.to).toBeUndefined();
    expect(body.reason).toBeUndefined();
    expect(body.wait).toBeUndefined();
  });

  it("errors propagate from transport", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("OV unavailable"));

    const rs = new ResourceStoreAdapter(transport);
    await expect(rs.importUrl("https://example.com/doc.md")).rejects.toThrow("OV unavailable");
  });
});
