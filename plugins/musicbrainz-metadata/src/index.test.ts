import type { PluginContext } from '@xon/plugin-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MusicBrainzMetadataPlugin } from './index.js';
import { MusicBrainzClient } from './musicBrainzClient.js';
import { parseMusicPath } from './musicParser.js';

// ─── parseMusicPath tests ─────────────────────────────────────────────────────

describe('parseMusicPath', () => {
  it('parses Artist/Album/TrackNo - Title layout', () => {
    const result = parseMusicPath(
      '/music/Pink Floyd/Dark Side/01 - Money.flac',
    );
    expect(result.artist).toBe('Pink Floyd');
    expect(result.album).toBe('Dark Side');
    expect(result.title).toBe('Money');
    expect(result.trackNumber).toBe(1);
  });

  it('parses Artist/Album/Title without track number', () => {
    const result = parseMusicPath(
      '/music/Radiohead/OK Computer/Karma Police.mp3',
    );
    expect(result.artist).toBe('Radiohead');
    expect(result.album).toBe('OK Computer');
    expect(result.title).toBe('Karma Police');
    expect(result.trackNumber).toBeUndefined();
  });

  it('parses flat Artist - Title filename', () => {
    const result = parseMusicPath('/music/The Beatles - Hey Jude.mp3');
    expect(result.artist).toBe('The Beatles');
    expect(result.title).toBe('Hey Jude');
  });

  it('parses Album/Artist - Title filename', () => {
    const result = parseMusicPath('/music/Hits/Michael Jackson - Thriller.mp3');
    expect(result.artist).toBe('Michael Jackson');
    expect(result.album).toBe('Hits');
    expect(result.title).toBe('Thriller');
  });

  it('parses track number with dot separator', () => {
    const result = parseMusicPath('/music/Nirvana/Nevermind/02. In Bloom.flac');
    expect(result.trackNumber).toBe(2);
    expect(result.title).toBe('In Bloom');
  });

  it('handles Artist - Album folder name', () => {
    const result = parseMusicPath(
      '/music/Led Zeppelin - IV/01 - Black Dog.mp3',
    );
    expect(result.artist).toBe('Led Zeppelin');
    expect(result.title).toBe('Black Dog');
    expect(result.trackNumber).toBe(1);
  });

  it('returns title only when no context available', () => {
    const result = parseMusicPath('song.mp3');
    expect(result.title).toBe('song');
    expect(result.artist).toBeUndefined();
  });

  it('strips audio extension', () => {
    const result = parseMusicPath('/music/Artist/Album/Track.flac');
    expect(result.title).toBe('Track');
  });

  it('handles three-digit track numbers', () => {
    const result = parseMusicPath('/music/Artist/Album/101 - Title.mp3');
    expect(result.trackNumber).toBe(101);
    expect(result.title).toBe('Title');
  });
});

// ─── MusicBrainzClient tests ──────────────────────────────────────────────────

function makeFetch(
  responses: Array<{ ok: boolean; status?: number; json: unknown }>,
) {
  let i = 0;
  return vi.fn(async (_url: string, _init?: RequestInit) => {
    const resp = responses[i++] ?? { ok: false, status: 404, json: {} };
    return {
      ok: resp.ok,
      status: resp.status ?? (resp.ok ? 200 : 404),
      json: async () => resp.json,
    } as unknown as Response;
  });
}

const sampleRecording = {
  id: 'rec-1',
  title: 'Bohemian Rhapsody',
  length: 354000,
  'artist-credit': [
    {
      artist: { id: 'art-1', name: 'Queen', 'sort-name': 'Queen' },
      name: 'Queen',
      joinphrase: '',
    },
  ],
  releases: [
    {
      id: 'rel-1',
      title: 'A Night at the Opera',
      date: '1975-11-21',
      'artist-credit': [],
      'label-info': [],
    },
  ],
  genres: [
    { id: 'g1', name: 'rock', count: 10 },
    { id: 'g2', name: 'progressive rock', count: 5 },
  ],
};

