import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { MediaCategory } from '@xon/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(),
  unlink: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('sharp', () => {
  const mockToFile = vi.fn().mockResolvedValue(undefined);
  const mockJpeg = vi.fn().mockReturnThis();
  const mockResize = vi.fn().mockReturnThis();
  const mockClone = vi.fn().mockReturnValue({
    resize: mockResize,
    jpeg: mockJpeg,
    toFile: mockToFile,
  });
  const mockSharp = vi.fn().mockReturnValue({ clone: mockClone });
  return { default: mockSharp };
});

const { mkdir, unlink } = await import('node:fs/promises');
const { spawn } = await import('node:child_process');
const sharp = (await import('sharp')).default;
const { generateVideoThumbnails, isVideoCategory } = await import(
  '../videoThumbnails.js'
);

type FakeProc = EventEmitter & { stdout: EventEmitter };

function makeProc(): FakeProc {
  const proc = new EventEmitter() as FakeProc;
  proc.stdout = new EventEmitter();
  return proc;
}

/**
 * Creates a spawn mock that returns procs on demand (one per call).
 * Each proc's events fire in a microtask AFTER listeners are attached.
 */
type ProcSpec =
  | { type: 'ffprobe'; duration: number | null; exitCode?: number }
  | { type: 'ffmpeg'; exitCode?: number }
  | { type: 'ffprobe-error'; err: Error }
  | { type: 'ffmpeg-error'; err: Error };

