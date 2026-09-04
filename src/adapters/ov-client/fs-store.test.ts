import { describe, it, expect, vi } from "vitest";
import { FsStoreAdapter } from "./fs-store";
import { Uri } from "../../domain/common/uri";
import { ValidationError } from "../../domain/errors/domain-error";
import type { Transport } from "./transport";

function mockTransport(): Transport {
  return {
    request: vi.fn(),
  } as unknown as Transport;
}

describe("FsStoreAdapter.read", () => {
  const uri = new Uri("viking://docs/architecture.md");
  const dirUri = new Uri("viking://docs/");

  it("calls /api/v1/content/read for level=read", async () => {
    const transport = mockTransport();
    // OV transport returns result as direct string (envelope unwrapped)
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(
      "# Architecture\n\ncontent",
    );

    const fs = new FsStoreAdapter(transport);
    const result = await fs.read(uri, "read");

    expect(transport.request).toHaveBeenCalledTimes(1);
    const [label, path] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(label).toBe("FsStore.read");
    expect(path).toContain("/api/v1/content/read");
    expect(path).toContain("uri=");
    expect(result.body).toBe("# Architecture\n\ncontent");
    expect(result.uri).toEqual(uri);
    expect(result.level).toBe("read");
  });

  it("calls /api/v1/content/abstract for level=abstract", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(
      "Hexagonal architecture overview",
    );

    const fs = new FsStoreAdapter(transport);
    const result = await fs.read(dirUri, "abstract");

    const [, path] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(path).toContain("/api/v1/content/abstract");
    expect(path).toContain("uri=");
    expect(path).not.toContain("offset=");
    expect(path).not.toContain("limit=");
    expect(result.body).toBe("Hexagonal architecture overview");
    expect(result.level).toBe("abstract");
  });

  it("calls /api/v1/content/overview for level=overview", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(
      "File: architecture.md",
    );

    const fs = new FsStoreAdapter(transport);
    const result = await fs.read(dirUri, "overview");

    const [, path] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(path).toContain("/api/v1/content/overview");
    expect(path).toContain("uri=");
    expect(path).not.toContain("offset=");
    expect(path).not.toContain("limit=");
    expect(result.body).toBe("File: architecture.md");
    expect(result.level).toBe("overview");
  });

  it("defaults to read level when level is undefined", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue(
      "full content",
    );

    const fs = new FsStoreAdapter(transport);
    const result = await fs.read(uri);

    const [, path] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(path).toContain("/api/v1/content/read");
    expect(path).toContain("uri=");
    expect(path).not.toContain(".abstract");
    expect(path).not.toContain(".overview");
    expect(result.body).toBe("full content");
    expect(result.level).toBeUndefined();
  });

  it("propagates 412/ValidationError for abstract/overview on files", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ValidationError(
        "[FsStore.read] Request failed (412) — is not a directory",
      ),
    );

    const fs = new FsStoreAdapter(transport);
    await expect(fs.read(uri, "abstract")).rejects.toThrow(ValidationError);
  });

  it("appends uri query param with encoded value for read level", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue("content");

    const fs = new FsStoreAdapter(transport);
    await fs.read(uri, "read");

    const [, path] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(path).toContain("uri=");
    expect(path).toContain(encodeURIComponent("viking://docs/architecture.md"));
  });

  it("appends offset query param only for read level", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue("content");

    const fs = new FsStoreAdapter(transport);
    await fs.read(uri, "read", 100);

    const [, path] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(path).toContain("offset=100");
  });

  it("appends limit query param only for read level", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue("content");

    const fs = new FsStoreAdapter(transport);
    await fs.read(uri, "read", undefined, 50);

    const [, path] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(path).toContain("limit=50");
  });

  it("does not append offset/limit for abstract level", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue("abstract");

    const fs = new FsStoreAdapter(transport);
    await fs.read(dirUri, "abstract", 10, 20);

    const [, path] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(path).toContain("/api/v1/content/abstract");
    expect(path).not.toContain("offset=");
    expect(path).not.toContain("limit=");
  });

  it("propagates non-404 errors for abstract/overview", async () => {
    const transport = mockTransport();
    const { ConnectionError } = await import("../../domain/errors/domain-error");
    (transport.request as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ConnectionError("OV unreachable"),
    );

    const fs = new FsStoreAdapter(transport);
    await expect(fs.read(uri, "abstract")).rejects.toThrow(ConnectionError);
  });
});

