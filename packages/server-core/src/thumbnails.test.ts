import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(),
}));

vi.mock("sharp", () => {
  const mockToFile = vi.fn().mockResolvedValue(undefined);
  const mockJpeg = vi.fn().mockReturnThis();
  const mockResize = vi.fn().mockReturnThis();
  const mockClone = vi.fn().mockReturnValue({
    resize: mockResize,
    jpeg: mockJpeg,
    toFile: mockToFile,
  });
  const mockSharp = vi.fn().mockReturnValue({
    clone: mockClone,
  });
  return { default: mockSharp };
});

const { mkdir } = await import("node:fs/promises");
const sharp = (await import("sharp")).default;
const { generateThumbnails } = await import("./thumbnails.js");

describe("generateThumbnails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mkdir).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("creates thumbnails directory and returns paths", async () => {
    const result = await generateThumbnails("/images/photo.jpg", "item-123", "/data");

    expect(mkdir).toHaveBeenCalledWith(join("/data", "thumbnails"), { recursive: true });
    expect(result).toEqual({
      small: join("/data", "thumbnails", "item-123_small.jpg"),
      medium: join("/data", "thumbnails", "item-123_medium.jpg"),
      large: join("/data", "thumbnails", "item-123_large.jpg"),
    });
  });

  it("calls sharp with correct resize options for all three sizes", async () => {
    const sharpInstance = {
      clone: vi.fn().mockReturnValue({
        resize: vi.fn().mockReturnThis(),
        jpeg: vi.fn().mockReturnThis(),
        toFile: vi.fn().mockResolvedValue(undefined),
      }),
    };
    vi.mocked(sharp).mockReturnValueOnce(sharpInstance as never);

    await generateThumbnails("/images/photo.jpg", "item-abc", "/data");

    expect(sharp).toHaveBeenCalledWith("/images/photo.jpg");
    expect(sharpInstance.clone).toHaveBeenCalledTimes(3);
  });

  it("returns null when mkdir fails", async () => {
    vi.mocked(mkdir).mockRejectedValueOnce(new Error("Permission denied"));

    const result = await generateThumbnails("/images/photo.jpg", "item-123", "/data");

    expect(result).toBeNull();
  });

  it("returns null when sharp processing fails", async () => {
    const failingClone = {
      resize: vi.fn().mockReturnThis(),
      jpeg: vi.fn().mockReturnThis(),
      toFile: vi.fn().mockRejectedValue(new Error("Unsupported format")),
    };
    vi.mocked(sharp).mockReturnValueOnce({ clone: vi.fn().mockReturnValue(failingClone) } as never);

    const result = await generateThumbnails("/images/broken.bmp", "item-456", "/data");

    expect(result).toBeNull();
  });

  it("uses mediaItemId in thumbnail filenames", async () => {
    const result = await generateThumbnails("/images/test.png", "unique-id-789", "/mydata");

    expect(result?.small).toContain("unique-id-789_small.jpg");
    expect(result?.medium).toContain("unique-id-789_medium.jpg");
    expect(result?.large).toContain("unique-id-789_large.jpg");
  });

  it("places thumbnails under dataDir/thumbnails/", async () => {
    const result = await generateThumbnails("/images/test.png", "item-001", "/custom/data");

    expect(result?.small).toMatch(/^\/custom\/data\/thumbnails\//);
    expect(result?.medium).toMatch(/^\/custom\/data\/thumbnails\//);
    expect(result?.large).toMatch(/^\/custom\/data\/thumbnails\//);
  });
});
