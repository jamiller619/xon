import { MediaCategory } from '@xon/shared';
import { parseFile } from 'music-metadata';

const MUSIC_CATEGORIES = new Set<string>([
  MediaCategory.Music,
  MediaCategory.Audiobooks,
]);

export type MusicTagsMetadata = {
  title?: string;
  artist?: string;
  album?: string;
  trackNumber?: number;
  discNumber?: number;
  year?: number;
  genre?: string;
  hasAlbumArt?: boolean;
  duration?: number;
  bitrate?: number;
  sampleRate?: number;
  channels?: number;
  codec?: string;
};

export function isMusicCategory(category: string | null): boolean {
  if (!category) return false;
  return MUSIC_CATEGORIES.has(category);
}

export async function extractMusicTags(
  filePath: string,
): Promise<MusicTagsMetadata | null> {
  try {
    const { common, format } = await parseFile(filePath);
    const result: MusicTagsMetadata = {};

    if (typeof common.title === 'string') result.title = common.title;
    if (typeof common.artist === 'string') result.artist = common.artist;
    if (typeof common.album === 'string') result.album = common.album;
    if (typeof common.year === 'number') result.year = common.year;
    if (Array.isArray(common.genre) && common.genre.length > 0) {
      const g = common.genre[0];
      if (typeof g === 'string') result.genre = g;
    }
    if (common.track.no != null) result.trackNumber = common.track.no;
    if (common.disk.no != null) result.discNumber = common.disk.no;
    if (Array.isArray(common.picture) && common.picture.length > 0)
      result.hasAlbumArt = true;

    if (format.duration != null) result.duration = format.duration;
    if (format.bitrate != null) result.bitrate = format.bitrate;
    if (format.sampleRate != null) result.sampleRate = format.sampleRate;
    if (format.numberOfChannels != null)
      result.channels = format.numberOfChannels;
    if (typeof format.codec === 'string') result.codec = format.codec;

    return result;
  } catch (err) {
    console.error(
      `Music tag extraction failed for ${filePath}: ${(err as Error).message}`,
    );
    return null;
  }
}
