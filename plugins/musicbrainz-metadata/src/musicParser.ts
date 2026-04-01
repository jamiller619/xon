import { basename, dirname } from 'node:path'

export interface ParsedMusic {
  artist?: string
  album?: string
  title: string
  trackNumber?: number
  discNumber?: number
}

/**
 * Strips common audio file extensions.
 */
function stripExtension(name: string): string {
  return name.replace(
    /\.(mp3|flac|ogg|m4a|aac|wav|wma|opus|ape|alac|aiff?|dsf|dsd)$/i,
    '',
  )
}

/**
 * Normalizes separators (underscores/dots to spaces) and trims.
 */
function normalize(s: string): string {
  return s.replace(/[_]/g, ' ').trim()
}

/**
 * Extracts a leading track number like "01", "01.", "01 -", "Track 01", etc.
 * Returns { trackNumber, rest } or { trackNumber: undefined, rest: original }.
 */
function extractTrackNumber(name: string): {
  trackNumber: number | undefined
  rest: string
} {
  // "01 - Title", "01. Title", "01 Title"
  const m = /^(\d{1,3})[.\s-]+(.+)$/.exec(name)
  if (m) {
    const n = Number.parseInt(m[1] ?? '0', 10)
    const rest = (m[2] ?? '').trim()
    return { trackNumber: n, rest }
  }
  return { trackNumber: undefined, rest: name }
}

/**
 * Tries to parse "Artist - Title" or "Artist - TrackNo - Title" pattern.
 */
function parseArtistDashTitle(
  name: string,
): { artist: string; title: string } | null {
  const parts = name.split(' - ').map((p) => p.trim())
  if (parts.length >= 2) {
    const artist = parts[0] ?? ''
    // Middle part might be a track number — skip it
    const titlePart =
      parts.length >= 3
        ? parts.slice(2).join(' - ')
        : parts.slice(1).join(' - ')
    if (artist.length > 0 && titlePart.length > 0) {
      return { artist, title: titlePart }
    }
  }
  return null
}

/**
 * Builds a ParsedMusic result, omitting optional fields when they are undefined
 * to satisfy exactOptionalPropertyTypes: true.
 */
function make(
  title: string,
  opts: {
    artist?: string | undefined
    album?: string | undefined
    trackNumber?: number | undefined
  },
): ParsedMusic {
  const result: ParsedMusic = { title }
  if (opts.artist !== undefined) result.artist = opts.artist
  if (opts.album !== undefined) result.album = opts.album
  if (opts.trackNumber !== undefined) result.trackNumber = opts.trackNumber
  return result
}

/**
 * Parses music metadata from a file path using directory structure and filename conventions.
 *
 * Supported layouts:
 *   /music/Artist/Album/01 - Title.mp3
 *   /music/Artist/Album/01. Title.mp3
 *   /music/Artist - Album/01 - Title.mp3
 *   /music/Artist - Title.mp3  (flat)
 *   /music/01 - Title.mp3      (flat, no artist in path)
 */
export function parseMusicPath(filePath: string): ParsedMusic {
  const dir = dirname(filePath)
  const file = stripExtension(basename(filePath))

  const dirParts = dir
    .split(/[\\/]/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && p !== '.' && p !== '..')

  // Extract the immediate parent and grandparent directory names
  const parentDir = dirParts[dirParts.length - 1]
  const grandparentDir = dirParts[dirParts.length - 2]

  // Extract track number from filename
  const { trackNumber, rest: fileBase } = extractTrackNumber(file)

  // ── Case 1: grandparent/parent/file → Artist/Album/Title ──────────────────
  if (grandparentDir !== undefined && parentDir !== undefined) {
    // parent might be "Artist - Album" or just "Album"
    const albumDash = parseArtistDashTitle(parentDir)
    if (albumDash !== null) {
      // grandparent/Artist - Album/Title  → artist from album dash, album as full parentDir
      const { trackNumber: tn2, rest: title } = extractTrackNumber(fileBase)
      return make(normalize(title), {
        artist: normalize(albumDash.artist),
        album: normalize(parentDir),
        trackNumber: trackNumber ?? tn2,
      })
    }

    // Check if file has "Artist - Title" embedded
    const fileDash = parseArtistDashTitle(fileBase)
    if (fileDash !== null) {
      return make(normalize(fileDash.title), {
        artist: normalize(fileDash.artist),
        album: normalize(parentDir),
        trackNumber,
      })
    }

    // Straightforward: grandparent=Artist, parent=Album, file=Title
    return make(normalize(fileBase), {
      artist: normalize(grandparentDir),
      album: normalize(parentDir),
      trackNumber,
    })
  }

  // ── Case 2: parent/file → could be Artist/Title or Album/Title ───────────
  if (parentDir !== undefined) {
    const fileDash = parseArtistDashTitle(fileBase)
    if (fileDash !== null) {
      return make(normalize(fileDash.title), {
        artist: normalize(fileDash.artist),
        album: normalize(parentDir),
        trackNumber,
      })
    }

    // Try "Artist - Album" in parentDir
    const parentDash = parseArtistDashTitle(parentDir)
    if (parentDash !== null) {
      return make(normalize(fileBase), {
        artist: normalize(parentDash.artist),
        album: normalize(parentDir),
        trackNumber,
      })
    }

    return make(normalize(fileBase), {
      artist: normalize(parentDir),
      trackNumber,
    })
  }

  // ── Case 3: flat — only filename available ────────────────────────────────
  const fileDash = parseArtistDashTitle(fileBase)
  if (fileDash !== null) {
    return make(normalize(fileDash.title), {
      artist: normalize(fileDash.artist),
      trackNumber,
    })
  }

  return make(normalize(fileBase), { trackNumber })
}
