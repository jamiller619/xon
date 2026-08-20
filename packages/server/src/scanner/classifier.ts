import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import type { ContentType } from '@xon/shared'
import { toLocalPath } from './scanner.ts'

type ClassifiableContentType =
  | 'audio'
  | 'image'
  | 'text'
  | 'video'
  | 'video/movie'
  | 'video/tvshow'

type FileEntry = {
  path: string
  extension: string
}

type Evidence = {
  type: ClassifiableContentType
  confidence: number
  reason: string
}

export type MediaClassification = {
  type?: ContentType
  confidence: number
  mixed: boolean
  filesFound: number
  relevantFiles: number
  filesSampled: number
  ignoredSidecars: number
  breakdown: Partial<Record<ClassifiableContentType, number>>
  percentages: Partial<Record<ClassifiableContentType, number>>
  reason: string
  unreadablePaths: string[]
}

export type MediaClassifierOptions = {
  sampleRatio?: number
  maxSamples?: number
  dominance?: number
}

const VIDEO_EXTENSIONS = new Set([
  '.3g2',
  '.3gp',
  '.asf',
  '.avi',
  '.divx',
  '.f4v',
  '.flv',
  '.m2ts',
  '.m4v',
  '.mkv',
  '.mov',
  '.mp4',
  '.mpeg',
  '.mpg',
  '.mts',
  '.ogm',
  '.ogv',
  '.rm',
  '.rmvb',
  '.ts',
  '.vob',
  '.webm',
  '.wmv',
])

const AUDIO_EXTENSIONS = new Set([
  '.aac',
  '.aiff',
  '.alac',
  '.ape',
  '.dff',
  '.dsf',
  '.flac',
  '.m4a',
  '.m4b',
  '.mp3',
  '.oga',
  '.ogg',
  '.opus',
  '.wav',
  '.wma',
])

const IMAGE_EXTENSIONS = new Set([
  '.arw',
  '.avif',
  '.bmp',
  '.cr2',
  '.dng',
  '.gif',
  '.heic',
  '.heif',
  '.jpeg',
  '.jpg',
  '.nef',
  '.png',
  '.raw',
  '.tif',
  '.tiff',
  '.webp',
])

const TEXT_EXTENSIONS = new Set([
  '.csv',
  '.doc',
  '.docx',
  '.epub',
  '.htm',
  '.html',
  '.log',
  '.md',
  '.odt',
  '.pdf',
  '.rtf',
  '.tex',
  '.tsv',
  '.txt',
])

const SIDECAR_EXTENSIONS = new Set([
  '.ass',
  '.cue',
  '.idx',
  '.lrc',
  '.m3u',
  '.m3u8',
  '.nfo',
  '.smi',
  '.srt',
  '.ssa',
  '.sub',
  '.vtt',
])

const EPISODE_PATTERNS = [
  /\bS\d{1,3}E\d{1,4}(?:[E-]\d{1,4})*\b/i,
  /\b\d{1,3}x\d{1,4}(?:-\d{1,4})*\b/i,
  /\bseason[\s._-]*\d{1,3}[\s._-]*episode[\s._-]*\d{1,4}\b/i,
  /\b(?:episode|ep)[\s._-]*\d{1,4}\b/i,
]

const TV_PATH =
  /(?:^|[/\\])(?:tv(?:[\s._-]*shows?)?|shows?|series|season[\s._-]*\d+|specials?)(?:[/\\]|$)/i
const MOVIE_PATH = /(?:^|[/\\])(?:movies?|films?)(?:[/\\]|$)/i
const MOVIE_YEAR = /(?:^|[\s._([])(?:19|20)\d{2}(?=$|[\s._)\]])/
const RELEASE_TAG =
  /\b(?:2160p|1080p|720p|uhd|bluray|blu-ray|bdrip|brrip|webrip|web-dl|webdl|hdtv|dvdrip|remux|xvid|x264|x265|hevc|av1|hdr10?)\b/i

const DEFAULT_SAMPLE_RATIO = 0.3
const DEFAULT_MAX_SAMPLES = 250
const DEFAULT_DOMINANCE = 0.75
const SIGNIFICANT_SHARE = 0.15

/**
 * Infers the presentation/metadata type of a library from its local folders.
 * Mixed folders are valid: the strongest type wins and `mixed` records that
 * other significant content was present.
 */
export class MediaClassifier {
  readonly #sampleRatio: number
  readonly #maxSamples: number
  readonly #dominance: number

