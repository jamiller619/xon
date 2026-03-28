import type { Client } from "@libsql/client";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "./db.js";
import { groupTvEpisodes, parseTvEpisode, resolveSeriesName } from "./grouping.js";
import { migrateDatabase } from "./migrate.js";
import { dataSources, groupMembers, groups, libraries, mediaItems } from "./schema.js";

describe("parseTvEpisode", () => {
  it("parses standard SxxExx with series name", () => {
    const result = parseTvEpisode("Breaking Bad S01E03 - ...and the Bag's in the River.mkv");
    expect(result).not.toBeNull();
    expect(result?.season).toBe(1);
    expect(result?.episode).toBe(3);
    expect(result?.seriesName).toBe("Breaking Bad");
  });

  it("parses SxxExx with dots as separators", () => {
    const result = parseTvEpisode("The.Wire.S03E12.mkv");
    expect(result).not.toBeNull();
    expect(result?.season).toBe(3);
    expect(result?.episode).toBe(12);
    expect(result?.seriesName).toBe("The Wire");
  });

  it("parses lowercase sXXeXX", () => {
    const result = parseTvEpisode("lost.s02e23.mkv");
    expect(result).not.toBeNull();
    expect(result?.season).toBe(2);
    expect(result?.episode).toBe(23);
  });

  it("parses NxNN format", () => {
    const result = parseTvEpisode("Firefly 1x11.mkv");
    expect(result).not.toBeNull();
    expect(result?.season).toBe(1);
    expect(result?.episode).toBe(11);
    expect(result?.seriesName).toBe("Firefly");
  });

  it("parses two-digit season and episode", () => {
    const result = parseTvEpisode("S10E05.mkv");
    expect(result).not.toBeNull();
    expect(result?.season).toBe(10);
    expect(result?.episode).toBe(5);
    expect(result?.seriesName).toBeNull();
  });

  it("returns null for non-TV filename", () => {
    expect(parseTvEpisode("Inception.2010.mkv")).toBeNull();
    expect(parseTvEpisode("song.mp3")).toBeNull();
    expect(parseTvEpisode("document.pdf")).toBeNull();
  });
});

describe("resolveSeriesName", () => {
  it("uses series name from episode info when available", () => {
    const info = { seriesName: "Breaking Bad", season: 1, episode: 3 };
    expect(resolveSeriesName("/media/Breaking Bad/S01E03.mkv", info)).toBe("Breaking Bad");
  });

  it("uses grandparent dir when parent looks like Season folder", () => {
    const info = { seriesName: null, season: 1, episode: 3 };
    expect(resolveSeriesName("/media/The Wire/Season 1/ep.mkv", info)).toBe("The Wire");
    expect(resolveSeriesName("/media/Sopranos/season01/ep.mkv", info)).toBe("Sopranos");
    expect(resolveSeriesName("/media/Lost/S02/ep.mkv", info)).toBe("Lost");
  });

  it("uses parent dir when it does not look like Season folder", () => {
    const info = { seriesName: null, season: 1, episode: 3 };
    expect(resolveSeriesName("/media/Breaking Bad/S01E03.mkv", info)).toBe("Breaking Bad");
  });
});

