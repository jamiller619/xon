export interface ParsedMovie {
  type: 'movie';
  title: string;
  year?: number;
}

export interface ParsedTvShow {
  type: 'tv';
  seriesTitle: string;
  season: number;
  episode: number;
}

export type ParsedMedia = ParsedMovie | ParsedTvShow;

/** Replace dots and underscores with spaces, collapse multiple spaces */
function cleanTitle(raw: string): string {
  return raw.replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Attempt to parse a TV episode from a filename base (no extension).
 * Supported patterns: S01E05, s01e05, 1x05
 */
function parseTvShow(name: string): ParsedTvShow | null {
  // S01E05 style
  const seMatch = name.match(/^(.*?)[.\s_-]+[Ss](\d{1,2})[Ee](\d{1,2})/);
  if (seMatch) {
    const raw = seMatch[1] ?? '';
    const s = seMatch[2] ?? '1';
    const e = seMatch[3] ?? '1';
    return {
      type: 'tv',
      seriesTitle: cleanTitle(raw),
      season: Number.parseInt(s, 10),
      episode: Number.parseInt(e, 10),
    };
  }

  // 1x05 style
  const xMatch = name.match(/^(.*?)[.\s_-]+(\d{1,2})x(\d{2})/i);
  if (xMatch) {
    const raw = xMatch[1] ?? '';
    const s = xMatch[2] ?? '1';
    const e = xMatch[3] ?? '1';
    return {
      type: 'tv',
      seriesTitle: cleanTitle(raw),
      season: Number.parseInt(s, 10),
      episode: Number.parseInt(e, 10),
    };
  }

  return null;
}

/**
 * Parse a movie filename: extract title and optional year.
 */
function parseMovie(name: string): ParsedMovie {
  // "Title (Year)" pattern
  const parenMatch = name.match(/^(.*?)\s*\(((?:19|20)\d{2})\)/);
  if (parenMatch) {
    const raw = parenMatch[1] ?? '';
    const y = parenMatch[2] ?? '';
    return {
      type: 'movie',
      title: cleanTitle(raw),
      year: Number.parseInt(y, 10),
    };
  }

  // "Title.Year." dot-separated pattern
  const dotMatch = name.match(/^(.*?)[.\s_-]+((?:19|20)\d{2})(?:[.\s_-]|$)/);
  if (dotMatch) {
    const raw = dotMatch[1] ?? '';
    const y = dotMatch[2] ?? '';
    return {
      type: 'movie',
      title: cleanTitle(raw),
      year: Number.parseInt(y, 10),
    };
  }

  return { type: 'movie', title: cleanTitle(name) };
}

/**
 * Parse a file path to determine whether it is a movie or TV episode,
 * and extract the title/year or series/season/episode information.
 */
export function parseMediaTitle(filePath: string): ParsedMedia {
  const parts = filePath.split('/');
  const filename = parts[parts.length - 1] ?? filePath;
  const nameWithoutExt = filename.replace(/\.[^.]+$/, '');

  const tvResult = parseTvShow(nameWithoutExt);
  if (tvResult) return tvResult;

  return parseMovie(nameWithoutExt);
}
