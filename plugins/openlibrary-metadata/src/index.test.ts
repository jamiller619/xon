import type { PluginContext } from "@xon/plugin-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OpenLibraryMetadataPlugin } from "./index.js";
import { parseBookPath } from "./bookParser.js";
import { OpenLibraryClient } from "./openLibraryClient.js";

// ─── bookParser tests ──────────────────────────────────────────────────────────

describe("parseBookPath", () => {
  it("extracts ISBN-13 from filename", () => {
    const result = parseBookPath("/books/9780061120084 Brave New World.epub");
    expect(result.isbn).toBe("9780061120084");
    expect(result.title).toBeTruthy();
  });

  it("extracts ISBN-13 with hyphens", () => {
    const result = parseBookPath("/books/978-0-06-112008-4.epub");
    expect(result.isbn).toBe("9780061120084");
  });

  it("parses Author - Title pattern", () => {
    const result = parseBookPath("/books/Aldous Huxley - Brave New World.epub");
    expect(result.author).toBe("Aldous Huxley");
    expect(result.title).toBe("Brave New World");
  });

  it("strips year annotation from title", () => {
    const result = parseBookPath("/books/Aldous Huxley - Brave New World (1932).epub");
    expect(result.title).toBe("Brave New World");
    expect(result.author).toBe("Aldous Huxley");
  });

  it("uses parent directory as author when no dash separator", () => {
    const result = parseBookPath("/books/Aldous Huxley/Brave New World.epub");
    expect(result.author).toBe("Aldous Huxley");
    expect(result.title).toBe("Brave New World");
  });

  it("returns just title when no author can be inferred", () => {
    const result = parseBookPath("/BraveNewWorld.epub");
    expect(result.title).toBe("BraveNewWorld");
    expect(result.author).toBeUndefined();
  });

  it("strips year in parens at end of bare title", () => {
    const result = parseBookPath("/books/Brave New World (1932).epub");
    expect(result.title).toBe("Brave New World");
  });
});

// ─── OpenLibraryClient tests ──────────────────────────────────────────────────

function makeFetch(responses: Array<{ ok: boolean; json: unknown }>) {
  let i = 0;
  return vi.fn(async (_url: string) => {
    const resp = responses[i++] ?? { ok: false, json: {} };
    return {
      ok: resp.ok,
      json: async () => resp.json,
    } as unknown as Response;
  });
}