describe("FsStoreAdapter.write", () => {
  const uri = new Uri("viking://docs/new.md");

  it("calls POST /api/v1/content/write with correct body", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      uri: "viking://docs/new.md",
      success: true,
    });

    const fs = new FsStoreAdapter(transport);
    const result = await fs.write(uri, "# New content", "replace");

    expect(transport.request).toHaveBeenCalledTimes(1);
    const [label, path, opts] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(label).toBe("FsStore.write");
    expect(path).toBe("/api/v1/content/write");
    expect(opts.method).toBe("POST");

    const body = JSON.parse(opts.body);
    expect(body.uri).toBe("viking://docs/new.md");
    expect(body.content).toBe("# New content");
    expect(body.mode).toBe("replace");
    expect(body.wait).toBe(false);

    expect(result.uri).toEqual(uri);
    expect(result.success).toBe(true);
  });

  it("defaults mode to undefined when not provided", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      uri: "viking://docs/new.md",
      success: true,
    });

    const fs = new FsStoreAdapter(transport);
    await fs.write(uri, "content");

    const [, , opts] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.mode).toBeUndefined();
  });

  it("defaults method to POST", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      uri: "viking://docs/new.md",
      success: true,
    });

    const fs = new FsStoreAdapter(transport);
    await fs.write(uri, "content");

    const [, , opts] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(opts.method).toBe("POST");
  });
});

describe("FsStoreAdapter.list", () => {
  const uri = new Uri("viking://docs/");

  it("calls GET /api/v1/fs/ls with uri param", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue([
      { uri: "viking://docs/a.md", type: "file", size: 100 },
    ]);

    const fs = new FsStoreAdapter(transport);
    const result = await fs.list(uri);

    const [label, path] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(label).toBe("FsStore.list");
    expect(path).toContain("/api/v1/fs/ls");
    expect(path).toContain(encodeURIComponent("viking://docs/"));
    expect(result).toHaveLength(1);
    expect(result[0].uri.value).toBe("viking://docs/a.md");
  });

  it("appends recursive=true when recursive flag is set", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const fs = new FsStoreAdapter(transport);
    await fs.list(uri, true);

    const [, path] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(path).toContain("recursive=true");
  });

  it("omits recursive param when not set", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const fs = new FsStoreAdapter(transport);
    await fs.list(uri);

    const [, path] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(path).not.toContain("recursive");
  });
});

describe("FsStoreAdapter.tree", () => {
  const uri = new Uri("viking://docs/");

  it("calls GET /api/v1/fs/tree with uri param", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue([
      { uri: "viking://docs/a.md", name: "a.md", isDir: false, size: 100, mode: 33188, modTime: "" },
      { uri: "viking://docs/sub/", name: "sub", isDir: true, size: 4096, mode: 16877, modTime: "" },
    ]);

    const fs = new FsStoreAdapter(transport);
    const result = await fs.tree(uri);

    const [label, path] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(label).toBe("FsStore.tree");
    expect(path).toContain("/api/v1/fs/tree");
    expect(result).toHaveLength(2);
    expect(result[1].type).toBe("directory");
  });
});

describe("FsStoreAdapter.stat", () => {
  const uri = new Uri("viking://docs/architecture.md");

  it("calls GET /api/v1/fs/stat with uri param", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      uri: "viking://docs/architecture.md",
      type: "file",
      size: 4096,
      modTime: "2026-01-01T00:00:00Z",
    });

    const fs = new FsStoreAdapter(transport);
    const result = await fs.stat(uri);

    const [label, path] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(label).toBe("FsStore.stat");
    expect(path).toContain("/api/v1/fs/stat");
    expect(path).toContain(encodeURIComponent("viking://docs/architecture.md"));
    expect(result.uri).toEqual(uri);
    expect(result.type).toBe("file");
    expect(result.size).toBe(4096);
  });
});

describe("FsStoreAdapter.mkdir", () => {
  const uri = new Uri("viking://docs/new-folder/");

  it("calls POST /api/v1/fs/mkdir with uri body", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const fs = new FsStoreAdapter(transport);
    await fs.mkdir(uri);

    const [label, path, opts] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(label).toBe("FsStore.mkdir");
    expect(path).toBe("/api/v1/fs/mkdir");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body);
    expect(body.uri).toBe("viking://docs/new-folder/");
  });
});

describe("FsStoreAdapter.mv", () => {
  const from = new Uri("viking://docs/old.md");
  const to = new Uri("viking://docs/new.md");

  it("calls POST /api/v1/fs/mv with from_uri and to_uri", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const fs = new FsStoreAdapter(transport);
    await fs.mv(from, to);

    const [label, path, opts] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(label).toBe("FsStore.mv");
    expect(path).toBe("/api/v1/fs/mv");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body);
    expect(body.from_uri).toBe("viking://docs/old.md");
    expect(body.to_uri).toBe("viking://docs/new.md");
  });
});

