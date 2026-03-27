import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

export type ThumbnailPaths = {
  small: string;
  medium: string;
  large: string;
};

const THUMBNAIL_SIZES = {
  small: 150,
  medium: 300,
  large: 600,
} as const;

export async function generateThumbnails(
  filePath: string,
  mediaItemId: string,
  dataDir: string
): Promise<ThumbnailPaths | null> {
  const thumbnailDir = join(dataDir, "thumbnails");
  try {
    await mkdir(thumbnailDir, { recursive: true });
  } catch {
    console.error(`Failed to create thumbnails directory: ${thumbnailDir}`);
    return null;
  }

  const paths: ThumbnailPaths = {
    small: join(thumbnailDir, `${mediaItemId}_small.jpg`),
    medium: join(thumbnailDir, `${mediaItemId}_medium.jpg`),
    large: join(thumbnailDir, `${mediaItemId}_large.jpg`),
  };

  try {
    const img = sharp(filePath);
    await Promise.all([
      img
        .clone()
        .resize(THUMBNAIL_SIZES.small, THUMBNAIL_SIZES.small, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 80 })
        .toFile(paths.small),
      img
        .clone()
        .resize(THUMBNAIL_SIZES.medium, THUMBNAIL_SIZES.medium, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 80 })
        .toFile(paths.medium),
      img
        .clone()
        .resize(THUMBNAIL_SIZES.large, THUMBNAIL_SIZES.large, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 80 })
        .toFile(paths.large),
    ]);
    return paths;
  } catch (err) {
    console.error(`Thumbnail generation failed for ${filePath}: ${String(err)}`);
    return null;
  }
}
