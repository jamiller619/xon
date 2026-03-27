import { and, eq, inArray } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { extractExiftoolMetadata, isImageCategory } from "./exiftool.js";
import { extractFfprobeMetadata, isAudioVideoCategory } from "./ffprobe.js";
import {
  extract3DModelMetadata,
  extractArchiveMetadata,
  extractDocumentMetadata,
  extractFontMetadata,
  is3DModelCategory,
  isArchiveCategory,
  isDocumentCategory,
  isFontCategory,
} from "./miscmeta.js";
import { extractMusicTags, isMusicCategory } from "./musictags.js";
import { scanDataSource } from "./scanner.js";
import { dataSources, libraries, mediaItems } from "./schema.js";
import { generateThumbnails } from "./thumbnails.js";

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
  onProgress?: (progress: ScanProgress) => void,
  dataDir?: string
): Promise<ScanSummary> {
  const resolvedDataDir = dataDir ?? process.env.DATA_DIR ?? "./data";
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
      } else if (isDocumentCategory(entry.mediaCategory)) {
        const docMeta = await extractDocumentMetadata(entry.filePath);
        if (docMeta) {
          metadata = JSON.stringify(docMeta);
        }
      } else if (isFontCategory(entry.mediaCategory)) {
        const fontMeta = await extractFontMetadata(entry.filePath);
        if (fontMeta) {
          metadata = JSON.stringify(fontMeta);
        }
      } else if (is3DModelCategory(entry.mediaCategory)) {
        const modelMeta = await extract3DModelMetadata(entry.filePath);
        if (modelMeta) {
          metadata = JSON.stringify(modelMeta);
        }
      } else if (isArchiveCategory(entry.mediaCategory)) {
        const archiveMeta = await extractArchiveMetadata(entry.filePath);
        if (archiveMeta) {
          metadata = JSON.stringify(archiveMeta);
        }
      }

      const id = crypto.randomUUID();

      let thumbnailPaths: string | null = null;
      if (isImageCategory(entry.mediaCategory)) {
        const thumbs = await generateThumbnails(entry.filePath, id, resolvedDataDir);
        if (thumbs) {
          thumbnailPaths = JSON.stringify(thumbs);
        }
      }

      await db.insert(mediaItems).values({
        id,
        libraryId,
        dataSourceId: source.id,
        filePath: entry.filePath,
        fileName: entry.fileName,
        fileSize: entry.fileSize,
        mimeType: entry.mimeType ?? null,
        mediaCategory: entry.mediaCategory,
        metadata,
        thumbnailPaths,
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
        const existingRows = await db
          .select({ id: mediaItems.id })
          .from(mediaItems)
          .where(
            and(eq(mediaItems.dataSourceId, source.id), eq(mediaItems.filePath, entry.filePath))
          );
        const existingId = existingRows[0]?.id ?? crypto.randomUUID();
        const thumbs = await generateThumbnails(entry.filePath, existingId, resolvedDataDir);
        if (thumbs) {
          updateFields.thumbnailPaths = JSON.stringify(thumbs);
        }
      } else if (isDocumentCategory(entry.mediaCategory)) {
        const docMeta = await extractDocumentMetadata(entry.filePath);
        if (docMeta) {
          updateFields.metadata = JSON.stringify(docMeta);
        }
      } else if (isFontCategory(entry.mediaCategory)) {
        const fontMeta = await extractFontMetadata(entry.filePath);
        if (fontMeta) {
          updateFields.metadata = JSON.stringify(fontMeta);
        }
      } else if (is3DModelCategory(entry.mediaCategory)) {
        const modelMeta = await extract3DModelMetadata(entry.filePath);
        if (modelMeta) {
          updateFields.metadata = JSON.stringify(modelMeta);
        }
      } else if (isArchiveCategory(entry.mediaCategory)) {
        const archiveMeta = await extractArchiveMetadata(entry.filePath);
        if (archiveMeta) {
          updateFields.metadata = JSON.stringify(archiveMeta);
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
