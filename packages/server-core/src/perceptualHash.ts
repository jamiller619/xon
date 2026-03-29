import { eq, inArray } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import sharp from "sharp";
import { isImageCategory } from "./exiftool.js";
import { duplicateCandidates, imageHashes, mediaItems } from "./schema.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PerceptualHashConfig {
  /** Hamming distance threshold (0–64). Lower = stricter. Default: 10 */
  threshold?: number;
}

/**
 * Interface for an ONNX inference session used for visual embedding.
 * Inject via setPerceptualHashOnnxSession() to enable model-based similarity.
 */
export interface PerceptualHashOnnxSession {
  run(
    feeds: Record<string, { data: Float32Array; dims: number[] }>
  ): Promise<Record<string, { data: Float32Array; dims: number[] }>>;
}

let onnxSession: PerceptualHashOnnxSession | null = null;

export function setPerceptualHashOnnxSession(session: PerceptualHashOnnxSession | null): void {
  onnxSession = session;
}

export function getPerceptualHashOnnxSession(): PerceptualHashOnnxSession | null {
  return onnxSession;
}

// ── dHash algorithm ───────────────────────────────────────────────────────────

/**
 * Compute a difference hash (dHash) for an image file.
 * Resizes to 9×8 grayscale, compares adjacent horizontal pixels,
 * producing a 64-bit hash encoded as a 16-character hex string.
 * Returns null if the file cannot be processed.
 */
export async function computePerceptualHash(filePath: string): Promise<string | null> {
  // If an ONNX session is injected, attempt visual embedding-based hash
  if (onnxSession) {
    try {
      const raw = await sharp(filePath)
        .resize(64, 64, { fit: "fill" })
        .grayscale()
        .raw()
        .toBuffer();
      const floatData = new Float32Array(raw.length);
      for (let i = 0; i < raw.length; i++) {
        floatData[i] = (raw[i] ?? 0) / 255;
      }
      const result = await onnxSession.run({
        input: { data: floatData, dims: [1, 1, 64, 64] },
      });
      const embedding = result.output;
      if (!embedding) return computeDHash(filePath);
      // Binarize embedding into hash bits
      let hash = "";
      const data = embedding.data;
      for (let i = 0; i < Math.min(64, data.length); i += 4) {
        let nibble = 0;
        for (let b = 0; b < 4 && i + b < data.length; b++) {
          if ((data[i + b] ?? 0) > 0) nibble |= 1 << b;
        }
        hash += nibble.toString(16);
      }
      return hash.padEnd(16, "0");
    } catch {
      // Fall through to dHash
    }
  }
  return computeDHash(filePath);
}

/** Pure dHash: resize to 9×8 grayscale and hash horizontal differences. */
async function computeDHash(filePath: string): Promise<string | null> {
  try {
    const { data } = await sharp(filePath)
      .resize(9, 8, { fit: "fill" })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Build 64-bit hash: for each row, compare 8 pairs of adjacent pixels
    let hash = BigInt(0);
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const left = data[row * 9 + col] ?? 0;
        const right = data[row * 9 + col + 1] ?? 0;
        if (left < right) {
          hash |= BigInt(1) << BigInt(row * 8 + col);
        }
      }
    }
    return hash.toString(16).padStart(16, "0");
  } catch {
    return null;
  }
}

// ── Hamming distance & similarity ─────────────────────────────────────────────

/** Count differing bits between two 16-char hex hashes. */
export function hammingDistance(hash1: string, hash2: string): number {
  if (hash1.length !== hash2.length) return 64;
  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    const a = Number.parseInt(hash1[i] ?? "0", 16);
    const b = Number.parseInt(hash2[i] ?? "0", 16);
    let xor = a ^ b;
    while (xor) {
      distance += xor & 1;
      xor >>= 1;
    }
  }
  return distance;
}

/**
 * Convert Hamming distance (0–64) to similarity score (0–100).
 * distance=0 → 100 (identical), distance=64 → 0 (completely different).
 */
export function hashSimilarity(hash1: string, hash2: string): number {
  const dist = hammingDistance(hash1, hash2);
  return Math.round(((64 - dist) / 64) * 100);
}

// ── Library scan ──────────────────────────────────────────────────────────────

/**
 * Scan all image items in a library for duplicates.
 * Computes/caches perceptual hashes, then compares all pairs.
 * Inserts new duplicate_candidates for pairs exceeding the threshold.
 * @param threshold Hamming distance threshold (0–64). Default 10.
 */
export async function scanLibraryForDuplicates(
  db: LibSQLDatabase,
  libraryId: string,
  threshold = 10
): Promise<number> {
  // Load all image media items for this library
  const items = await db.select().from(mediaItems).where(eq(mediaItems.libraryId, libraryId));

  const imageItems = items.filter((item) => isImageCategory(item.mediaCategory));
  if (imageItems.length === 0) return 0;

  const itemIds = imageItems.map((i) => i.id);

  // Load existing hashes
  const existingHashes = await db
    .select()
    .from(imageHashes)
    .where(inArray(imageHashes.mediaItemId, itemIds));

  const hashMap = new Map<string, string>();
  for (const row of existingHashes) {
    hashMap.set(row.mediaItemId, row.hash);
  }

  // Compute missing hashes
  const newHashRows: Array<{ id: string; mediaItemId: string; hash: string }> = [];
  for (const item of imageItems) {
    if (!hashMap.has(item.id)) {
      const hash = await computePerceptualHash(item.filePath);
      if (hash) {
        hashMap.set(item.id, hash);
        newHashRows.push({
          id: `${item.id}-hash`,
          mediaItemId: item.id,
          hash,
        });
      }
    }
  }

  if (newHashRows.length > 0) {
    for (const row of newHashRows) {
      await db
        .insert(imageHashes)
        .values(row)
        .onConflictDoUpdate({ target: imageHashes.mediaItemId, set: { hash: row.hash } });
    }
  }

  // Load existing candidates to avoid duplicates
  const existingCandidates = await db
    .select({
      mediaItemId1: duplicateCandidates.mediaItemId1,
      mediaItemId2: duplicateCandidates.mediaItemId2,
    })
    .from(duplicateCandidates)
    .where(eq(duplicateCandidates.libraryId, libraryId));

  const existingPairs = new Set(
    existingCandidates.map((r) => `${r.mediaItemId1}:${r.mediaItemId2}`)
  );

  // Compare all pairs
  const itemsWithHashes = imageItems.filter((i) => hashMap.has(i.id));
  let found = 0;

  for (let i = 0; i < itemsWithHashes.length; i++) {
    for (let j = i + 1; j < itemsWithHashes.length; j++) {
      const a = itemsWithHashes[i];
      const b = itemsWithHashes[j];
      if (!a || !b) continue;
      const hashA = hashMap.get(a.id);
      const hashB = hashMap.get(b.id);
      if (!hashA || !hashB) continue;

      const dist = hammingDistance(hashA, hashB);
      if (dist <= threshold) {
        const pairKey = `${a.id}:${b.id}`;
        if (!existingPairs.has(pairKey)) {
          const similarity = Math.round(((64 - dist) / 64) * 100);
          await db.insert(duplicateCandidates).values({
            id: `dup-${a.id}-${b.id}`,
            libraryId,
            mediaItemId1: a.id,
            mediaItemId2: b.id,
            similarity,
            status: "pending",
          });
          existingPairs.add(pairKey);
          found++;
        }
      }
    }
  }

  return found;
}
