import { describe, expect, it } from 'vitest';
import {
  detectBookSeries,
  detectMultiDiscAlbums,
  detectSupplementaryMaterials,
} from '../../media/smartGrouping.js';

// Minimal mediaItem shape for testing
type MinItem = {
  id: string;
  fileName: string;
  filePath: string;
  mediaCategory: string | null;
  title: string | null;
  metadata: string;
};

function makeItem(overrides: Partial<MinItem> & { id: string }): MinItem {
  return {
    fileName: 'file.mp3',
    filePath: '/music/file.mp3',
    mediaCategory: 'Music',
    title: null,
    metadata: '{}',
    ...overrides,
  };
}

// Cast helper — our functions accept LibSQLDatabase $inferSelect which includes
// more fields; for unit tests we pass the minimal subset.
// biome-ignore lint/suspicious/noExplicitAny: test helper
type AnyItem = any;

describe('detectMultiDiscAlbums', () => {
  it('returns empty when all tracks are in the same directory', () => {
    const items: AnyItem[] = [
      makeItem({
        id: '1',
        filePath: '/music/Album/01.mp3',
        metadata: '{"album":"Album"}',
      }),
      makeItem({
        id: '2',
        filePath: '/music/Album/02.mp3',
        metadata: '{"album":"Album"}',
      }),
    ];
    expect(detectMultiDiscAlbums(items)).toHaveLength(0);
  });

  it('detects multi-disc album when tracks are in disc subdirectories', () => {
    const items: AnyItem[] = [
      makeItem({
        id: '1',
        filePath: '/music/Album/Disc 1/01.mp3',
        metadata: '{"album":"Album"}',
      }),
      makeItem({
        id: '2',
        filePath: '/music/Album/Disc 1/02.mp3',
        metadata: '{"album":"Album"}',
      }),
      makeItem({
        id: '3',
        filePath: '/music/Album/Disc 2/01.mp3',
        metadata: '{"album":"Album"}',
      }),
    ];
    const result = detectMultiDiscAlbums(items);
    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe('Album');
    expect(result[0]?.type).toBe('album');
    expect(result[0]?.itemIds).toHaveLength(3);
    expect(result[0]?.confidence).toBeGreaterThan(0);
  });

  it('detects multi-disc album with CD pattern', () => {
    const items: AnyItem[] = [
      makeItem({
        id: '1',
        filePath: '/music/Artist/Album/CD1/track.mp3',
        metadata: '{"album":"Album"}',
      }),
      makeItem({
        id: '2',
        filePath: '/music/Artist/Album/CD2/track.mp3',
        metadata: '{"album":"Album"}',
      }),
    ];
    const result = detectMultiDiscAlbums(items);
    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe('Album');
  });

  it('ignores non-music categories', () => {
    const items: AnyItem[] = [
      makeItem({
        id: '1',
        filePath: '/docs/Report/Vol 1/doc.pdf',
        mediaCategory: 'Documents',
        metadata: '{"album":"Report"}',
      }),
      makeItem({
        id: '2',
        filePath: '/docs/Report/Vol 2/doc.pdf',
        mediaCategory: 'Documents',
        metadata: '{"album":"Report"}',
      }),
    ];
    expect(detectMultiDiscAlbums(items)).toHaveLength(0);
  });

  it('uses parent directory name when album metadata is absent', () => {
    const items: AnyItem[] = [
      makeItem({
        id: '1',
        filePath: '/music/MyAlbum/Disc 1/01.mp3',
        metadata: '{}',
      }),
      makeItem({
        id: '2',
        filePath: '/music/MyAlbum/Disc 2/01.mp3',
        metadata: '{}',
      }),
    ];
    const result = detectMultiDiscAlbums(items);
    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBeTruthy();
  });
});