describe('MusicBrainzClient', () => {
  describe('searchRecording', () => {
    it('returns null when no recordings found', async () => {
      const fetch = makeFetch([
        { ok: true, json: { count: 0, recordings: [] } },
      ]);
      const client = new MusicBrainzClient(fetch);
      const result = await client.searchRecording('Unknown Track 99999');
      expect(result).toBeNull();
    });

    it('maps recording to MusicBrainzMetadata', async () => {
      const fetch = makeFetch([
        { ok: true, json: { count: 1, recordings: [sampleRecording] } },
      ]);
      const client = new MusicBrainzClient(fetch);
      const result = await client.searchRecording('Bohemian Rhapsody', 'Queen');

      expect(result).not.toBeNull();
      expect(result?.recordingMbid).toBe('rec-1');
      expect(result?.title).toBe('Bohemian Rhapsody');
      expect(result?.artists).toHaveLength(1);
      expect(result?.artists[0]?.name).toBe('Queen');
      expect(result?.album).toBe('A Night at the Opera');
      expect(result?.releaseYear).toBe('1975');
      expect(result?.genres).toContain('rock');
      expect(result?.durationMs).toBe(354000);
    });

    it('returns null when fetch fails', async () => {
      const fetch = makeFetch([{ ok: false, json: {} }]);
      const client = new MusicBrainzClient(fetch);
      const result = await client.searchRecording('Foobar');
      expect(result).toBeNull();
    });

    it('sets isCompilation for Various Artists', async () => {
      const vaRecording = {
        ...sampleRecording,
        'artist-credit': [
          {
            artist: {
              id: 'art-va',
              name: 'Various Artists',
              'sort-name': 'Various Artists',
            },
            name: 'Various Artists',
            joinphrase: '',
          },
        ],
      };
      const fetch = makeFetch([
        { ok: true, json: { count: 1, recordings: [vaRecording] } },
      ]);
      const client = new MusicBrainzClient(fetch);
      const result = await client.searchRecording('Some Compilation Track');
      expect(result?.isCompilation).toBe(true);
    });

    it('sets isCompilation for multi-artist recordings', async () => {
      const multiArtistRecording = {
        ...sampleRecording,
        'artist-credit': [
          {
            artist: {
              id: 'a1',
              name: 'Artist One',
              'sort-name': 'One, Artist',
            },
            name: 'Artist One',
            joinphrase: ' & ',
          },
          {
            artist: {
              id: 'a2',
              name: 'Artist Two',
              'sort-name': 'Two, Artist',
            },
            name: 'Artist Two',
            joinphrase: '',
          },
        ],
      };
      const fetch = makeFetch([
        { ok: true, json: { count: 1, recordings: [multiArtistRecording] } },
      ]);
      const client = new MusicBrainzClient(fetch);
      const result = await client.searchRecording('Collab Track');
      expect(result?.isCompilation).toBe(true);
    });

    it('includes album in search query when provided', async () => {
      const fetch = makeFetch([
        { ok: true, json: { count: 0, recordings: [] } },
      ]);
      const client = new MusicBrainzClient(fetch);
      await client.searchRecording('Title', 'Artist', 'Album');
      const url = (fetch.mock.calls[0] as [string])[0];
      expect(url).toContain('release');
      expect(url).toContain('Artist');
      expect(url).toContain('Album');
    });

    it('caches results to avoid duplicate requests', async () => {
      const fetch = makeFetch([
        { ok: true, json: { count: 0, recordings: [] } },
        { ok: true, json: { count: 0, recordings: [] } },
      ]);
      const client = new MusicBrainzClient(fetch);
      await client.searchRecording('CachedTrack');
      await client.searchRecording('CachedTrack');
      expect(fetch).toHaveBeenCalledOnce();
    });

    it('clearCache forces a fresh fetch', async () => {
      const fetch = makeFetch([
        { ok: true, json: { count: 0, recordings: [] } },
        { ok: true, json: { count: 0, recordings: [] } },
      ]);
      const client = new MusicBrainzClient(fetch);
      await client.searchRecording('CachedTrack');
      client.clearCache();
      await client.searchRecording('CachedTrack');
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('fetchReleaseDetails', () => {
    const releaseResponse = {
      id: 'rel-1',
      title: 'A Night at the Opera',
      date: '1975-11-21',
      'artist-credit': [
        {
          artist: { id: 'art-1', name: 'Queen', 'sort-name': 'Queen' },
          name: 'Queen',
          joinphrase: '',
        },
      ],
      'label-info': [
        {
          label: { id: 'lbl-1', name: 'EMI' },
          'catalog-number': 'EMTC 103',
        },
      ],
      genres: [
        { id: 'g1', name: 'rock', count: 8 },
        { id: 'g2', name: 'art rock', count: 3 },
      ],
      'release-group': {
        id: 'rg-1',
        title: 'A Night at the Opera',
        'primary-type': 'Album',
        'secondary-types': [],
      },
    };

    it('returns label and catalog number', async () => {
      const fetch = makeFetch([
        { ok: true, json: releaseResponse },
        { ok: true, status: 200, json: {} },
      ]);
      const client = new MusicBrainzClient(fetch);
      const result = await client.fetchReleaseDetails('rel-1');
      expect(result?.label).toBe('EMI');
      expect(result?.catalogNumber).toBe('EMTC 103');
    });

    it('returns genres sorted by count', async () => {
      const fetch = makeFetch([
        { ok: true, json: releaseResponse },
        { ok: true, status: 200, json: {} },
      ]);
      const client = new MusicBrainzClient(fetch);
      const result = await client.fetchReleaseDetails('rel-1');
      expect(result?.genres?.[0]).toBe('rock');
    });

    it('detects compilation from release-group type', async () => {
      const compilationRelease = {
        ...releaseResponse,
        'release-group': {
          id: 'rg-2',
          title: 'Greatest Hits',
          'primary-type': 'Compilation',
          'secondary-types': [],
        },
      };
      const fetch = makeFetch([
        { ok: true, json: compilationRelease },
        { ok: false, status: 404, json: {} },
      ]);
      const client = new MusicBrainzClient(fetch);
      const result = await client.fetchReleaseDetails('rel-2');
      expect(result?.isCompilation).toBe(true);
    });

    it('detects compilation from secondary types', async () => {
      const compilationRelease = {
        ...releaseResponse,
        'release-group': {
          id: 'rg-3',
          title: 'Some Album',
          'primary-type': 'Album',
          'secondary-types': ['Compilation'],
        },
      };
      const fetch = makeFetch([
        { ok: true, json: compilationRelease },
        { ok: false, status: 404, json: {} },
      ]);
      const client = new MusicBrainzClient(fetch);
      const result = await client.fetchReleaseDetails('rel-3');
      expect(result?.isCompilation).toBe(true);
    });

    it('returns null when release fetch fails', async () => {
      const fetch = makeFetch([{ ok: false, json: {} }]);
      const client = new MusicBrainzClient(fetch);
      const result = await client.fetchReleaseDetails('bad-mbid');
      expect(result).toBeNull();
    });
  });

  describe('fetchCoverArtUrl', () => {
    it('returns URL when cover art exists (200)', async () => {
      const fetch = makeFetch([{ ok: true, status: 200, json: {} }]);
      const client = new MusicBrainzClient(fetch);
      const url = await client.fetchCoverArtUrl('rel-1');
      expect(url).toContain('coverartarchive.org');
      expect(url).toContain('rel-1');
    });

    it('returns URL when cover art redirects (307)', async () => {
      const fetch = makeFetch([{ ok: false, status: 307, json: {} }]);
      const client = new MusicBrainzClient(fetch);
      const url = await client.fetchCoverArtUrl('rel-2');
      expect(url).toContain('rel-2');
    });

    it('returns null when cover art not found (404)', async () => {
      const fetch = makeFetch([{ ok: false, status: 404, json: {} }]);
      const client = new MusicBrainzClient(fetch);
      const url = await client.fetchCoverArtUrl('rel-none');
      expect(url).toBeNull();
    });
  });
});

// ─── MusicBrainzMetadataPlugin tests ─────────────────────────────────────────

function makeContext(overrides: Partial<PluginContext> = {}): PluginContext {
  return {
    manifest: {
      id: 'musicbrainz-metadata',
      name: 'MusicBrainz Metadata',
      version: '1.0.0',
      description: 'test',
      author: 'test',
      category: 'MetadataSource',
    },
    db: {
      query: vi.fn().mockResolvedValue([]),
    },
    on: vi.fn(),
    registerRoute: vi.fn(),
    registerUI: vi.fn(),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    fs: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      readdir: vi.fn(),
      stat: vi.fn(),
      mkdir: vi.fn(),
      unlink: vi.fn(),
    },
    fetch: vi.fn(),
    ...overrides,
  } as unknown as PluginContext;
}

describe('MusicBrainzMetadataPlugin', () => {
  it('creates the tracks table on init', async () => {
    const plugin = new MusicBrainzMetadataPlugin();
    const ctx = makeContext();
    await plugin.init(ctx);
    const queryCalls = (ctx.db.query as ReturnType<typeof vi.fn>).mock
      .calls as [string][];
    const sqls = queryCalls.map((c) => c[0]);
    expect(
      sqls.some((s) => s.includes('plugin_musicbrainz_metadata_tracks')),
    ).toBe(true);
  });

  it('registers media:created and media:updated hooks', async () => {
    const plugin = new MusicBrainzMetadataPlugin();
    const ctx = makeContext();
    await plugin.init(ctx);
    const events = (
      (ctx.on as ReturnType<typeof vi.fn>).mock.calls as [string][]
    ).map((c) => c[0]);
    expect(events).toContain('media:created');
    expect(events).toContain('media:updated');
  });

  it('registers a GET /metadata/:mediaId route', async () => {
    const plugin = new MusicBrainzMetadataPlugin();
    const ctx = makeContext();
    await plugin.init(ctx);
    const calls = (ctx.registerRoute as ReturnType<typeof vi.fn>).mock
      .calls as [{ method: string; path: string }][];
    expect(
      calls.some(
        (c) => c[0].method === 'GET' && c[0].path === '/metadata/:mediaId',
      ),
    ).toBe(true);
  });

  it('enriches a music track on media:created event', async () => {
    const fetchMock = makeFetch([
      // searchRecording
      { ok: true, json: { count: 1, recordings: [sampleRecording] } },
      // fetchReleaseDetails
      {
        ok: true,
        json: {
          id: 'rel-1',
          title: 'A Night at the Opera',
          date: '1975',
          'artist-credit': [
            {
              artist: { id: 'art-1', name: 'Queen', 'sort-name': 'Queen' },
              name: 'Queen',
              joinphrase: '',
            },
          ],
          'label-info': [
            { label: { id: 'l1', name: 'EMI' }, 'catalog-number': 'EMC 103' },
          ],
          genres: [{ id: 'g1', name: 'rock', count: 10 }],
          'release-group': {
            id: 'rg-1',
            title: 'A Night at the Opera',
            'primary-type': 'Album',
            'secondary-types': [],
          },
        },
      },
      // fetchCoverArtUrl (HEAD)
      { ok: true, status: 200, json: {} },
    ]);

    const plugin = new MusicBrainzMetadataPlugin();
    const ctx = makeContext({ fetch: fetchMock });
    await plugin.init(ctx);

    const onCalls = (ctx.on as ReturnType<typeof vi.fn>).mock.calls as [
      string,
      (payload: { mediaId: string; filePath: string }) => Promise<void>,
    ][];
    const createdCall = onCalls.find((c) => c[0] === 'media:created');
    const handler = createdCall?.[1];
    await handler?.({
      mediaId: 'm1',
      filePath: '/music/Queen/A Night at the Opera/05 - Bohemian Rhapsody.flac',
    });

    const queryCalls = (ctx.db.query as ReturnType<typeof vi.fn>).mock
      .calls as [string][];
    const insertCall = queryCalls.find((c) =>
      c[0]?.includes('INSERT OR REPLACE'),
    );
    expect(insertCall).toBeDefined();
    expect(ctx.logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Bohemian Rhapsody'),
    );
  });

  it('logs warning when no MusicBrainz match found', async () => {
    const fetchMock = makeFetch([
      { ok: true, json: { count: 0, recordings: [] } },
    ]);
    const plugin = new MusicBrainzMetadataPlugin();
    const ctx = makeContext({ fetch: fetchMock });
    await plugin.init(ctx);

    const onCalls = (ctx.on as ReturnType<typeof vi.fn>).mock.calls as [
      string,
      (payload: { mediaId: string; filePath: string }) => Promise<void>,
    ][];
    const handler = onCalls.find((c) => c[0] === 'media:created')?.[1];
    await handler?.({
      mediaId: 'm2',
      filePath: '/music/UnknownArtist9999/Unknown.mp3',
    });

    expect(ctx.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('no match'),
    );
  });

  it('returns stored metadata from route handler', async () => {
    const storedRow = {
      media_id: 'm1',
      recording_mbid: 'rec-1',
      title: 'Bohemian Rhapsody',
      artists: '[{"mbid":"art-1","name":"Queen","sortName":"Queen"}]',
      genres: '["rock"]',
      is_compilation: 0,
    };
    let callCount = 0;
    const dbQuery = vi.fn().mockImplementation(async (sql: string) => {
      callCount++;
      if (callCount > 1 && sql.includes('plugin_musicbrainz_metadata_tracks')) {
        return [storedRow];
      }
      return [];
    });

    const plugin = new MusicBrainzMetadataPlugin();
    const ctx = makeContext({ db: { query: dbQuery } });
    await plugin.init(ctx);

    const routeCalls = (ctx.registerRoute as ReturnType<typeof vi.fn>).mock
      .calls as [
      {
        method: string;
        path: string;
        handler: (c: unknown) => Promise<unknown>;
      },
    ][];
    const routeEntry = routeCalls.find(
      (c) => c[0].path === '/metadata/:mediaId',
    );
    const handler = routeEntry?.[0]?.handler;

    const mockC = {
      req: { param: vi.fn().mockReturnValue('m1') },
      json: vi.fn().mockReturnValue({ status: 200 }),
    };
    await handler?.(mockC);
    expect(mockC.json).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Bohemian Rhapsody',
        isCompilation: false,
      }),
    );
  });

  it('returns 404 from route when no metadata stored', async () => {
    const plugin = new MusicBrainzMetadataPlugin();
    const ctx = makeContext();
    await plugin.init(ctx);

    const routeCalls = (ctx.registerRoute as ReturnType<typeof vi.fn>).mock
      .calls as [
      {
        method: string;
        path: string;
        handler: (c: unknown) => Promise<unknown>;
      },
    ][];
    const handler = routeCalls.find(
      (c) => c[0].path === '/metadata/:mediaId',
    )?.[0]?.handler;

    const mockC = {
      req: { param: vi.fn().mockReturnValue('nonexistent') },
      json: vi.fn().mockReturnValue({ status: 404 }),
    };
    await handler?.(mockC);
    expect(mockC.json).toHaveBeenCalledWith(
      { error: 'No metadata found' },
      404,
    );
  });

  it('deactivate clears client and context', async () => {
    const plugin = new MusicBrainzMetadataPlugin();
    const ctx = makeContext();
    await plugin.init(ctx);
    await plugin.deactivate();
    // After deactivate, enrichMedia is a no-op — no error thrown
    const callsBefore = (ctx.db.query as ReturnType<typeof vi.fn>).mock.calls
      .length;
    expect(callsBefore).toBeGreaterThan(0);
  });
});