describe("FsStoreAdapter.delete", () => {
  const uri = new Uri("viking://docs/old.md");

  it("calls DELETE /api/v1/fs with uri param", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const fs = new FsStoreAdapter(transport);
    await fs.delete(uri);

    const [label, path] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(label).toBe("FsStore.delete");
    expect(path).toContain("/api/v1/fs");
    expect(path).toContain(encodeURIComponent("viking://docs/old.md"));
  });

  it("appends recursive=true when recursive flag is set", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const fs = new FsStoreAdapter(transport);
    await fs.delete(uri, true);

    const [, path] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(path).toContain("recursive=true");
  });

  it("retries with recursive=true on recursive-required error", async () => {
    const transport = mockTransport();
    const mock = transport.request as ReturnType<typeof vi.fn>;
    // First call fails, second succeeds
    mock.mockRejectedValueOnce(new ValidationError("recursive required"));
    mock.mockResolvedValueOnce({});

    const fs = new FsStoreAdapter(transport);
    await fs.delete(uri);

    expect(mock).toHaveBeenCalledTimes(2);
    const [, path1] = mock.mock.calls[0];
    const [, path2] = mock.mock.calls[1];
    // First call: no recursive
    expect(path1).not.toContain("recursive");
    // Second call: with recursive=true
    expect(path2).toContain("recursive=true");
  });

  it("does not retry on non-recursive errors", async () => {
    const transport = mockTransport();
    const mock = transport.request as ReturnType<typeof vi.fn>;
    mock.mockRejectedValue(new Error("unauthorized"));

    const fs = new FsStoreAdapter(transport);
    await expect(fs.delete(uri)).rejects.toThrow();
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("does not retry twice when recursive already set", async () => {
    const transport = mockTransport();
    const mock = transport.request as ReturnType<typeof vi.fn>;
    mock.mockRejectedValue(new Error("some error"));

    const fs = new FsStoreAdapter(transport);
    await expect(fs.delete(uri, true)).rejects.toThrow();
    expect(mock).toHaveBeenCalledTimes(1);
  });

  // P12: Conflict retry
  it("retries on 409 Conflict with up to 3 attempts", async () => {
    const transport = mockTransport();
    const mock = transport.request as ReturnType<typeof vi.fn>;
    const conflictErr = new ValidationError("Conflict — Resource is being processed");
    // First call = original, next 2 = retries → 3 total
    mock.mockRejectedValueOnce(conflictErr);   // original → retry 1
    mock.mockRejectedValueOnce(conflictErr);   // retry 1  → retry 2
    mock.mockResolvedValueOnce({});            // retry 2 → success

    const fs = new FsStoreAdapter(transport);
    await fs.delete(uri);

    expect(mock).toHaveBeenCalledTimes(3);
  });

  it("throws after exhausting all conflict retries", async () => {
    const transport = mockTransport();
    const mock = transport.request as ReturnType<typeof vi.fn>;
    const conflictErr = new ValidationError("Conflict — Resource is being processed");
    mock.mockRejectedValue(conflictErr);

    const fs = new FsStoreAdapter(transport);
    await expect(fs.delete(uri)).rejects.toThrow(ValidationError);
    // Original + 2 retries = 3 calls
    expect(mock).toHaveBeenCalledTimes(3);
  });

  // P11: Raw error does not trigger retry — logged and thrown
  it("logs unexpected errors without retry", async () => {
    const transport = mockTransport();
    const mock = transport.request as ReturnType<typeof vi.fn>;
    const serverErr = new Error("Not a directory (os error 20)");
    mock.mockRejectedValue(serverErr);

    const fs = new FsStoreAdapter(transport);
    await expect(fs.delete(uri)).rejects.toThrow();
    expect(mock).toHaveBeenCalledTimes(1);
  });
});

describe("FsStoreAdapter.reindex", () => {
  const uri = new Uri("viking://resources/test.md");

  it("calls POST /api/v1/content/reindex with vectors_only by default", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const fs = new FsStoreAdapter(transport);
    await fs.reindex(uri);

    expect(transport.request).toHaveBeenCalledTimes(1);
    const [label, path, opts] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(label).toBe("FsStore.reindex");
    expect(path).toBe("/api/v1/content/reindex");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body as string);
    expect(body.uri).toBe("viking://resources/test.md");
    expect(body.mode).toBe("vectors_only");
  });

  it("passes mode=full when specified", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const fs = new FsStoreAdapter(transport);
    await fs.reindex(uri, "full");

    const [, , opts] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(opts.body as string);
    expect(body.mode).toBe("full");
  });

  it("passes AbortSignal", async () => {
    const transport = mockTransport();
    (transport.request as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const ac = new AbortController();

    const fs = new FsStoreAdapter(transport);
    await fs.reindex(uri, "vectors_only", ac.signal);

    const [, , opts, signal] = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(signal).toBe(ac.signal);
  });
});