function setupSpawnMock(specs: ProcSpec[]): void {
  let callIndex = 0;
  vi.mocked(spawn).mockImplementation((_cmd: string) => {
    const spec = specs[callIndex++];
    const proc = makeProc();
    if (spec?.type === 'ffprobe') {
      const output =
        spec.duration !== null
          ? JSON.stringify({ format: { duration: String(spec.duration) } })
          : JSON.stringify({ format: {} });
      Promise.resolve().then(() => {
        proc.stdout.emit('data', Buffer.from(output));
        proc.emit('close', spec.exitCode ?? 0);
      });
    } else if (spec?.type === 'ffprobe-error') {
      Promise.resolve().then(() => {
        proc.emit('error', spec.err);
      });
    } else if (spec?.type === 'ffmpeg') {
      Promise.resolve().then(() => {
        proc.emit('close', spec.exitCode ?? 0);
      });
    } else if (spec?.type === 'ffmpeg-error') {
      Promise.resolve().then(() => {
        proc.emit('error', spec.err);
      });
    }
    return proc as unknown as ChildProcess;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(mkdir).mockResolvedValue(undefined);
  vi.mocked(unlink).mockResolvedValue(undefined);
});

describe('isVideoCategory', () => {
  it('returns true for video categories', () => {
    expect(isVideoCategory(MediaCategory.Movies)).toBe(true);
    expect(isVideoCategory(MediaCategory.TVShows)).toBe(true);
    expect(isVideoCategory(MediaCategory.Clips)).toBe(true);
    expect(isVideoCategory(MediaCategory.HomeVideos)).toBe(true);
  });

  it('returns false for non-video categories', () => {
    expect(isVideoCategory(MediaCategory.Music)).toBe(false);
    expect(isVideoCategory(MediaCategory.Pictures)).toBe(false);
    expect(isVideoCategory(MediaCategory.Documents)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isVideoCategory(null)).toBe(false);
  });
});

describe('generateVideoThumbnails', () => {
  it('creates thumbnails directory and returns paths', async () => {
    setupSpawnMock([
      { type: 'ffprobe', duration: 100 },
      { type: 'ffmpeg', exitCode: 0 },
    ]);

    const result = await generateVideoThumbnails(
      '/media/movie.mp4',
      'item-123',
      '/data',
    );

    expect(mkdir).toHaveBeenCalledWith(join('/data', 'thumbnails'), {
      recursive: true,
    });
    expect(result).toEqual({
      small: join('/data', 'thumbnails', 'item-123_small.jpg'),
      medium: join('/data', 'thumbnails', 'item-123_medium.jpg'),
      large: join('/data', 'thumbnails', 'item-123_large.jpg'),
    });
  });

  it('extracts frame at 10% of video duration', async () => {
    setupSpawnMock([
      { type: 'ffprobe', duration: 200 },
      { type: 'ffmpeg', exitCode: 0 },
    ]);

    await generateVideoThumbnails('/media/movie.mp4', 'item-abc', '/data');

    const ffmpegCall = vi.mocked(spawn).mock.calls[1];
    expect(ffmpegCall?.[0]).toBe('ffmpeg');
    // timestamp = 200 * 0.1 = 20
    expect(ffmpegCall?.[1]).toContain('20');
  });

  it('uses timestamp 0 when duration cannot be determined', async () => {
    setupSpawnMock([
      { type: 'ffprobe-error', err: new Error('ffprobe not found') },
      { type: 'ffmpeg', exitCode: 0 },
    ]);

    const result = await generateVideoThumbnails(
      '/media/movie.mp4',
      'item-nodur',
      '/data',
    );

    const ffmpegCall = vi.mocked(spawn).mock.calls[1];
    expect(ffmpegCall?.[1]).toContain('0');
    expect(result).not.toBeNull();
  });

  it('returns null when mkdir fails', async () => {
    vi.mocked(mkdir).mockRejectedValueOnce(new Error('Permission denied'));

    const result = await generateVideoThumbnails(
      '/media/movie.mp4',
      'item-123',
      '/data',
    );

    expect(result).toBeNull();
    expect(spawn).not.toHaveBeenCalled();
  });

  it('returns null when ffmpeg frame extraction fails', async () => {
    setupSpawnMock([
      { type: 'ffprobe', duration: 60 },
      { type: 'ffmpeg', exitCode: 1 },
    ]);

    const result = await generateVideoThumbnails(
      '/media/movie.mp4',
      'item-fail',
      '/data',
    );

    expect(result).toBeNull();
    expect(sharp).not.toHaveBeenCalled();
  });

  it('returns null when ffmpeg process errors', async () => {
    setupSpawnMock([
      { type: 'ffprobe', duration: 60 },
      { type: 'ffmpeg-error', err: new Error('ffmpeg not found') },
    ]);

    const result = await generateVideoThumbnails(
      '/media/movie.mp4',
      'item-err',
      '/data',
    );

    expect(result).toBeNull();
  });

  it('returns null when sharp resize fails', async () => {
    const failingClone = {
      resize: vi.fn().mockReturnThis(),
      jpeg: vi.fn().mockReturnThis(),
      toFile: vi.fn().mockRejectedValue(new Error('sharp error')),
    };
    vi.mocked(sharp).mockReturnValueOnce({
      clone: vi.fn().mockReturnValue(failingClone),
    } as never);

    setupSpawnMock([
      { type: 'ffprobe', duration: 60 },
      { type: 'ffmpeg', exitCode: 0 },
    ]);

    const result = await generateVideoThumbnails(
      '/media/movie.mp4',
      'item-sharpfail',
      '/data',
    );

    expect(result).toBeNull();
    expect(unlink).toHaveBeenCalled();
  });

  it('cleans up temp file on success', async () => {
    setupSpawnMock([
      { type: 'ffprobe', duration: 120 },
      { type: 'ffmpeg', exitCode: 0 },
    ]);

    await generateVideoThumbnails('/media/movie.mp4', 'item-cleanup', '/data');

    const tmpPath = join('/data', 'thumbnails', 'item-cleanup_tmp.jpg');
    expect(unlink).toHaveBeenCalledWith(tmpPath);
  });

  it('uses mediaItemId in thumbnail filenames', async () => {
    setupSpawnMock([
      { type: 'ffprobe', duration: 50 },
      { type: 'ffmpeg', exitCode: 0 },
    ]);

    const result = await generateVideoThumbnails(
      '/media/video.mkv',
      'my-unique-id',
      '/mydata',
    );

    expect(result?.small).toContain('my-unique-id_small.jpg');
    expect(result?.medium).toContain('my-unique-id_medium.jpg');
    expect(result?.large).toContain('my-unique-id_large.jpg');
  });

  it('calls sharp with extracted frame temp file', async () => {
    setupSpawnMock([
      { type: 'ffprobe', duration: 100 },
      { type: 'ffmpeg', exitCode: 0 },
    ]);

    await generateVideoThumbnails('/media/movie.mp4', 'item-sharp', '/data');

    const tmpPath = join('/data', 'thumbnails', 'item-sharp_tmp.jpg');
    expect(sharp).toHaveBeenCalledWith(tmpPath);
  });
});
