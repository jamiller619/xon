import type { Client } from "@libsql/client";
import { MediaCategory } from "@xon/shared";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "./db.js";
import {
  groupMusicTracks,
  groupTvEpisodes,
  parseTvEpisode,
  resolveSeriesName,
} from "./grouping.js";
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

describe("groupMusicTracks", () => {
  let client: Client;
  let db: LibSQLDatabase;

  beforeEach(async () => {
    ({ client, db } = await openDatabase(":memory:"));
    await migrateDatabase(db);

    await db.insert(libraries).values({ id: "lib-1", name: "Music", allowedMediaTypes: "[]" });
    await db.insert(dataSources).values({
      id: "ds-1",
      libraryId: "lib-1",
      type: "local",
      path: "/music",
    });
  });

  afterEach(() => {
    client.close();
  });

  it("creates artist and album groups for music tracks", async () => {
    await db.insert(mediaItems).values([
      {
        id: "track-1",
        libraryId: "lib-1",
        dataSourceId: "ds-1",
        filePath: "/music/01 - Song One.mp3",
        fileName: "01 - Song One.mp3",
        fileSize: 3000,
        mediaCategory: MediaCategory.Music,
        metadata: JSON.stringify({
          artist: "Artist A",
          album: "Album X",
          trackNumber: 1,
          discNumber: 1,
        }),
      },
      {
        id: "track-2",
        libraryId: "lib-1",
        dataSourceId: "ds-1",
        filePath: "/music/02 - Song Two.mp3",
        fileName: "02 - Song Two.mp3",
        fileSize: 3000,
        mediaCategory: MediaCategory.Music,
        metadata: JSON.stringify({
          artist: "Artist A",
          album: "Album X",
          trackNumber: 2,
          discNumber: 1,
        }),
      },
    ]);

    await groupMusicTracks(db, "lib-1");

    const allGroups = await db.select().from(groups);
    const artistGroups = allGroups.filter((g) => g.type === "artist");
    const albumGroups = allGroups.filter((g) => g.type === "album");

    expect(artistGroups).toHaveLength(1);
    expect(artistGroups[0]?.title).toBe("Artist A");

    expect(albumGroups).toHaveLength(1);
    expect(albumGroups[0]?.title).toBe("Album X");
    expect(albumGroups[0]?.parentGroupId).toBe(artistGroups[0]?.id);
  });

  it("assigns tracks to album groups with disc*1000+track sort order", async () => {
    await db.insert(mediaItems).values([
      {
        id: "track-1",
        libraryId: "lib-1",
        dataSourceId: "ds-1",
        filePath: "/music/d1t1.mp3",
        fileName: "d1t1.mp3",
        fileSize: 3000,
        mediaCategory: MediaCategory.Music,
        metadata: JSON.stringify({
          artist: "Artist A",
          album: "Double Album",
          trackNumber: 1,
          discNumber: 1,
        }),
      },
      {
        id: "track-2",
        libraryId: "lib-1",
        dataSourceId: "ds-1",
        filePath: "/music/d2t1.mp3",
        fileName: "d2t1.mp3",
        fileSize: 3000,
        mediaCategory: MediaCategory.Music,
        metadata: JSON.stringify({
          artist: "Artist A",
          album: "Double Album",
          trackNumber: 1,
          discNumber: 2,
        }),
      },
    ]);

    await groupMusicTracks(db, "lib-1");

    const members = await db.select().from(groupMembers);
    expect(members).toHaveLength(2);

    const m1 = members.find((m) => m.mediaItemId === "track-1");
    const m2 = members.find((m) => m.mediaItemId === "track-2");
    expect(m1?.sortOrder).toBe(1 * 1000 + 1); // disc 1 track 1 = 1001
    expect(m2?.sortOrder).toBe(2 * 1000 + 1); // disc 2 track 1 = 2001
  });

  it("groups compilation albums under Various Artists", async () => {
    await db.insert(mediaItems).values([
      {
        id: "track-1",
        libraryId: "lib-1",
        dataSourceId: "ds-1",
        filePath: "/music/comp1.mp3",
        fileName: "comp1.mp3",
        fileSize: 3000,
        mediaCategory: MediaCategory.Music,
        metadata: JSON.stringify({
          artist: "Artist A",
          album: "Best Of 2024",
          trackNumber: 1,
          discNumber: 1,
        }),
      },
      {
        id: "track-2",
        libraryId: "lib-1",
        dataSourceId: "ds-1",
        filePath: "/music/comp2.mp3",
        fileName: "comp2.mp3",
        fileSize: 3000,
        mediaCategory: MediaCategory.Music,
        metadata: JSON.stringify({
          artist: "Artist B",
          album: "Best Of 2024",
          trackNumber: 2,
          discNumber: 1,
        }),
      },
    ]);

    await groupMusicTracks(db, "lib-1");

    const allGroups = await db.select().from(groups);
    const artistGroups = allGroups.filter((g) => g.type === "artist");
    const albumGroups = allGroups.filter((g) => g.type === "album");

    expect(artistGroups).toHaveLength(1);
    expect(artistGroups[0]?.title).toBe("Various Artists");
    expect(albumGroups).toHaveLength(1);
    expect(albumGroups[0]?.title).toBe("Best Of 2024");
  });

  it("does not duplicate groups or members on repeated calls", async () => {
    await db.insert(mediaItems).values({
      id: "track-1",
      libraryId: "lib-1",
      dataSourceId: "ds-1",
      filePath: "/music/song.mp3",
      fileName: "song.mp3",
      fileSize: 3000,
      mediaCategory: MediaCategory.Music,
      metadata: JSON.stringify({
        artist: "Artist A",
        album: "Album X",
        trackNumber: 1,
        discNumber: 1,
      }),
    });

    await groupMusicTracks(db, "lib-1");
    await groupMusicTracks(db, "lib-1");

    const allGroups = await db.select().from(groups);
    const members = await db.select().from(groupMembers);

    // 1 artist group + 1 album group = 2 total
    expect(allGroups).toHaveLength(2);
    expect(members).toHaveLength(1);
  });

  it("ignores tracks without album metadata", async () => {
    await db.insert(mediaItems).values({
      id: "track-1",
      libraryId: "lib-1",
      dataSourceId: "ds-1",
      filePath: "/music/unknown.mp3",
      fileName: "unknown.mp3",
      fileSize: 3000,
      mediaCategory: MediaCategory.Music,
      metadata: JSON.stringify({ artist: "Artist A", trackNumber: 1 }),
    });

    await groupMusicTracks(db, "lib-1");

    const allGroups = await db.select().from(groups);
    expect(allGroups).toHaveLength(0);
  });

  it("creates separate album groups for different artists with the same album name", async () => {
    await db.insert(mediaItems).values([
      {
        id: "track-1",
        libraryId: "lib-1",
        dataSourceId: "ds-1",
        filePath: "/music/a/greatest.mp3",
        fileName: "greatest.mp3",
        fileSize: 3000,
        mediaCategory: MediaCategory.Music,
        metadata: JSON.stringify({
          artist: "Artist A",
          album: "Greatest Hits",
          trackNumber: 1,
          discNumber: 1,
        }),
      },
      {
        id: "track-2",
        libraryId: "lib-1",
        dataSourceId: "ds-1",
        filePath: "/music/b/greatest.mp3",
        fileName: "greatest.mp3",
        fileSize: 3000,
        mediaCategory: MediaCategory.Music,
        metadata: JSON.stringify({
          artist: "Artist B",
          album: "Greatest Hits",
          trackNumber: 1,
          discNumber: 1,
        }),
      },
    ]);

    await groupMusicTracks(db, "lib-1");

    const allGroups = await db.select().from(groups);
    const artistGroups = allGroups.filter((g) => g.type === "artist");
    const albumGroups = allGroups.filter((g) => g.type === "album");

    // "Greatest Hits" by two different artists = compilation → 1 "Various Artists" + 1 album
    expect(artistGroups).toHaveLength(1);
    expect(artistGroups[0]?.title).toBe("Various Artists");
    expect(albumGroups).toHaveLength(1);
  });

  it("only processes Music category items, not other categories", async () => {
    await db.insert(mediaItems).values([
      {
        id: "track-1",
        libraryId: "lib-1",
        dataSourceId: "ds-1",
        filePath: "/music/song.mp3",
        fileName: "song.mp3",
        fileSize: 3000,
        mediaCategory: MediaCategory.Music,
        metadata: JSON.stringify({
          artist: "Artist A",
          album: "Album X",
          trackNumber: 1,
          discNumber: 1,
        }),
      },
      {
        id: "audiobook-1",
        libraryId: "lib-1",
        dataSourceId: "ds-1",
        filePath: "/music/chapter1.m4b",
        fileName: "chapter1.m4b",
        fileSize: 10000,
        mediaCategory: MediaCategory.Audiobooks,
        metadata: JSON.stringify({
          artist: "Author",
          album: "Big Book",
          trackNumber: 1,
          discNumber: 1,
        }),
      },
    ]);

    await groupMusicTracks(db, "lib-1");

    const allGroups = await db.select().from(groups);
    const members = await db.select().from(groupMembers);

    // Only the Music track should be grouped
    expect(allGroups).toHaveLength(2); // 1 artist + 1 album
    expect(members).toHaveLength(1);
    expect(members[0]?.mediaItemId).toBe("track-1");
  });
});
