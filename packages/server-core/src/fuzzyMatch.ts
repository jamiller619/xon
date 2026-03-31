import { basename, dirname } from 'node:path';

export interface MatchCandidate {
  title: string;
  year?: number;
  externalId?: string;
  metadata?: Record<string, unknown>;
}

export interface MatchResult {
  candidate: MatchCandidate;
  confidence: number; // 0–100
  source: 'local' | 'cloud';
}

export interface FuzzyMatchConfig {
  /** Confidence threshold (0–100) above which a match is auto-accepted. Default: 85 */
  autoAcceptThreshold?: number;
  /** Cloud API endpoint for optional fallback matching */
  cloudApiUrl?: string;
  /** Bearer token for cloud API */
  cloudApiKey?: string;
}

/**
 * Interface for an ONNX inference session (compatible with onnxruntime-node).
 * Inject via setOnnxSession() to enable ONNX-based local inference.
 */
export interface OnnxInferenceSession {
  run(
    feeds: Record<string, { data: Float32Array; dims: number[] }>,
  ): Promise<Record<string, { data: Float32Array }>>;
}

let onnxSession: OnnxInferenceSession | null = null;

/** Inject an ONNX Runtime session to enable model-based local inference. */
export function setOnnxSession(session: OnnxInferenceSession | null): void {
  onnxSession = session;
}

export function getOnnxSession(): OnnxInferenceSession | null {
  return onnxSession;
}

// ── String similarity primitives ────────────────────────────────────────────

function jaro(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0 || len2 === 0) return 0;
  const matchDist = Math.max(0, Math.floor(Math.max(len1, len2) / 2) - 1);
  const s1Matches = new Array<boolean>(len1).fill(false);
  const s2Matches = new Array<boolean>(len2).fill(false);
  let matches = 0;
  let transpositions = 0;
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDist);
    const end = Math.min(i + matchDist + 1, len2);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }
  return (
    (matches / len1 +
      matches / len2 +
      (matches - transpositions / 2) / matches) /
    3
  );
}

/** Jaro-Winkler similarity (0–1). Gives extra weight to common prefixes. */
export function jaroWinkler(s1: string, s2: string): number {
  const jaroScore = jaro(s1, s2);
  let prefix = 0;
  const maxPrefix = Math.min(4, Math.min(s1.length, s2.length));
  for (let i = 0; i < maxPrefix; i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }
  return jaroScore + prefix * 0.1 * (1 - jaroScore);
}

/** Jaccard similarity of character n-grams (0–1). */
export function ngramSimilarity(s1: string, s2: string, n = 2): number {
  if (s1.length < n || s2.length < n) return 0;
  const ngrams1 = new Set<string>();
  const ngrams2 = new Set<string>();
  for (let i = 0; i <= s1.length - n; i++) ngrams1.add(s1.slice(i, i + n));
  for (let i = 0; i <= s2.length - n; i++) ngrams2.add(s2.slice(i, i + n));
  let intersection = 0;
  for (const g of ngrams1) {
    if (ngrams2.has(g)) intersection++;
  }
  return intersection / (ngrams1.size + ngrams2.size - intersection);
}

// ── Filename parsing ─────────────────────────────────────────────────────────

