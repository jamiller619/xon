import { basename, dirname } from "node:path";
import { eq, inArray } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { groupMembers, groups, mediaItems } from "./schema.js";

export interface TvEpisodeInfo {
  seriesName: string | null;
  season: number;
  episode: number;
}

/**
 * Parses TV episode info from a filename.
 * Supports: SxxExx, sXXeXX, NxNN patterns.
 * Returns null if no episode pattern is found.
 */
export function parseTvEpisode(fileName: string): TvEpisodeInfo | null {
  // Standard SxxExx pattern (case-insensitive)
  const sxeMatch = fileName.match(/^(.*?)[.\s_-]*[Ss](\d+)[Ee](\d+)/);
  if (sxeMatch) {
    const rawName =
      sxeMatch[1]
        ?.trim()
        .replace(/[._-]+/g, " ")
        .trim() ?? "";
    return {
      seriesName: rawName.length > 0 ? rawName : null,
      season: Number.parseInt(sxeMatch[2] ?? "1", 10),
      episode: Number.parseInt(sxeMatch[3] ?? "1", 10),
    };
  }

  // NxNN pattern (e.g. 1x01)
  const nxMatch = fileName.match(/^(.*?)[.\s_-]*(\d+)x(\d{2,})/i);
  if (nxMatch) {
    const rawName =
      nxMatch[1]
        ?.trim()
        .replace(/[._-]+/g, " ")
        .trim() ?? "";
    return {
      seriesName: rawName.length > 0 ? rawName : null,
      season: Number.parseInt(nxMatch[2] ?? "1", 10),
      episode: Number.parseInt(nxMatch[3] ?? "1", 10),
    };
  }

  return null;
}

/**
 * Determines the series name for a TV episode given its file path and parsed info.
 * Priority:
 * 1. Series name from filename (if non-empty)
 * 2. Grandparent directory (if parent looks like "Season N" or "SXX")
 * 3. Parent directory
 */
export function resolveSeriesName(filePath: string, info: TvEpisodeInfo): string {
  if (info.seriesName) {
    return info.seriesName;
  }
  const parentDir = basename(dirname(filePath));
  const grandParentDir = basename(dirname(dirname(filePath)));

  // If parent looks like "Season 1", "Season01", "S01" etc., use grandparent
  if (/^(?:season|s)\s*\d+$/i.test(parentDir)) {
    return grandParentDir.length > 0 ? grandParentDir : parentDir;
  }
  return parentDir.length > 0 ? parentDir : "Unknown Series";
}

/**
 * Makes a deterministic group ID for a series or season group.
 * This allows idempotent upserts without extra unique indexes.
 */
function makeSeriesGroupId(libraryId: string, seriesTitle: string): string {
  return `grp:series:${libraryId}:${seriesTitle}`;
}

function makeSeasonGroupId(seriesGroupId: string, season: number): string {
  return `grp:season:${seriesGroupId}:${season}`;
}

/**
 * Auto-creates series and season groups for TV Show media items in a library,
 * then assigns each episode to its season group.
 * Idempotent: safe to call after every scan.
 */
export async function groupTvEpisodes(db: LibSQLDatabase, libraryId: string): Promise<void> {
  // Fetch all TV Show items for this library
  const tvItems = await db
    .select({
      id: mediaItems.id,
      filePath: mediaItems.filePath,
      fileName: mediaItems.fileName,
    })
    .from(mediaItems)
    .where(eq(mediaItems.libraryId, libraryId));

  // Filter to only TV episodes
  const episodes: Array<{
    id: string;
    filePath: string;
    fileName: string;
    info: TvEpisodeInfo;
    seriesName: string;
  }> = [];

  for (const item of tvItems) {
    const info = parseTvEpisode(item.fileName);
    if (info) {
      episodes.push({
        id: item.id,
        filePath: item.filePath,
        fileName: item.fileName,
        info,
        seriesName: resolveSeriesName(item.filePath, info),
      });
    }
  }

  if (episodes.length === 0) return;

  // Build the set of series and season groups we need
  const seriesGroupIds = new Set<string>();
  const seasonGroupMap = new Map<string, { id: string; seriesGroupId: string; season: number }>();

  for (const ep of episodes) {
    const seriesGroupId = makeSeriesGroupId(libraryId, ep.seriesName);
    seriesGroupIds.add(seriesGroupId);

    const seasonGroupId = makeSeasonGroupId(seriesGroupId, ep.info.season);
    if (!seasonGroupMap.has(seasonGroupId)) {
      seasonGroupMap.set(seasonGroupId, {
        id: seasonGroupId,
        seriesGroupId,
        season: ep.info.season,
      });
    }
  }

  // Fetch existing group IDs to avoid inserting duplicates
  const allGroupIds = [...seriesGroupIds, ...seasonGroupMap.keys()];
  const existingGroups = await db
    .select({ id: groups.id })
    .from(groups)
    .where(inArray(groups.id, allGroupIds));
  const existingGroupIdSet = new Set(existingGroups.map((g) => g.id));

  // Insert missing series groups
  const seriesInserts: Array<typeof groups.$inferInsert> = [];
  for (const seriesGroupId of seriesGroupIds) {
    if (!existingGroupIdSet.has(seriesGroupId)) {
      const seriesTitle = episodes.find(
        (e) => makeSeriesGroupId(libraryId, e.seriesName) === seriesGroupId
      )?.seriesName;
      if (seriesTitle) {
        seriesInserts.push({
          id: seriesGroupId,
          libraryId,
          type: "series",
          title: seriesTitle,
          parentGroupId: null,
          metadata: "{}",
        });
      }
    }
  }
  if (seriesInserts.length > 0) {
    await db.insert(groups).values(seriesInserts);
  }

  // Insert missing season groups
  const seasonInserts: Array<typeof groups.$inferInsert> = [];
  for (const [seasonGroupId, { seriesGroupId, season }] of seasonGroupMap) {
    if (!existingGroupIdSet.has(seasonGroupId)) {
      seasonInserts.push({
        id: seasonGroupId,
        libraryId,
        type: "season",
        title: `Season ${season}`,
        parentGroupId: seriesGroupId,
        metadata: "{}",
      });
    }
  }
  if (seasonInserts.length > 0) {
    await db.insert(groups).values(seasonInserts);
  }

  // Fetch existing group members to avoid duplicates
  const episodeIds = episodes.map((e) => e.id);
  const existingMembers = await db
    .select({ mediaItemId: groupMembers.mediaItemId })
    .from(groupMembers)
    .where(inArray(groupMembers.mediaItemId, episodeIds));
  const existingMemberSet = new Set(existingMembers.map((m) => m.mediaItemId));

  // Insert missing group members
  const memberInserts: Array<typeof groupMembers.$inferInsert> = [];
  for (const ep of episodes) {
    if (!existingMemberSet.has(ep.id)) {
      const seriesGroupId = makeSeriesGroupId(libraryId, ep.seriesName);
      const seasonGroupId = makeSeasonGroupId(seriesGroupId, ep.info.season);
      memberInserts.push({
        groupId: seasonGroupId,
        mediaItemId: ep.id,
        sortOrder: ep.info.episode,
      });
    }
  }
  if (memberInserts.length > 0) {
    await db.insert(groupMembers).values(memberInserts);
  }
}