describe("OpenLibraryClient", () => {
  describe("searchByIsbn", () => {
    it("returns null when ISBN endpoint returns 404", async () => {
      const fetch = makeFetch([{ ok: false, json: {} }]);
      const client = new OpenLibraryClient(fetch);
      expect(await client.searchByIsbn("9780061120084")).toBeNull();
    });

    it("maps ISBN book response to BookMetadata", async () => {
      const bookResp = {
        title: "Brave New World",
        authors: [{ key: "/authors/OL123A" }],
        number_of_pages: 311,
        publish_date: "1932",
        subjects: ["Dystopia", "Science Fiction"],
        covers: [12345],
      };
      const authorResp = {
        name: "Aldous Huxley",
        bio: "British author born in 1894.",
      };
      const fetch = makeFetch([
        { ok: true, json: bookResp },
        { ok: true, json: authorResp },
      ]);
      const client = new OpenLibraryClient(fetch);
      const result = await client.searchByIsbn("9780061120084");

      expect(result).not.toBeNull();
      expect(result?.title).toBe("Brave New World");
      expect(result?.authors).toEqual(["Aldous Huxley"]);
      expect(result?.authorBio).toBe("British author born in 1894.");
      expect(result?.pageCount).toBe(311);
      expect(result?.publishYear).toBe(1932);
      expect(result?.subjects).toEqual(["Dystopia", "Science Fiction"]);
      expect(result?.coverUrl).toContain("12345");
      expect(result?.isbn).toBe("9780061120084");
    });

    it("uses cover URL by ISBN when no cover ID available", async () => {
      const bookResp = {
        title: "Some Book",
        number_of_pages: 200,
        publish_date: "2000",
        subjects: [],
      };
      const fetch = makeFetch([{ ok: true, json: bookResp }]);
      const client = new OpenLibraryClient(fetch);
      const result = await client.searchByIsbn("9780061120084");
      expect(result?.coverUrl).toContain("9780061120084");
    });

    it("handles bio as object with value field", async () => {
      const bookResp = {
        title: "A Book",
        authors: [{ key: "/authors/OL999A" }],
        subjects: [],
      };
      const authorResp = {
        name: "Some Author",
        bio: { value: "Author bio text." },
      };
      const fetch = makeFetch([
        { ok: true, json: bookResp },
        { ok: true, json: authorResp },
      ]);
      const client = new OpenLibraryClient(fetch);
      const result = await client.searchByIsbn("1234567890");
      expect(result?.authorBio).toBe("Author bio text.");
    });

    it("handles missing publish_date gracefully", async () => {
      const bookResp = {
        title: "Mystery Book",
        subjects: [],
      };
      const fetch = makeFetch([{ ok: true, json: bookResp }]);
      const client = new OpenLibraryClient(fetch);
      const result = await client.searchByIsbn("9780000000000");
      expect(result?.publishYear).toBeUndefined();
    });
  });

  describe("searchByTitleAuthor", () => {
    it("returns null when search has no results", async () => {
      const fetch = makeFetch([{ ok: true, json: { docs: [] } }]);
      const client = new OpenLibraryClient(fetch);
      expect(await client.searchByTitleAuthor("Unknown Title XYZ")).toBeNull();
    });

    it("maps search result to BookMetadata", async () => {
      const searchResp = {
        docs: [
          {
            key: "/works/OL45804W",
            title: "Brave New World",
            author_name: ["Aldous Huxley"],
            author_key: ["/authors/OL123A"],
            first_publish_year: 1932,
            number_of_pages_median: 311,
            isbn: ["9780061120084"],
            subject: ["Dystopian fiction", "Satire"],
            cover_i: 98765,
          },
        ],
      };
      const authorResp = {
        name: "Aldous Huxley",
        bio: "British author.",
      };
      const fetch = makeFetch([
        { ok: true, json: searchResp },
        { ok: true, json: authorResp },
      ]);
      const client = new OpenLibraryClient(fetch);
      const result = await client.searchByTitleAuthor("Brave New World", "Aldous Huxley");

      expect(result).not.toBeNull();
      expect(result?.title).toBe("Brave New World");
      expect(result?.authors).toEqual(["Aldous Huxley"]);
      expect(result?.publishYear).toBe(1932);
      expect(result?.pageCount).toBe(311);
      expect(result?.isbn).toBe("9780061120084");
      expect(result?.coverUrl).toContain("98765");
    });

    it("includes author param in search URL", async () => {
      const fetch = makeFetch([{ ok: true, json: { docs: [] } }]);
      const client = new OpenLibraryClient(fetch);
      await client.searchByTitleAuthor("Dune", "Frank Herbert");
      const url = (fetch.mock.calls[0] as [string])[0];
      expect(url).toContain("author=Frank+Herbert");
    });

    it("works when no author_key present (skips bio fetch)", async () => {
      const searchResp = {
        docs: [
          {
            key: "/works/OL1W",
            title: "Some Book",
            author_name: ["Anonymous"],
            first_publish_year: 2000,
            subject: [],
          },
        ],
      };
      const fetch = makeFetch([{ ok: true, json: searchResp }]);
      const client = new OpenLibraryClient(fetch);
      const result = await client.searchByTitleAuthor("Some Book");
      expect(result?.authors).toEqual(["Anonymous"]);
      expect(result?.authorBio).toBeUndefined();
      expect(fetch).toHaveBeenCalledOnce(); // no second call for author bio
    });

    it("truncates subjects to 20 entries", async () => {
      const subjects = Array.from({ length: 30 }, (_, i) => `Subject ${i}`);
      const searchResp = {
        docs: [
          {
            key: "/works/OL2W",
            title: "Rich Subject Book",
            author_name: ["Writer"],
            subject: subjects,
          },
        ],
      };
      const fetch = makeFetch([{ ok: true, json: searchResp }]);
      const client = new OpenLibraryClient(fetch);
      const result = await client.searchByTitleAuthor("Rich Subject Book");
      expect(result?.subjects.length).toBe(20);
    });
  });
});