/** Extract probable title and year from a media filename. */
export function parseFilenameInfo(fileName: string): {
  title: string;
  year?: number;
} {
  // Remove extension
  let name = fileName.replace(/\.[^.]+$/, '');
  // Extract year in parens/brackets (e.g. "(2001)" or "[2001]")
  const yearMatch = name.match(/[\[(](1[89]\d{2}|20\d{2})[\])]/);
  const year = yearMatch ? Number.parseInt(yearMatch[1] ?? '0', 10) : undefined;
  // Strip year marker and common quality tags
  name = name
    .replace(/[\[(](1[89]\d{2}|20\d{2})[\])].*/g, '')
    .replace(
      /\.(1080p|720p|4k|bluray|bdrip|dvdrip|webrip|hdtv|x264|x265|hevc).*/gi,
      '',
    )
    .replace(/[._-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const result: { title: string; year?: number } = { title: name };
  if (year !== undefined) result.year = year;
  return result;
}

// ── Feature extraction and scoring ──────────────────────────────────────────

function extractFeatures(query: string, candidate: string): Float32Array {
  const jw = jaroWinkler(query, candidate);
  const ng2 = ngramSimilarity(query, candidate, 2);
  const ng3 = ngramSimilarity(query, candidate, 3);
  const lenRatio =
    query.length === 0 && candidate.length === 0
      ? 1
      : Math.min(query.length, candidate.length) /
        Math.max(query.length, candidate.length);
  return new Float32Array([jw, ng2, ng3, lenRatio]);
}

async function inferScore(features: Float32Array): Promise<number> {
  // Prefer ONNX model when a session has been injected
  if (onnxSession !== null) {
    try {
      const output = await onnxSession.run({
        input: { data: features, dims: [1, features.length] },
      });
      const scores = output.output;
      if (scores) {
        return Math.min(
          100,
          Math.max(0, Math.round((scores.data[0] ?? 0) * 100)),
        );
      }
    } catch {
      // ONNX inference failed — fall through to string-similarity fallback
    }
  }
  // Weighted string-similarity combination (local inference default)
  const [jw, ng2, ng3, lr] = features;
  const score =
    (jw ?? 0) * 0.5 + (ng2 ?? 0) * 0.25 + (ng3 ?? 0) * 0.15 + (lr ?? 0) * 0.1;
  return Math.round(score * 100);
}

/** Compute a 0–100 confidence score for a query title vs a candidate. */
export async function computeMatchScore(
  queryTitle: string,
  candidate: MatchCandidate,
): Promise<number> {
  const q = queryTitle.toLowerCase().trim();
  const c = candidate.title.toLowerCase().trim();
  return inferScore(extractFeatures(q, c));
}

// ── Cloud API fallback ───────────────────────────────────────────────────────

async function callCloudApi(
  fileName: string,
  filePath: string,
  metadata: Record<string, unknown>,
  cloudApiUrl: string,
  cloudApiKey: string,
): Promise<MatchCandidate | null> {
  try {
    const response = await fetch(cloudApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cloudApiKey}`,
      },
      body: JSON.stringify({ fileName, filePath, metadata }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as Record<string, unknown>;
    if (typeof data.title !== 'string') return null;
    const candidate: MatchCandidate = { title: data.title };
    if (typeof data.year === 'number') candidate.year = data.year;
    if (typeof data.externalId === 'string')
      candidate.externalId = data.externalId;
    if (typeof data.metadata === 'object' && data.metadata !== null) {
      candidate.metadata = data.metadata as Record<string, unknown>;
    }
    return candidate;
  } catch {
    return null;
  }
}

// ── Main matching function ───────────────────────────────────────────────────

/**
 * Score a list of candidates against a media file's filename and path.
 * If no candidate exceeds autoAcceptThreshold and a cloud API is configured,
 * the cloud API is queried for a better match.
 *
 * Returns results sorted by confidence descending.
 */
export async function matchMediaFile(
  fileName: string,
  filePath: string,
  metadata: Record<string, unknown>,
  candidates: MatchCandidate[],
  config: FuzzyMatchConfig = {},
): Promise<MatchResult[]> {
  const { title: parsedTitle } = parseFilenameInfo(fileName);
  const parentDir = basename(dirname(filePath));
  const autoAcceptThreshold = config.autoAcceptThreshold ?? 85;

  const localResults: MatchResult[] = await Promise.all(
    candidates.map(async (candidate) => {
      const fileScore = await computeMatchScore(parsedTitle, candidate);
      const dirScore = await computeMatchScore(parentDir, candidate);
      const confidence = Math.max(fileScore, dirScore);
      return { candidate, confidence, source: 'local' as const };
    }),
  );
  localResults.sort((a, b) => b.confidence - a.confidence);

  const bestLocal = localResults[0];
  const hasCloudConfig = config.cloudApiUrl && config.cloudApiKey;
  if (
    hasCloudConfig &&
    (!bestLocal || bestLocal.confidence < autoAcceptThreshold)
  ) {
    const cloudCandidate = await callCloudApi(
      fileName,
      filePath,
      metadata,
      config.cloudApiUrl as string,
      config.cloudApiKey as string,
    );
    if (cloudCandidate) {
      const cloudScore = await computeMatchScore(parsedTitle, cloudCandidate);
      // Cloud results get a minimum confidence boost since they come from a richer source
      const cloudConfidence = Math.max(cloudScore, 70);
      localResults.unshift({
        candidate: cloudCandidate,
        confidence: cloudConfidence,
        source: 'cloud',
      });
    }
  }

  return localResults;
}