describe('detectBookSeries', () => {
  it('returns empty when there is only one book', () => {
    const items: AnyItem[] = [
      makeItem({
        id: '1',
        fileName: 'MyBook Vol 1.epub',
        filePath: '/books/MyBook Vol 1.epub',
        mediaCategory: 'Documents',
        title: 'MyBook Vol 1',
      }),
    ];
    expect(detectBookSeries(items)).toHaveLength(0);
  });

  it('detects a series from Volume indicators', () => {
    const items: AnyItem[] = [
      makeItem({
        id: '1',
        fileName: 'Dune Vol 1.epub',
        filePath: '/books/Dune Vol 1.epub',
        mediaCategory: 'Documents',
        title: 'Dune Vol 1',
      }),
      makeItem({
        id: '2',
        fileName: 'Dune Vol 2.epub',
        filePath: '/books/Dune Vol 2.epub',
        mediaCategory: 'Documents',
        title: 'Dune Vol 2',
      }),
      makeItem({
        id: '3',
        fileName: 'Dune Vol 3.epub',
        filePath: '/books/Dune Vol 3.epub',
        mediaCategory: 'Documents',
        title: 'Dune Vol 3',
      }),
    ];
    const result = detectBookSeries(items);
    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe('book-series');
    expect(result[0]?.itemIds).toHaveLength(3);
  });

  it('detects audiobook series with Part indicator', () => {
    const items: AnyItem[] = [
      makeItem({
        id: '1',
        fileName: 'Foundation Part 1.m4b',
        filePath: '/audio/Foundation Part 1.m4b',
        mediaCategory: 'Audiobooks',
        title: 'Foundation Part 1',
      }),
      makeItem({
        id: '2',
        fileName: 'Foundation Part 2.m4b',
        filePath: '/audio/Foundation Part 2.m4b',
        mediaCategory: 'Audiobooks',
        title: 'Foundation Part 2',
      }),
    ];
    const result = detectBookSeries(items);
    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe('book-series');
    expect(result[0]?.itemIds).toHaveLength(2);
  });

  it('ignores non-book categories', () => {
    const items: AnyItem[] = [
      makeItem({
        id: '1',
        fileName: 'Track Vol 1.mp3',
        filePath: '/music/Track Vol 1.mp3',
        mediaCategory: 'Music',
        title: 'Track Vol 1',
      }),
      makeItem({
        id: '2',
        fileName: 'Track Vol 2.mp3',
        filePath: '/music/Track Vol 2.mp3',
        mediaCategory: 'Music',
        title: 'Track Vol 2',
      }),
    ];
    expect(detectBookSeries(items)).toHaveLength(0);
  });
});

describe('detectSupplementaryMaterials', () => {
  it('returns empty for single items', () => {
    const items: AnyItem[] = [
      makeItem({
        id: '1',
        fileName: 'lecture.mp4',
        filePath: '/course/lecture.mp4',
        mediaCategory: 'Movies',
      }),
    ];
    expect(detectSupplementaryMaterials(items)).toHaveLength(0);
  });

  it('detects supplementary materials from different categories with shared base name', () => {
    const items: AnyItem[] = [
      makeItem({
        id: '1',
        fileName: 'React Course Guide.pdf',
        filePath: '/course/React Course Guide.pdf',
        mediaCategory: 'Documents',
      }),
      makeItem({
        id: '2',
        fileName: 'React Course.mp4',
        filePath: '/videos/React Course.mp4',
        mediaCategory: 'Movies',
      }),
    ];
    const result = detectSupplementaryMaterials(items);
    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe('collection');
    expect(result[0]?.itemIds).toHaveLength(2);
  });

  it('detects files in different directories with same base name', () => {
    const items: AnyItem[] = [
      makeItem({
        id: '1',
        fileName: 'intro.mp4',
        filePath: '/course/week1/intro.mp4',
        mediaCategory: 'Movies',
      }),
      makeItem({
        id: '2',
        fileName: 'intro.mp4',
        filePath: '/course/week2/intro.mp4',
        mediaCategory: 'Movies',
      }),
    ];
    const result = detectSupplementaryMaterials(items);
    expect(result).toHaveLength(1);
    expect(result[0]?.itemIds).toHaveLength(2);
  });

  it('ignores items from the same directory with same category', () => {
    const items: AnyItem[] = [
      makeItem({
        id: '1',
        fileName: 'episode.mp4',
        filePath: '/show/episode.mp4',
        mediaCategory: 'Movies',
      }),
      makeItem({
        id: '2',
        fileName: 'episode guide.mp4',
        filePath: '/show/episode guide.mp4',
        mediaCategory: 'Movies',
      }),
    ];
    // Same category, same dir — should not be flagged
    expect(detectSupplementaryMaterials(items)).toHaveLength(0);
  });
});