describe("groupTvEpisodes", () => {
  let client: Client;
  let db: LibSQLDatabase;

  beforeEach(async () => {
    ({ client, db } = await openDatabase(":memory:"));
    await migrateDatabase(db);

    await db.insert(libraries).values({ id: "lib-1", name: "TV Shows", allowedMediaTypes: "[]" });
    await db.insert(dataSources).values({
      id: "ds-1",
      libraryId: "lib-1",
      type: "local",
      path: "/tv",
    });
  });

  afterEach(() => {
    client.close();
  });

  it("creates series and season groups for TV episodes", async () => {
    await db.insert(mediaItems).values([
      {
        id: "ep-1",
        libraryId: "lib-1",
        dataSourceId: "ds-1",
        filePath: "/tv/Breaking Bad S01E01.mkv",
        fileName: "Breaking Bad S01E01.mkv",
        fileSize: 5000,
        metadata: "{}",
      },
      {
        id: "ep-2",
        libraryId: "lib-1",
        dataSourceId: "ds-1",
        filePath: "/tv/Breaking Bad S01E02.mkv",
        fileName: "Breaking Bad S01E02.mkv",
        fileSize: 5000,
        metadata: "{}",
      },
      {
        id: "ep-3",
        libraryId: "lib-1",
        dataSourceId: "ds-1",
        filePath: "/tv/Breaking Bad S02E01.mkv",
        fileName: "Breaking Bad S02E01.mkv",
        fileSize: 5000,
        metadata: "{}",
      },
    ]);

    await groupTvEpisodes(db, "lib-1");

    const allGroups = await db.select().from(groups).where();
    const seriesGroups = allGroups.filter((g) => g.type === "series");
    const seasonGroups = allGroups.filter((g) => g.type === "season");

    expect(seriesGroups).toHaveLength(1);
    expect(seriesGroups[0]?.title).toBe("Breaking Bad");

    expect(seasonGroups).toHaveLength(2);
    const seasonTitles = seasonGroups.map((g) => g.title).sort();
    expect(seasonTitles).toEqual(["Season 1", "Season 2"]);
  });

  it("assigns episodes to season groups with correct sort order", async () => {
    await db.insert(mediaItems).values([
      {
        id: "ep-1",
        libraryId: "lib-1",
        dataSourceId: "ds-1",
        filePath: "/tv/Lost S01E01.mkv",
        fileName: "Lost S01E01.mkv",
        fileSize: 5000,
        metadata: "{}",
      },
      {
        id: "ep-5",
        libraryId: "lib-1",
        dataSourceId: "ds-1",
        filePath: "/tv/Lost S01E05.mkv",
        fileName: "Lost S01E05.mkv",
        fileSize: 5000,
        metadata: "{}",
      },
    ]);

    await groupTvEpisodes(db, "lib-1");

    const members = await db.select().from(groupMembers);
    expect(members).toHaveLength(2);

    const ep1 = members.find((m) => m.mediaItemId === "ep-1");
    const ep5 = members.find((m) => m.mediaItemId === "ep-5");
    expect(ep1?.sortOrder).toBe(1);
    expect(ep5?.sortOrder).toBe(5);
  });

  it("does not duplicate groups or members on repeated calls", async () => {
    await db.insert(mediaItems).values({
      id: "ep-1",
      libraryId: "lib-1",
      dataSourceId: "ds-1",
      filePath: "/tv/The Wire S01E01.mkv",
      fileName: "The Wire S01E01.mkv",
      fileSize: 5000,
      metadata: "{}",
    });

    await groupTvEpisodes(db, "lib-1");
    await groupTvEpisodes(db, "lib-1");

    const allGroups = await db.select().from(groups);
    const members = await db.select().from(groupMembers);

    // Should still have exactly 1 series + 1 season = 2 groups
    expect(allGroups).toHaveLength(2);
    expect(members).toHaveLength(1);
  });

  it("ignores files without TV episode patterns", async () => {
    await db.insert(mediaItems).values({
      id: "movie-1",
      libraryId: "lib-1",
      dataSourceId: "ds-1",
      filePath: "/tv/Inception.2010.mkv",
      fileName: "Inception.2010.mkv",
      fileSize: 8000,
      metadata: "{}",
    });

    await groupTvEpisodes(db, "lib-1");

    const allGroups = await db.select().from(groups);
    expect(allGroups).toHaveLength(0);
  });

  it("creates separate series for different shows", async () => {
    await db.insert(mediaItems).values([
      {
        id: "ep-1",
        libraryId: "lib-1",
        dataSourceId: "ds-1",
        filePath: "/tv/Breaking Bad S01E01.mkv",
        fileName: "Breaking Bad S01E01.mkv",
        fileSize: 5000,
        metadata: "{}",
      },
      {
        id: "ep-2",
        libraryId: "lib-1",
        dataSourceId: "ds-1",
        filePath: "/tv/Lost S01E01.mkv",
        fileName: "Lost S01E01.mkv",
        fileSize: 5000,
        metadata: "{}",
      },
    ]);

    await groupTvEpisodes(db, "lib-1");

    const seriesGroups = await db.select().from(groups);
    const series = seriesGroups.filter((g) => g.type === "series");
    expect(series).toHaveLength(2);
    const titles = series.map((g) => g.title).sort();
    expect(titles).toEqual(["Breaking Bad", "Lost"]);
  });

  it("uses folder hierarchy when episode has no inline series name", async () => {
    await db.insert(mediaItems).values({
      id: "ep-1",
      libraryId: "lib-1",
      dataSourceId: "ds-1",
      filePath: "/tv/Sopranos/Season 1/S01E01.mkv",
      fileName: "S01E01.mkv",
      fileSize: 5000,
      metadata: "{}",
    });

    await groupTvEpisodes(db, "lib-1");

    const seriesGroups = await db.select().from(groups);
    const series = seriesGroups.filter((g) => g.type === "series");
    expect(series).toHaveLength(1);
    expect(series[0]?.title).toBe("Sopranos");
  });
});
