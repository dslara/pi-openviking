import { describe, it, expect, vi } from "vitest";
import { GraphStoreAdapter } from "./graph-store";
import { Uri } from "../../domain/common/uri";
import type { Transport } from "./transport";

function mockTransport(): Transport {
  return {
    request: vi.fn(),
  } as unknown as Transport;
}

describe("GraphStoreAdapter.link", () => {
  const source = new Uri("viking://doc/1");
  const target = new Uri("viking://doc/2");

  it("calls POST /api/v1/relations/link with from_uri, to_uris", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const gs = new GraphStoreAdapter(transport);
    await gs.link(source, target);

    const [label, path, opts] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(label).toBe("GraphStore.link");
    expect(path).toBe("/api/v1/relations/link");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body);
    expect(body.from_uri).toBe("viking://doc/1");
    expect(body.to_uris).toEqual(["viking://doc/2"]);
  });

  it("accepts multiple targets as array", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const gs = new GraphStoreAdapter(transport);
    await gs.link(source, [new Uri("viking://t1"), new Uri("viking://t2")]);

    const [, , opts] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.to_uris).toEqual(["viking://t1", "viking://t2"]);
  });

  it("includes reason when provided", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const gs = new GraphStoreAdapter(transport);
    await gs.link(source, target, "references");

    const [, , opts] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.reason).toBe("references");
  });

  it("omits reason when not provided", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const gs = new GraphStoreAdapter(transport);
    await gs.link(source, target);

    const [, , opts] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.reason).toBeUndefined();
  });

  it("returns LinkResult with source and targets", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const gs = new GraphStoreAdapter(transport);
    const result = await gs.link(source, target, "rel");
    expect(result.source).toEqual(source);
    expect(result.targets).toHaveLength(1);
    expect(result.targets[0]).toEqual(target);
    expect(result.reason).toBe("rel");
  });
});

describe("GraphStoreAdapter.unlink", () => {
  const source = new Uri("viking://a");
  const target = new Uri("viking://b");

  it("calls DELETE /api/v1/relations/link with from_uri and to_uri", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const gs = new GraphStoreAdapter(transport);
    await gs.unlink(source, target);

    const [label, path, opts] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(label).toBe("GraphStore.unlink");
    expect(path).toBe("/api/v1/relations/link");
    expect(opts.method).toBe("DELETE");
    const body = JSON.parse(opts.body);
    expect(body.from_uri).toBe("viking://a");
    expect(body.to_uri).toBe("viking://b");
  });
});

describe("GraphStoreAdapter.graph", () => {
  it("calls GET /api/v1/relations?uri= with encoded URI", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      relations: [
        { uri: "viking://related/1", reason: "contains" },
      ],
    });

    const gs = new GraphStoreAdapter(transport);
    const result = await gs.graph(new Uri("viking://doc/1"));

    const [label, path] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(label).toBe("GraphStore.graph");
    expect(path).toContain("/api/v1/relations");
    expect(path).toContain("uri=");
    expect(path).toContain(encodeURIComponent("viking://doc/1"));
    expect(result).toHaveLength(1);
    expect(result[0].uri).toBe("viking://related/1");
  });

  it("maps response via toRelations", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      relations: [
        { uri: "viking://r1", reason: "a" },
        { uri: "viking://r2" },
      ],
    });

    const gs = new GraphStoreAdapter(transport);
    const result = await gs.graph(new Uri("viking://doc/1"));
    expect(result).toHaveLength(2);
    expect(result[1].reason).toBeUndefined();
  });
});
