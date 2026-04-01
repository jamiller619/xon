import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('music-metadata', () => ({
  parseFile: vi.fn(),
}));

import { MediaCategory } from '@xon/shared';
import { parseFile } from 'music-metadata';
import {
  type MusicTagsMetadata,
  extractMusicTags,
  isMusicCategory,
} from '../../media/musictags.js';

const mockParseFile = vi.mocked(parseFile);

type MockCommon = {
  title?: string;
  artist?: string;
  album?: string;
  year?: number;
  genre?: string[];
  track: { no: number | null; of: number | null };
  disk: { no: number | null; of: number | null };
  picture?: {
    format: string;
    data: Uint8Array;
    type?: string;
    description?: string;
  }[];
};

type MockFormat = {
  duration?: number;
  bitrate?: number;
  sampleRate?: number;
  numberOfChannels?: number;
  codec?: string;
};

function makeMeta(
  common: Partial<MockCommon> = {},
  format: MockFormat = {},
): { common: MockCommon; format: MockFormat } {
  return {
    common: {
      track: { no: null, of: null },
      disk: { no: null, of: null },
      ...common,
    },
    format,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('isMusicCategory', () => {
  it('returns true for music categories', () => {
    expect(isMusicCategory(MediaCategory.Music)).toBe(true);
    expect(isMusicCategory(MediaCategory.Audiobooks)).toBe(true);
  });

  it('returns false for non-music categories', () => {
    expect(isMusicCategory(MediaCategory.Movies)).toBe(false);
    expect(isMusicCategory(MediaCategory.AudioClips)).toBe(false);
    expect(isMusicCategory(MediaCategory.Podcasts)).toBe(false);
    expect(isMusicCategory(MediaCategory.Pictures)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isMusicCategory(null)).toBe(false);
  });
});

describe('extractMusicTags', () => {
  it('extracts full tag metadata from an MP3 file', async () => {
    mockParseFile.mockResolvedValue(
      makeMeta(
        {
          title: 'Bohemian Rhapsody',
          artist: 'Queen',
          album: 'A Night at the Opera',
          year: 1975,
          genre: ['Rock'],
          track: { no: 11, of: 12 },
          disk: { no: 1, of: 1 },
          picture: [
            { format: 'image/jpeg', data: new Uint8Array([0xff, 0xd8]) },
          ],
        },
        {
          duration: 354.32,
          bitrate: 320000,
          sampleRate: 44100,
          numberOfChannels: 2,
          codec: 'MPEG 1 Layer 3',
        },
      ) as never,
    );

    const result = await extractMusicTags('/music/bohemian.mp3');

    expect(result).toEqual<MusicTagsMetadata>({
      title: 'Bohemian Rhapsody',
      artist: 'Queen',
      album: 'A Night at the Opera',
      year: 1975,
      genre: 'Rock',
      trackNumber: 11,
      discNumber: 1,
      hasAlbumArt: true,
      duration: 354.32,
      bitrate: 320000,
      sampleRate: 44100,
      channels: 2,
      codec: 'MPEG 1 Layer 3',
    });
  });

  it('extracts FLAC file metadata with Vorbis comments', async () => {
    mockParseFile.mockResolvedValue(
      makeMeta(
        {
          title: 'Dreams',
          artist: 'Fleetwood Mac',
          album: 'Rumours',
          year: 1977,
          genre: ['Soft Rock'],
          track: { no: 2, of: 11 },
          disk: { no: null, of: null },
        },
        {
          duration: 257.1,
          bitrate: 900000,
          sampleRate: 44100,
          numberOfChannels: 2,
          codec: 'FLAC',
        },
      ) as never,
    );

    const result = await extractMusicTags('/music/dreams.flac');

    expect(result?.title).toBe('Dreams');
    expect(result?.artist).toBe('Fleetwood Mac');
    expect(result?.genre).toBe('Soft Rock');
    expect(result?.trackNumber).toBe(2);
    expect(result?.discNumber).toBeUndefined();
    expect(result?.codec).toBe('FLAC');
  });

  it('returns empty object for file with no tags', async () => {
    mockParseFile.mockResolvedValue(
      makeMeta(
        { track: { no: null, of: null }, disk: { no: null, of: null } },
        {},
      ) as never,
    );

    const result = await extractMusicTags('/music/untagged.mp3');

    expect(result).toEqual({});
  });

  it('takes first genre when multiple genres are present', async () => {
    mockParseFile.mockResolvedValue(
      makeMeta({ genre: ['Jazz', 'Blues', 'Soul'] }) as never,
    );

    const result = await extractMusicTags('/music/track.mp3');

    expect(result?.genre).toBe('Jazz');
  });

  it('sets hasAlbumArt true when picture array is non-empty', async () => {
    mockParseFile.mockResolvedValue(
      makeMeta({
        picture: [
          { format: 'image/png', data: new Uint8Array([0x89, 0x50]) },
          { format: 'image/jpeg', data: new Uint8Array([0xff, 0xd8]) },
        ],
      }) as never,
    );

    const result = await extractMusicTags('/music/track.ogg');

    expect(result?.hasAlbumArt).toBe(true);
  });

  it('does not set hasAlbumArt when picture array is empty', async () => {
    mockParseFile.mockResolvedValue(makeMeta({ picture: [] }) as never);

    const result = await extractMusicTags('/music/track.ogg');

    expect(result?.hasAlbumArt).toBeUndefined();
  });

  it('returns null when parseFile throws (file not found)', async () => {
    mockParseFile.mockRejectedValue(
      new Error('ENOENT: no such file or directory'),
    );

    const result = await extractMusicTags('/music/missing.mp3');

    expect(result).toBeNull();
  });

  it('returns null when parseFile throws for unsupported format', async () => {
    mockParseFile.mockRejectedValue(new Error('No valid ID3 frame found'));

    const result = await extractMusicTags('/music/corrupt.mp3');

    expect(result).toBeNull();
  });

  it('extracts M4A metadata with iTunes tags', async () => {
    mockParseFile.mockResolvedValue(
      makeMeta(
        {
          title: 'Come Together',
          artist: 'The Beatles',
          album: 'Abbey Road',
          year: 1969,
          genre: ['Rock'],
          track: { no: 1, of: 17 },
          disk: { no: 1, of: 1 },
        },
        {
          duration: 259.7,
          bitrate: 256000,
          sampleRate: 44100,
          numberOfChannels: 2,
          codec: 'AAC',
        },
      ) as never,
    );

    const result = await extractMusicTags('/music/abbey.m4a');

    expect(result?.title).toBe('Come Together');
    expect(result?.trackNumber).toBe(1);
    expect(result?.discNumber).toBe(1);
    expect(result?.duration).toBe(259.7);
    expect(result?.codec).toBe('AAC');
  });

  it('extracts OGG Vorbis metadata', async () => {
    mockParseFile.mockResolvedValue(
      makeMeta(
        {
          title: 'Vorbis Track',
          artist: 'Open Artist',
          track: { no: 3, of: null },
          disk: { no: null, of: null },
        },
        {
          duration: 180.0,
          sampleRate: 48000,
          numberOfChannels: 2,
          codec: 'Vorbis',
        },
      ) as never,
    );

    const result = await extractMusicTags('/music/track.ogg');

    expect(result?.title).toBe('Vorbis Track');
    expect(result?.trackNumber).toBe(3);
    expect(result?.sampleRate).toBe(48000);
    expect(result?.codec).toBe('Vorbis');
  });
});
