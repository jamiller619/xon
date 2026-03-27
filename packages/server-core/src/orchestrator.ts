import { and, eq, inArray } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { extractExiftoolMetadata, isImageCategory } from "./exiftool.js";
import { extractFfprobeMetadata, isAudioVideoCategory } from "./ffprobe.js";
import { extractMusicTags, isMusicCategory } from "./musictags.js";
import { scanDataSource } from "./scanner.js";
import { dataSources, libraries, mediaItems } from "./schema.js";

export type ScanProgress = {
  dataSourceId: string;
  totalFiles: number;
  processedFiles: number;
  currentFile: string | null;
};

export type ScanSummary = {
  libraryId: string;
  newItems: number;
  updatedItems: number;
  removedItems: number;
  totalDiscovered: number;
};

export async function scanLibrary(
  db: LibSQLDatabase,
  libraryId: string,
  onProgress?: (progress: ScanProgress) => void
): Promise<ScanSummary> {
  const libraryRows = await db.select().from(libraries).where(eq(libraries.id, libraryId));
  if (libraryRows.length === 0) {
    throw new Error(`Library not found: ${libraryId}`);
  }

  const sources = await db
    .select()
    .from(dataSources)
    .where(and(eq(dataSources.libraryId, libraryId), eq(dataSources.enabled, true)));

  let totalNew = 0;
  let totalUpdated = 0;
  let totalRemoved = 0;
  let totalDiscovered = 0;

  for (const source of sources) {
    const existing = await db
      .select({ filePath: mediaItems.filePath, fileSize: mediaItems.fileSize })
      .from(mediaItems)
      .where(eq(mediaItems.dataSourceId, source.id));

    const result = await scanDataSource(source, existing);
    totalDiscovered += result.discovered.length;

    const progress: ScanProgress = {
      dataSourceId: source.id,
      totalFiles: result.discovered.length,
      processedFiles: 0,
      currentFile: null,
    };

    const now = new Date();

    for (const entry of result.newFiles) {
      progress.currentFile = entry.filePath;
      onProgress?.(progress);

      let metadata = "{}";
      if (isMusicCategory(entry.mediaCategory)) {
        const musicMeta = await extractMusicTags(entry.filePath);
        if (musicMeta) {
          metadata = JSON.stringify(musicMeta);
        }
      } else if (isAudioVideoCategory(entry.mediaCategory)) {
        const ffMeta = await extractFfprobeMetadata(entry.filePath);
        if (ffMeta) {
          metadata = JSON.stringify(ffMeta);
        }
      } else if (isImageCategory(entry.mediaCategory)) {
        const exifMeta = await extractExiftoolMetadata(entry.filePath);
        if (exifMeta) {
          metadata = JSON.stringify(exifMeta);
        }
      }

      await db.insert(mediaItems).values({
        id: crypto.randomUUID(),
        libraryId,
        dataSourceId: source.id,
        filePath: entry.filePath,
        fileName: entry.fileName,
        fileSize: entry.fileSize,
        mimeType: entry.mimeType ?? null,
        mediaCategory: entry.mediaCategory,
        metadata,
        createdAt: now,
        updatedAt: now,
        scannedAt: now,
      });

      progress.processedFiles++;
      totalNew++;
    }

    for (const entry of result.changedFiles) {
      progress.currentFile = entry.filePath;
      onProgress?.(progress);

      const updateFields: Record<string, unknown> = {
        fileSize: entry.fileSize,
        mimeType: entry.mimeType ?? null,
        mediaCategory: entry.mediaCategory,
        updatedAt: now,
        scannedAt: now,
      };

      if (isMusicCategory(entry.mediaCategory)) {
        const musicMeta = await extractMusicTags(entry.filePath);
        if (musicMeta) {
          updateFields.metadata = JSON.stringify(musicMeta);
        }
      } else if (isAudioVideoCategory(entry.mediaCategory)) {
        const ffMeta = await extractFfprobeMetadata(entry.filePath);
        if (ffMeta) {
          updateFields.metadata = JSON.stringify(ffMeta);
        }
      } else if (isImageCategory(entry.mediaCategory)) {
        const exifMeta = await extractExiftoolMetadata(entry.filePath);
        if (exifMeta) {
          updateFields.metadata = JSON.stringify(exifMeta);
        }
      }

      await db
        .update(mediaItems)
        .set(updateFields)
        .where(
          and(eq(mediaItems.dataSourceId, source.id), eq(mediaItems.filePath, entry.filePath))
        );

      progress.processedFiles++;
      totalUpdated++;
    }

    if (result.removedFilePaths.length > 0) {
      await db
        .delete(mediaItems)
        .where(
          and(
            eq(mediaItems.dataSourceId, source.id),
            inArray(mediaItems.filePath, result.removedFilePaths)
          )
        );
      totalRemoved += result.removedFilePaths.length;
    }
  }

  return {
    libraryId,
    newItems: totalNew,
    updatedItems: totalUpdated,
    removedItems: totalRemoved,
    totalDiscovered,
  };
}