// ─── OpenLibraryMetadataPlugin tests ──────────────────────────────────────────

function makeContext(overrides: Partial<PluginContext> = {}): PluginContext {
  return {
    manifest: {
      id: "openlibrary-metadata",
      name: "OpenLibrary Metadata",
      version: "1.0.0",
      description: "test",
      author: "test",
      category: "MetadataSource",
    },
    db: {
      query: vi.fn().mockResolvedValue([]),
    },
    on: vi.fn(),
    registerRoute: vi.fn(),
    registerUI: vi.fn(),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    fs: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      readdir: vi.fn(),
      stat: vi.fn(),
      mkdir: vi.fn(),
      unlink: vi.fn(),
    },
    fetch: vi.fn(),
    ...overrides,
  } as unknown as PluginContext;
}

describe("OpenLibraryMetadataPlugin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates table on init", async () => {
    const plugin = new OpenLibraryMetadataPlugin();
    const ctx = makeContext();
    await plugin.init(ctx);
    const queryCalls = (ctx.db.query as ReturnType<typeof vi.fn>).mock.calls as [string][];
    const sqls = queryCalls.map((c) => c[0]);
    expect(sqls.some((s) => s.includes("plugin_openlibrary_metadata_books"))).toBe(true);
  });

  it("registers media:created and media:updated hooks", async () => {
    const plugin = new OpenLibraryMetadataPlugin();
    const ctx = makeContext();
    await plugin.init(ctx);
    const onCalls = (ctx.on as ReturnType<typeof vi.fn>).mock.calls as [string][];
    const events = onCalls.map((c) => c[0]);
    expect(events).toContain("media:created");
    expect(events).toContain("media:updated");
  });

  it("registers a GET /metadata/:mediaId route", async () => {
    const plugin = new OpenLibraryMetadataPlugin();
    const ctx = makeContext();
    await plugin.init(ctx);
    const calls = (ctx.registerRoute as ReturnType<typeof vi.fn>).mock.calls as [
      { method: string; path: string },
    ][];
    const route = calls.find((c) => c[0].method === "GET" && c[0].path === "/metadata/:mediaId");
    expect(route).toBeDefined();
  });

  it("enriches a book on media:created event via ISBN", async () => {
    const bookResp = {
      title: "Brave New World",
      authors: [{ key: "/authors/OL123A" }],
      number_of_pages: 311,
      publish_date: "1932",
      subjects: ["Dystopia"],
      covers: [12345],
    };
    const authorResp = { name: "Aldous Huxley", bio: "British author." };

    const fetchMock = makeFetch([
      { ok: true, json: bookResp },
      { ok: true, json: authorResp },
    ]);

    const plugin = new OpenLibraryMetadataPlugin();
    const ctx = makeContext({ fetch: fetchMock });
    await plugin.init(ctx);

    const onCalls = (ctx.on as ReturnType<typeof vi.fn>).mock.calls as [
      string,
      (payload: { mediaId: string; filePath: string }) => Promise<void>,
    ][];
    const handler = onCalls.find((c) => c[0] === "media:created")?.[1];
    await handler?.({
      mediaId: "doc1",
      filePath: "/books/9780061120084 Brave New World.epub",
    });

    const queryCalls = (ctx.db.query as ReturnType<typeof vi.fn>).mock.calls as [string][];
    const insertCall = queryCalls.find((c) => c[0].includes("INSERT OR REPLACE"));
    expect(insertCall).toBeDefined();
    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining("Brave New World"));
  });

  it("falls back to title/author search when no ISBN in path", async () => {
    const searchResp = {
      docs: [
        {
          key: "/works/OL45804W",
          title: "Brave New World",
          author_name: ["Aldous Huxley"],
          subject: ["Dystopia"],
          first_publish_year: 1932,
        },
      ],
    };
    const fetchMock = makeFetch([{ ok: true, json: searchResp }]);

    const plugin = new OpenLibraryMetadataPlugin();
    const ctx = makeContext({ fetch: fetchMock });
    await plugin.init(ctx);

    const onCalls = (ctx.on as ReturnType<typeof vi.fn>).mock.calls as [
      string,
      (payload: { mediaId: string; filePath: string }) => Promise<void>,
    ][];
    const handler = onCalls.find((c) => c[0] === "media:created")?.[1];
    await handler?.({
      mediaId: "doc2",
      filePath: "/books/Aldous Huxley/Brave New World.epub",
    });

    const queryCalls = (ctx.db.query as ReturnType<typeof vi.fn>).mock.calls as [string][];
    const insertCall = queryCalls.find((c) => c[0].includes("INSERT OR REPLACE"));
    expect(insertCall).toBeDefined();
  });

  it("logs warning when no match found", async () => {
    const fetchMock = makeFetch([
      { ok: true, json: { docs: [] } }, // search by title/author returns nothing
    ]);
    const plugin = new OpenLibraryMetadataPlugin();
    const ctx = makeContext({ fetch: fetchMock });
    await plugin.init(ctx);

    const onCalls = (ctx.on as ReturnType<typeof vi.fn>).mock.calls as [
      string,
      (payload: { mediaId: string; filePath: string }) => Promise<void>,
    ][];
    const handler = onCalls.find((c) => c[0] === "media:created")?.[1];
    await handler?.({ mediaId: "doc3", filePath: "/books/Unknown Book XYZ.epub" });

    expect(ctx.logger.warn).toHaveBeenCalledWith(expect.stringContaining("no match"));
  });

  it("returns stored metadata from route handler", async () => {
    const storedRow = {
      media_id: "doc1",
      title: "Brave New World",
      authors: '["Aldous Huxley"]',
      subjects: '["Dystopia"]',
    };
    let callCount = 0;
    const dbQuery = vi.fn().mockImplementation(async (sql: string) => {
      callCount++;
      if (callCount > 1 && sql.includes("plugin_openlibrary_metadata_books")) {
        return [storedRow];
      }
      return [];
    });

    const plugin = new OpenLibraryMetadataPlugin();
    const ctx = makeContext({ db: { query: dbQuery } });
    await plugin.init(ctx);

    const routeCalls = (ctx.registerRoute as ReturnType<typeof vi.fn>).mock.calls as [
      { method: string; path: string; handler: (c: unknown) => Promise<unknown> },
    ][];
    const routeEntry = routeCalls.find((c) => c[0].path === "/metadata/:mediaId");
    const handler = routeEntry?.[0]?.handler;
    expect(handler).toBeDefined();

    const mockC = {
      req: { param: vi.fn().mockReturnValue("doc1") },
      json: vi.fn().mockReturnValue({ status: 200, headers: {} }),
    };
    await handler?.(mockC);
    expect(mockC.json).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Brave New World" })
    );
  });

  it("returns 404 when no metadata stored for mediaId", async () => {
    const plugin = new OpenLibraryMetadataPlugin();
    const ctx = makeContext();
    await plugin.init(ctx);

    const routeCalls = (ctx.registerRoute as ReturnType<typeof vi.fn>).mock.calls as [
      { method: string; path: string; handler: (c: unknown) => Promise<unknown> },
    ][];
    const routeEntry = routeCalls.find((c) => c[0].path === "/metadata/:mediaId");
    const handler = routeEntry?.[0]?.handler;

    const mockC = {
      req: { param: vi.fn().mockReturnValue("nonexistent") },
      json: vi.fn().mockReturnValue({ status: 404, headers: {} }),
    };
    await handler?.(mockC);
    expect(mockC.json).toHaveBeenCalledWith({ error: "No metadata found" }, 404);
  });

  it("deactivate clears internal state", async () => {
    const plugin = new OpenLibraryMetadataPlugin();
    const ctx = makeContext();
    await plugin.init(ctx);
    await plugin.deactivate();
    const callsBefore = (ctx.db.query as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(callsBefore).toBeGreaterThan(0); // table was created
  });
});
