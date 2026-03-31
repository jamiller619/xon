import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

import { spawn } from 'node:child_process';
import { MediaCategory } from '@xon/shared';
import {
  type FfprobeMetadata,
  extractFfprobeMetadata,
  isAudioVideoCategory,
} from './ffprobe.js';

type FakeChildProcess = EventEmitter & { stdout: EventEmitter };

function makeProcess(): FakeChildProcess {
  const proc = new EventEmitter() as FakeChildProcess;
  proc.stdout = new EventEmitter();
  return proc;
}

const mockSpawn = vi.mocked(spawn);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('isAudioVideoCategory', () => {
  it('returns true for video categories', () => {
    expect(isAudioVideoCategory(MediaCategory.Movies)).toBe(true);
    expect(isAudioVideoCategory(MediaCategory.TVShows)).toBe(true);
    expect(isAudioVideoCategory(MediaCategory.Clips)).toBe(true);
    expect(isAudioVideoCategory(MediaCategory.HomeVideos)).toBe(true);
  });

  it('returns true for audio categories', () => {
    expect(isAudioVideoCategory(MediaCategory.Music)).toBe(true);
    expect(isAudioVideoCategory(MediaCategory.Audiobooks)).toBe(true);
    expect(isAudioVideoCategory(MediaCategory.AudioClips)).toBe(true);
    expect(isAudioVideoCategory(MediaCategory.Podcasts)).toBe(true);
  });

  it('returns false for non-audio/video categories', () => {
    expect(isAudioVideoCategory(MediaCategory.Pictures)).toBe(false);
    expect(isAudioVideoCategory(MediaCategory.Documents)).toBe(false);
    expect(isAudioVideoCategory(MediaCategory.Games)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isAudioVideoCategory(null)).toBe(false);
  });
});

describe('extractFfprobeMetadata', () => {
  it('extracts video metadata from ffprobe output', async () => {
    const proc = makeProcess();
    mockSpawn.mockReturnValue(proc as ReturnType<typeof spawn>);

    const ffprobeOutput = JSON.stringify({
      format: { duration: '120.5', bit_rate: '2000000' },
      streams: [
        {
          codec_type: 'video',
          codec_name: 'h264',
          width: 1920,
          height: 1080,
        },
        {
          codec_type: 'audio',
          codec_name: 'aac',
          sample_rate: '48000',
          channels: 2,
        },
      ],
    });

    const promise = extractFfprobeMetadata('/media/movie.mp4');

    proc.stdout.emit('data', Buffer.from(ffprobeOutput));
    proc.emit('close', 0);

    const result = await promise;

    expect(result).toEqual<FfprobeMetadata>({
      duration: 120.5,
      bitrate: 2000000,
      codec: 'h264',
      resolution: { width: 1920, height: 1080 },
      audioCodec: 'aac',
      sampleRate: 48000,
      channels: 2,
    });
  });

  it('extracts audio-only metadata from ffprobe output', async () => {
    const proc = makeProcess();
    mockSpawn.mockReturnValue(proc as ReturnType<typeof spawn>);

    const ffprobeOutput = JSON.stringify({
      format: { duration: '240.0', bit_rate: '320000' },
      streams: [
        {
          codec_type: 'audio',
          codec_name: 'mp3',
          sample_rate: '44100',
          channels: 2,
        },
      ],
    });

    const promise = extractFfprobeMetadata('/music/song.mp3');

    proc.stdout.emit('data', Buffer.from(ffprobeOutput));
    proc.emit('close', 0);

    const result = await promise;

    expect(result).toEqual<FfprobeMetadata>({
      duration: 240.0,
      bitrate: 320000,
      audioCodec: 'mp3',
      sampleRate: 44100,
      channels: 2,
    });
    expect(result?.codec).toBeUndefined();
    expect(result?.resolution).toBeUndefined();
  });

  it('returns null when ffprobe is not installed (ENOENT)', async () => {
    const proc = makeProcess();
    mockSpawn.mockReturnValue(proc as ReturnType<typeof spawn>);

    const promise = extractFfprobeMetadata('/media/file.mp4');

    const err = Object.assign(new Error('spawn ffprobe ENOENT'), {
      code: 'ENOENT',
    });
    proc.emit('error', err);

    const result = await promise;

    expect(result).toBeNull();
  });

  it('returns null when ffprobe exits with non-zero code', async () => {
    const proc = makeProcess();
    mockSpawn.mockReturnValue(proc as ReturnType<typeof spawn>);

    const promise = extractFfprobeMetadata('/media/corrupt.mp4');

    proc.emit('close', 1);

    const result = await promise;

    expect(result).toBeNull();
  });

  it('returns null when ffprobe outputs invalid JSON', async () => {
    const proc = makeProcess();
    mockSpawn.mockReturnValue(proc as ReturnType<typeof spawn>);

    const promise = extractFfprobeMetadata('/media/file.mp4');

    proc.stdout.emit('data', Buffer.from('not valid json {{{'));
    proc.emit('close', 0);

    const result = await promise;

    expect(result).toBeNull();
  });

  it('handles chunked stdout data', async () => {
    const proc = makeProcess();
    mockSpawn.mockReturnValue(proc as ReturnType<typeof spawn>);

    const ffprobeOutput = JSON.stringify({
      format: { duration: '60.0', bit_rate: '128000' },
      streams: [
        {
          codec_type: 'audio',
          codec_name: 'flac',
          sample_rate: '44100',
          channels: 1,
        },
      ],
    });

    const promise = extractFfprobeMetadata('/music/track.flac');

    // Emit data in two chunks
    const half = Math.floor(ffprobeOutput.length / 2);
    proc.stdout.emit('data', Buffer.from(ffprobeOutput.slice(0, half)));
    proc.stdout.emit('data', Buffer.from(ffprobeOutput.slice(half)));
    proc.emit('close', 0);

    const result = await promise;

    expect(result?.duration).toBe(60.0);
    expect(result?.audioCodec).toBe('flac');
    expect(result?.channels).toBe(1);
  });

  it('returns empty metadata object for file with no recognizable streams', async () => {
    const proc = makeProcess();
    mockSpawn.mockReturnValue(proc as ReturnType<typeof spawn>);

    const ffprobeOutput = JSON.stringify({
      format: {},
      streams: [],
    });

    const promise = extractFfprobeMetadata('/media/file.mp4');

    proc.stdout.emit('data', Buffer.from(ffprobeOutput));
    proc.emit('close', 0);

    const result = await promise;

    expect(result).toEqual({});
  });
});
