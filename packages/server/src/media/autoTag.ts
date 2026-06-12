import { basename, extname } from 'node:path'
import { eq } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { libraries, mediaItems } from '../db/schema.ts'
import * as libraryService from '../services/libraryService.ts'
// import { isDocumentCategory } from './miscmeta.ts'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AutoTag {
  text: string
  /** Confidence score 0–100 */
  confidence: number
  source: 'ai-generated'
}

/**
 * Interface for an ONNX inference session used for vision/text classification.
 * Compatible with onnxruntime-node Session API.
 * Inject via setAutoTagOnnxSession() to enable model-based tagging.
 */
export interface AutoTagOnnxSession {
  run(
    feeds: Record<string, { data: Float32Array; dims: number[] }>,
  ): Promise<Record<string, { data: Float32Array; dims: number[] }>>
}

let autoTagOnnxSession: AutoTagOnnxSession | null = null

/** Inject an ONNX Runtime session for AI-powered image/document tagging. */
export function setAutoTagOnnxSession(
  session: AutoTagOnnxSession | null,
): void {
  autoTagOnnxSession = session
}

export function getAutoTagOnnxSession(): AutoTagOnnxSession | null {
  return autoTagOnnxSession
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Split a filename (without extension) into meaningful words. */
function filenameWords(filePath: string): string[] {
  const name = basename(filePath, extname(filePath))
  return name
    .toLowerCase()
    .replace(/[_\-.]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3)
}

/** Clamp a number between min and max. */
function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

// ── Image tagging ─────────────────────────────────────────────────────────────

const IMAGE_SCENE_KEYWORDS: Record<string, string[]> = {
  landscape: [
    'landscape',
    'nature',
    'mountain',
    'forest',
    'beach',
    'ocean',
    'lake',
    'river',
  ],
  portrait: ['portrait', 'person', 'people', 'face', 'selfie'],
  architecture: ['building', 'architecture', 'city', 'street', 'urban'],
  food: ['food', 'meal', 'restaurant', 'cooking', 'recipe'],
  animal: ['animal', 'pet', 'dog', 'cat', 'bird', 'wildlife'],
  travel: ['travel', 'vacation', 'trip', 'holiday', 'tour'],
  sports: ['sport', 'sports', 'game', 'match', 'team', 'player'],
  night: ['night', 'dark', 'stars', 'moon', 'evening'],
  macro: ['macro', 'close', 'detail', 'texture'],
}

/** Tag an image using EXIF metadata and filename heuristics. Falls back gracefully from ONNX. */
export async function computeImageTags(
  filePath: string,
  metadata: Record<string, unknown>,
): Promise<AutoTag[]> {
  // Try ONNX-based inference first
  if (autoTagOnnxSession !== null) {
    try {
      const features = buildImageFeatureVector(metadata)
      const output = await autoTagOnnxSession.run({
        input: { data: features, dims: [1, features.length] },
      })
      const scores = output.output
      if (scores) {
        return onnxScoresToTags(scores.data, IMAGE_LABEL_MAP)
      }
    } catch {
      // Fall through to heuristic tagging
    }
  }

  const tags: AutoTag[] = []
  const words = filenameWords(filePath)

  // Orientation from image dimensions
  const width =
    typeof metadata.imageWidth === 'number' ? metadata.imageWidth : 0
  const height =
    typeof metadata.imageHeight === 'number' ? metadata.imageHeight : 0
  if (width > 0 && height > 0) {
    if (width > height) {
      tags.push({ text: 'landscape', confidence: 80, source: 'ai-generated' })
    } else if (height > width) {
      tags.push({ text: 'portrait', confidence: 80, source: 'ai-generated' })
    } else {
      tags.push({ text: 'square', confidence: 75, source: 'ai-generated' })
    }
  }

  // GPS presence → outdoor / location photo
  if (
    metadata.gpsLatitude !== undefined ||
    metadata.gpsLongitude !== undefined
  ) {
    tags.push({ text: 'outdoor', confidence: 70, source: 'ai-generated' })
    tags.push({ text: 'location', confidence: 65, source: 'ai-generated' })
  }

  // Camera make/model → photography tag
  if (typeof metadata.make === 'string' || typeof metadata.model === 'string') {
    tags.push({ text: 'photography', confidence: 60, source: 'ai-generated' })
  }

  // EXIF keywords
  if (typeof metadata.subject === 'string' && metadata.subject.length > 0) {
    for (const kw of metadata.subject.split(/[;,]+/)) {
      const word = kw.trim().toLowerCase()
      if (word.length >= 3) {
        tags.push({ text: word, confidence: 85, source: 'ai-generated' })
      }
    }
  }

  // Scene detection from filename words
  for (const word of words) {
    for (const [scene, keywords] of Object.entries(IMAGE_SCENE_KEYWORDS)) {
      if (keywords.includes(word) && !tags.some((t) => t.text === scene)) {
        tags.push({ text: scene, confidence: 60, source: 'ai-generated' })
      }
    }
  }

  // Color space hint
  if (typeof metadata.colorSpace === 'string') {
    if (metadata.colorSpace.toLowerCase().includes('srgb')) {
      tags.push({ text: 'color', confidence: 55, source: 'ai-generated' })
    } else if (metadata.colorSpace.toLowerCase().includes('gray')) {
      tags.push({
        text: 'black-and-white',
        confidence: 70,
        source: 'ai-generated',
      })
    }
  }

  return deduplicateTags(tags)
}

// ── Document tagging ──────────────────────────────────────────────────────────

const DOCUMENT_TOPIC_KEYWORDS: Record<string, string[]> = {
  technical: [
    'technical',
    'manual',
    'specification',
    'guide',
    'reference',
    'api',
  ],
  legal: ['legal', 'contract', 'agreement', 'terms', 'policy', 'law'],
  financial: ['financial', 'invoice', 'receipt', 'budget', 'report', 'tax'],
  academic: ['research', 'thesis', 'paper', 'study', 'analysis', 'journal'],
  creative: ['story', 'novel', 'fiction', 'poem', 'script', 'creative'],
  educational: [
    'tutorial',
    'lesson',
    'course',
    'learning',
    'education',
    'training',
  ],
  business: ['business', 'proposal', 'plan', 'strategy', 'meeting', 'project'],
}

/** Tag a document using filename and extracted document metadata heuristics. */
export async function computeDocumentTags(
  filePath: string,
  metadata: Record<string, unknown>,
): Promise<AutoTag[]> {
  // Try ONNX-based inference first
  if (autoTagOnnxSession !== null) {
    try {
      const features = buildDocumentFeatureVector(metadata)
      const output = await autoTagOnnxSession.run({
        input: { data: features, dims: [1, features.length] },
      })
      const scores = output.output
      if (scores) {
        return onnxScoresToTags(scores.data, DOCUMENT_LABEL_MAP)
      }
    } catch {
      // Fall through to heuristic tagging
    }
  }

  const tags: AutoTag[] = []
  const words = filenameWords(filePath)

  // Page count → read-length hint
  const pageCount =
    typeof metadata.pageCount === 'number' ? metadata.pageCount : 0
  if (pageCount > 0) {
    if (pageCount <= 10) {
      tags.push({ text: 'short-read', confidence: 75, source: 'ai-generated' })
    } else if (pageCount <= 100) {
      tags.push({
        text: 'medium-read',
        confidence: 75,
        source: 'ai-generated',
      })
    } else {
      tags.push({ text: 'long-read', confidence: 75, source: 'ai-generated' })
    }
  }

  // Extension-based document type
  const ext = extname(filePath).toLowerCase()
  if (ext === '.pdf') {
    tags.push({ text: 'pdf', confidence: 95, source: 'ai-generated' })
  } else if (ext === '.epub' || ext === '.mobi') {
    tags.push({ text: 'ebook', confidence: 95, source: 'ai-generated' })
  } else if (ext === '.docx' || ext === '.doc' || ext === '.odt') {
    tags.push({ text: 'document', confidence: 90, source: 'ai-generated' })
  } else if (ext === '.txt' || ext === '.md') {
    tags.push({ text: 'text', confidence: 90, source: 'ai-generated' })
  }

  // Subject/title from metadata
  const textHints: string[] = []
  if (typeof metadata.title === 'string') {
    textHints.push(...metadata.title.toLowerCase().split(/\s+/))
  }
  if (typeof metadata.subject === 'string') {
    textHints.push(...metadata.subject.toLowerCase().split(/\s+/))
  }
  textHints.push(...words)

  for (const word of textHints) {
    for (const [topic, keywords] of Object.entries(DOCUMENT_TOPIC_KEYWORDS)) {
      if (
        keywords.some((k) => word.includes(k)) &&
        !tags.some((t) => t.text === topic)
      ) {
        tags.push({ text: topic, confidence: 65, source: 'ai-generated' })
      }
    }
  }

  // Author → credited tag
  if (
    typeof metadata.author === 'string' &&
    metadata.author.trim().length > 0
  ) {
    tags.push({ text: 'authored', confidence: 60, source: 'ai-generated' })
  }

  return deduplicateTags(tags)
}

// ── ONNX helpers ──────────────────────────────────────────────────────────────

/** Label maps for ONNX output index → tag name */
const IMAGE_LABEL_MAP: string[] = [
  'landscape',
  'portrait',
  'architecture',
  'food',
  'animal',
  'travel',
  'sports',
  'night',
  'macro',
  'nature',
]

const DOCUMENT_LABEL_MAP: string[] = [
  'technical',
  'legal',
  'financial',
  'academic',
  'creative',
  'educational',
  'business',
  'short-read',
  'long-read',
  'ebook',
]

function buildImageFeatureVector(
  metadata: Record<string, unknown>,
): Float32Array {
  const features = new Float32Array(8)
  const width =
    typeof metadata.imageWidth === 'number' ? metadata.imageWidth : 0
  const height =
    typeof metadata.imageHeight === 'number' ? metadata.imageHeight : 0
  features[0] = width > 0 && height > 0 ? clamp(width / height, 0, 4) : 1
  features[1] = metadata.gpsLatitude !== undefined ? 1 : 0
  features[2] = metadata.gpsLongitude !== undefined ? 1 : 0
  features[3] = typeof metadata.make === 'string' ? 1 : 0
  features[4] = typeof metadata.model === 'string' ? 1 : 0
  features[5] = typeof metadata.subject === 'string' ? 1 : 0
  features[6] =
    typeof metadata.colorSpace === 'string' &&
    metadata.colorSpace.toLowerCase().includes('gray')
      ? 1
      : 0
  features[7] = typeof metadata.orientation === 'string' ? 1 : 0
  return features
}

function buildDocumentFeatureVector(
  metadata: Record<string, unknown>,
): Float32Array {
  const features = new Float32Array(8)
  const pageCount =
    typeof metadata.pageCount === 'number' ? metadata.pageCount : 0
  features[0] = clamp(pageCount / 1000, 0, 1)
  features[1] = typeof metadata.title === 'string' ? 1 : 0
  features[2] = typeof metadata.subject === 'string' ? 1 : 0
  features[3] = typeof metadata.author === 'string' ? 1 : 0
  features[4] = pageCount <= 10 && pageCount > 0 ? 1 : 0
  features[5] = pageCount > 100 ? 1 : 0
  features[6] = 0
  features[7] = 0
  return features
}

function onnxScoresToTags(scores: Float32Array, labelMap: string[]): AutoTag[] {
  const tags: AutoTag[] = []
  for (let i = 0; i < scores.length && i < labelMap.length; i++) {
    const score = scores[i] ?? 0
    if (score >= 0.3) {
      tags.push({
        text: labelMap[i] as string,
        confidence: Math.round(clamp(score * 100, 0, 100)),
        source: 'ai-generated',
      })
    }
  }
  return tags.sort((a, b) => b.confidence - a.confidence)
}

function deduplicateTags(tags: AutoTag[]): AutoTag[] {
  const seen = new Set<string>()
  return tags.filter((t) => {
    if (seen.has(t.text)) return false
    seen.add(t.text)
    return true
  })
}

// ── Main function ─────────────────────────────────────────────────────────────

/**
 * Auto-tag all supported media items in a library.
 * Stores generated tags in metadata.aiTags field.
 * Idempotent: skips items that already have aiTags set.
 */
export async function autoTagMediaItems(
  db: LibSQLDatabase,
  libraryId: string,
): Promise<void> {
  // const rows = await db
  //   // .select({
  //   //   id: mediaItems.id,
  //   //   filePath: mediaItems.filePath,
  //   //   // mediaCategory: mediaItems.media,
  //   //   metadata: mediaItems.metadata,
  //   // })
  //   .select()
  //   .from(mediaItems)
  //   .leftJoin(libraries, eq(libraries.id, libraryId))
  //   .where(eq(mediaItems.libraryId, libraryId))
  const rows = await libraryService.getMediaByLibraryId(db, libraryId)

  // Filter to supported categories
  const supported = rows.data.filter((r) => r.mediaType.startsWith('image/'))

  const now = new Date()
  const idsToUpdate: string[] = []
  const metadataMap = new Map<string, string>()

  for (const row of supported) {
    // const meta = row.metadata
    // let meta: Record<string, unknown> = {}
    // try {
    //   meta = JSON.parse(row.metadata) as Record<string, unknown>
    // } catch {
    //   // empty metadata
    // }
    // Skip if aiTags already set (idempotent)
    // if (Array.isArray(meta.aiTags) && (meta.aiTags as unknown[]).length > 0) {
    //   continue
    // }
    // let aiTags: AutoTag[] = []
    // if (isImageCategory(row.mediaCategory)) {
    //   aiTags = await computeImageTags(row.filePath, meta)
    // } else if (isDocumentCategory(row.mediaCategory)) {
    //   aiTags = await computeDocumentTags(row.filePath, meta)
    // }
    // if (aiTags.length > 0) {
    //   meta.aiTags = aiTags
    //   idsToUpdate.push(row.id)
    //   metadataMap.set(row.id, JSON.stringify(meta))
    // }
  }

  // Batch update — one per item to preserve existing metadata
  // for (const id of idsToUpdate) {
  //   const newMetadata = metadataMap.get(id)
  //   if (newMetadata !== undefined) {
  //     await db
  //       .update(mediaItems)
  //       .set({ metadata: newMetadata, updatedAt: now })
  //       .where(eq(mediaItems.id, id))
  //   }
  // }
}