  constructor(options: MediaClassifierOptions = {}) {
    this.#sampleRatio = boundedRatio(
      options.sampleRatio ?? DEFAULT_SAMPLE_RATIO,
      'sampleRatio',
    )
    this.#dominance = boundedRatio(
      options.dominance ?? DEFAULT_DOMINANCE,
      'dominance',
    )
    this.#maxSamples = options.maxSamples ?? DEFAULT_MAX_SAMPLES
    if (!Number.isInteger(this.#maxSamples) || this.#maxSamples < 1) {
      throw new Error('maxSamples must be a positive integer')
    }
  }

  async classify(folders: string[]): Promise<MediaClassification> {
    const files: FileEntry[] = []
    const unreadablePaths: string[] = []

    for (const folder of folders) {
      await collectFiles(toLocalPath(folder), files, unreadablePaths)
    }

    files.sort((left, right) => left.path.localeCompare(right.path))
    const ignoredSidecars = files.filter((file) =>
      SIDECAR_EXTENSIONS.has(file.extension),
    ).length
    const relevant = files.filter((file) => isRelevant(file.extension))

    if (relevant.length === 0) {
      return {
        confidence: 0,
        mixed: false,
        filesFound: files.length,
        relevantFiles: 0,
        filesSampled: 0,
        ignoredSidecars,
        breakdown: {},
        percentages: {},
        reason:
          files.length === 0
            ? 'No files were found in the selected folders'
            : 'No supported media files were found in the selected folders',
        unreadablePaths,
      }
    }

    const targetCount = Math.min(
      this.#maxSamples,
      relevant.length,
      Math.max(1, Math.ceil(relevant.length * this.#sampleRatio)),
    )
    const sample = evenlySpacedSample(relevant, targetCount)
    const scores = new Map<ClassifiableContentType, number>()
    const counts = new Map<ClassifiableContentType, number>()

    for (const file of sample) {
      const evidence = classifyFile(file)
      scores.set(
        evidence.type,
        (scores.get(evidence.type) ?? 0) + evidence.confidence,
      )
      counts.set(evidence.type, (counts.get(evidence.type) ?? 0) + 1)
    }

    const totalScore = [...scores.values()].reduce(
      (sum, score) => sum + score,
      0,
    )
    const ranked = [...scores.entries()].sort(
      (left, right) => right[1] - left[1],
    )
    const winnerEntry = ranked[0]
    if (!winnerEntry || totalScore === 0) {
      return {
        confidence: 0,
        mixed: false,
        filesFound: files.length,
        relevantFiles: relevant.length,
        filesSampled: sample.length,
        ignoredSidecars,
        breakdown: Object.fromEntries(counts),
        percentages: {},
        reason:
          'The selected folders did not contain enough recognizable evidence',
        unreadablePaths,
      }
    }

    const [winner, winnerScore] = winnerEntry
    const winnerShare = winnerScore / totalScore
    const winnerCount = counts.get(winner) ?? 1
    const averageWinnerConfidence = winnerScore / winnerCount
    const mixed =
      winnerShare < this.#dominance &&
      ranked.filter(([, score]) => score / totalScore >= SIGNIFICANT_SHARE)
        .length > 1
    const percentages = Object.fromEntries(
      ranked.map(([type, score]) => [type, round(score / totalScore)]),
    ) as Partial<Record<ClassifiableContentType, number>>

    return {
      type: winner,
      confidence: round(winnerShare * averageWinnerConfidence),
      mixed,
      filesFound: files.length,
      relevantFiles: relevant.length,
      filesSampled: sample.length,
      ignoredSidecars,
      breakdown: Object.fromEntries(counts),
      percentages,
      reason: mixed
        ? `${Math.round(winnerShare * 100)}% of weighted sample evidence indicates ${winner}; other significant content types were also found`
        : `${Math.round(winnerShare * 100)}% of weighted sample evidence indicates ${winner}`,
      unreadablePaths,
    }
  }
}

async function collectFiles(
  folder: string,
  files: FileEntry[],
  unreadablePaths: string[],
): Promise<void> {
  try {
    const info = await stat(folder)
    if (!info.isDirectory()) {
      unreadablePaths.push(folder)
      return
    }
  } catch {
    unreadablePaths.push(folder)
    return
  }

  const pending = [folder]
  while (pending.length > 0) {
    const current = pending.pop()
    if (!current) continue

    try {
      const entries = await readdir(current, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue
        const fullPath = path.join(current, entry.name)
        if (entry.isDirectory()) pending.push(fullPath)
        else if (entry.isFile()) {
          files.push({
            path: fullPath,
            extension: path.extname(entry.name).toLowerCase(),
          })
        }
      }
    } catch {
      unreadablePaths.push(current)
    }
  }
}

function classifyFile(file: FileEntry): Evidence {
  const stem = path.basename(file.path, file.extension)

  if (AUDIO_EXTENSIONS.has(file.extension)) {
    return { type: 'audio', confidence: 0.98, reason: 'audio extension' }
  }
  if (IMAGE_EXTENSIONS.has(file.extension)) {
    return { type: 'image', confidence: 0.98, reason: 'image extension' }
  }
  if (TEXT_EXTENSIONS.has(file.extension)) {
    return { type: 'text', confidence: 0.98, reason: 'document/text extension' }
  }

  if (EPISODE_PATTERNS.some((pattern) => pattern.test(stem))) {
    return { type: 'video/tvshow', confidence: 1, reason: 'episode filename' }
  }
  if (TV_PATH.test(file.path)) {
    return { type: 'video/tvshow', confidence: 0.95, reason: 'TV path' }
  }
  if (MOVIE_PATH.test(file.path)) {
    return { type: 'video/movie', confidence: 0.95, reason: 'movie path' }
  }
  if (
    MOVIE_YEAR.test(stem) ||
    MOVIE_YEAR.test(path.basename(path.dirname(file.path)))
  ) {
    return { type: 'video/movie', confidence: 0.9, reason: 'movie-style year' }
  }
  if (RELEASE_TAG.test(stem)) {
    return { type: 'video/movie', confidence: 0.72, reason: 'release filename' }
  }
  return { type: 'video', confidence: 0.85, reason: 'video extension' }
}

function isRelevant(extension: string): boolean {
  return (
    !SIDECAR_EXTENSIONS.has(extension) &&
    (VIDEO_EXTENSIONS.has(extension) ||
      AUDIO_EXTENSIONS.has(extension) ||
      IMAGE_EXTENSIONS.has(extension) ||
      TEXT_EXTENSIONS.has(extension))
  )
}

function evenlySpacedSample<T>(items: T[], count: number): T[] {
  if (count >= items.length) return [...items]
  if (count === 1) return [items[Math.floor(items.length / 2)] as T]

  return Array.from(
    { length: count },
    (_, index) => items[Math.round((index * (items.length - 1)) / (count - 1))],
  ) as T[]
}

function boundedRatio(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    throw new Error(`${name} must be greater than 0 and no more than 1`)
  }
  return value
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}
