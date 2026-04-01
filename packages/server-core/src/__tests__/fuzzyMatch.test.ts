import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type MatchCandidate,
  type OnnxInferenceSession,
  computeMatchScore,
  getOnnxSession,
  jaroWinkler,
  matchMediaFile,
  ngramSimilarity,
  parseFilenameInfo,
  setOnnxSession,
} from '../fuzzyMatch.js';

afterEach(() => {
  setOnnxSession(null);
});

describe('jaroWinkler', () => {
  it('returns 1 for identical strings', () => {
    expect(jaroWinkler('inception', 'inception')).toBe(1);
  });

  it('returns 0 for empty vs non-empty', () => {
    expect(jaroWinkler('', 'hello')).toBe(0);
  });

  it('returns a high score for similar strings', () => {
    const score = jaroWinkler('the dark knight', 'the dark knight rises');
    expect(score).toBeGreaterThan(0.8);
  });

  it('returns a low score for very different strings', () => {
    const score = jaroWinkler('inception', 'xyzabc');
    expect(score).toBeLessThan(0.7);
  });
});

describe('ngramSimilarity', () => {
  it('returns 1 for identical strings', () => {
    expect(ngramSimilarity('hello', 'hello')).toBe(1);
  });

  it('returns 0 for completely different strings', () => {
    expect(ngramSimilarity('abc', 'xyz')).toBe(0);
  });

  it('returns a value between 0 and 1 for partial matches', () => {
    const score = ngramSimilarity('the avengers', 'avengers endgame');
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it('handles strings shorter than n gracefully', () => {
    expect(ngramSimilarity('a', 'a', 2)).toBe(0);
    expect(ngramSimilarity('a', 'b', 2)).toBe(0);
  });
});

describe('parseFilenameInfo', () => {
  it('extracts title from simple filename', () => {
    const { title, year } = parseFilenameInfo('Inception.mkv');
    expect(title).toBe('Inception');
    expect(year).toBeUndefined();
  });

  it('extracts title and year from formatted filename', () => {
    const { title, year } = parseFilenameInfo('Inception.(2010).mkv');
    expect(title).toBe('Inception');
    expect(year).toBe(2010);
  });

  it('strips quality tags from filename', () => {
    const { title } = parseFilenameInfo(
      'The.Dark.Knight.2008.1080p.BluRay.mkv',
    );
    expect(title.toLowerCase()).not.toContain('1080p');
    expect(title.toLowerCase()).not.toContain('bluray');
  });

  it('replaces dots and underscores with spaces', () => {
    const { title } = parseFilenameInfo('The_Dark_Knight.mkv');
    expect(title).toBe('The Dark Knight');
  });

  it('extracts year from brackets', () => {
    const { year } = parseFilenameInfo('Blade.Runner.[1982].mkv');
    expect(year).toBe(1982);
  });
});

describe('computeMatchScore', () => {
  it('returns high score for exact title match', async () => {
    const score = await computeMatchScore('inception', { title: 'Inception' });
    expect(score).toBeGreaterThanOrEqual(95);
  });

  it('returns low score for unrelated titles', async () => {
    const score = await computeMatchScore('inception', { title: 'Titanic' });
    expect(score).toBeLessThan(60);
  });

  it('uses ONNX session when injected', async () => {
    const mockRun = vi.fn().mockResolvedValue({
      output: { data: new Float32Array([0.92]) },
    });
    const mockSession: OnnxInferenceSession = { run: mockRun };
    setOnnxSession(mockSession);

    const score = await computeMatchScore('inception', { title: 'Inception' });
    expect(mockRun).toHaveBeenCalledOnce();
    expect(score).toBe(92);
  });

  it('falls back to string similarity when ONNX throws', async () => {
    const mockSession: OnnxInferenceSession = {
      run: vi.fn().mockRejectedValue(new Error('ONNX error')),
    };
    setOnnxSession(mockSession);

    const score = await computeMatchScore('inception', { title: 'Inception' });
    expect(score).toBeGreaterThanOrEqual(90);
  });
});

describe('matchMediaFile', () => {
  const candidates: MatchCandidate[] = [
    { title: 'Inception', year: 2010 },
    { title: 'Interstellar', year: 2014 },
    { title: 'The Dark Knight', year: 2008 },
  ];

  it('returns results sorted by confidence descending', async () => {
    const results = await matchMediaFile(
      'Inception.2010.1080p.mkv',
      '/movies/Inception.2010.1080p.mkv',
      {},
      candidates,
    );
    expect(results.length).toBe(3);
    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i]?.confidence).toBeGreaterThanOrEqual(
        results[i + 1]?.confidence ?? 0,
      );
    }
  });

  it('best candidate for inception filename is Inception', async () => {
    const results = await matchMediaFile(
      'Inception.2010.mkv',
      '/movies/Inception.2010.mkv',
      {},
      candidates,
    );
    expect(results[0]?.candidate.title).toBe('Inception');
  });

  it('marks local results with source=local', async () => {
    const results = await matchMediaFile(
      'Inception.mkv',
      '/movies/Inception.mkv',
      {},
      candidates,
    );
    for (const r of results) {
      expect(r.source).toBe('local');
    }
  });

  it('calls cloud API when best local confidence is below threshold', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        title: 'Inception',
        year: 2010,
        externalId: 'tt1375666',
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    try {
      const results = await matchMediaFile(
        'xxxxunknown.mkv',
        '/movies/xxxxunknown.mkv',
        {},
        [],
        {
          cloudApiUrl: 'https://api.example.com/match',
          cloudApiKey: 'key123',
        },
      );
      expect(mockFetch).toHaveBeenCalledOnce();
      expect(results.some((r) => r.source === 'cloud')).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('does not call cloud API when best local confidence is above threshold', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    try {
      await matchMediaFile(
        'Inception.mkv',
        '/movies/Inception.mkv',
        {},
        [{ title: 'Inception' }],
        {
          autoAcceptThreshold: 50,
          cloudApiUrl: 'https://api.example.com/match',
          cloudApiKey: 'key123',
        },
      );
      expect(mockFetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('returns empty array when no candidates and no cloud config', async () => {
    const results = await matchMediaFile(
      'unknown.mkv',
      '/movies/unknown.mkv',
      {},
      [],
    );
    expect(results).toEqual([]);
  });

  it('cloud candidate gets minimum 70 confidence', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ title: 'xyzzy' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    try {
      const results = await matchMediaFile(
        'totally-unknown-gibberish.mkv',
        '/movies/totally-unknown-gibberish.mkv',
        {},
        [],
        { cloudApiUrl: 'https://api.example.com/match', cloudApiKey: 'key' },
      );
      const cloudResult = results.find((r) => r.source === 'cloud');
      expect(cloudResult?.confidence).toBeGreaterThanOrEqual(70);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('getOnnxSession returns null initially', () => {
    expect(getOnnxSession()).toBeNull();
  });

  it('setOnnxSession and getOnnxSession round-trip', () => {
    const mockSession: OnnxInferenceSession = { run: vi.fn() };
    setOnnxSession(mockSession);
    expect(getOnnxSession()).toBe(mockSession);
    setOnnxSession(null);
    expect(getOnnxSession()).toBeNull();
  });
});
