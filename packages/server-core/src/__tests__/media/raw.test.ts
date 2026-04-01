import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('sharp', () => ({
  default: vi.fn(),
}));

import { spawn } from 'node:child_process';
import sharpFn from 'sharp';
import { RAW_EXTENSIONS, convertRawToJpeg, isRawImage } from '../../media/raw.js';

type FakeChildProcess = EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
};

function makeProcess(): FakeChildProcess {
  const proc = new EventEmitter() as FakeChildProcess;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  return proc;
}

const mockSpawn = vi.mocked(spawn);
const mockSharp = vi.mocked(sharpFn);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RAW_EXTENSIONS', () => {
  it('contains required RAW formats', () => {
    for (const ext of [
      '.cr2',
      '.cr3',
      '.nef',
      '.arw',
      '.dng',
      '.orf',
      '.raf',
    ]) {
      expect(RAW_EXTENSIONS.has(ext)).toBe(true);
    }
  });
});

describe('isRawImage', () => {
  it('returns true for RAW extensions (case-insensitive)', () => {
    expect(isRawImage('/photos/shot.cr2')).toBe(true);
    expect(isRawImage('/photos/shot.NEF')).toBe(true);
    expect(isRawImage('/photos/shot.ARW')).toBe(true);
    expect(isRawImage('/photos/shot.dng')).toBe(true);
    expect(isRawImage('/photos/shot.orf')).toBe(true);
    expect(isRawImage('/photos/shot.raf')).toBe(true);
    expect(isRawImage('/photos/shot.cr3')).toBe(true);
  });

  it('returns false for non-RAW extensions', () => {
    expect(isRawImage('/photos/shot.jpg')).toBe(false);
    expect(isRawImage('/photos/shot.png')).toBe(false);
    expect(isRawImage('/photos/shot.tiff')).toBe(false);
    expect(isRawImage('/videos/clip.mp4')).toBe(false);
  });
});

describe('convertRawToJpeg', () => {
  it('returns embedded JPEG preview from dcraw -c -e (fast path)', async () => {
    const jpegData = Buffer.from('fake-jpeg-data');
    const proc = makeProcess();

    // mockImplementation returns proc synchronously; events fire as microtask
    // after synchronous listener registration in runDcraw
    mockSpawn.mockImplementation(() => {
      Promise.resolve().then(() => {
        proc.stdout.emit('data', jpegData);
        proc.emit('close', 0);
      });
      return proc as unknown as ChildProcess;
    });

    const result = await convertRawToJpeg('/photos/shot.cr2');
    expect(result).toEqual(jpegData);
    expect(mockSpawn).toHaveBeenCalledWith('dcraw', [
      '-c',
      '-e',
      '/photos/shot.cr2',
    ]);
  });

  it('falls back to full decode when embedded preview fails, then converts TIFF via sharp', async () => {
    const tiffData = Buffer.from('fake-tiff-data');
    const jpegData = Buffer.from('fake-jpeg-from-sharp');
    const proc1 = makeProcess();
    const proc2 = makeProcess();

    let callCount = 0;
    mockSpawn.mockImplementation(() => {
      callCount++;
      const current = callCount;
      if (current === 1) {
        // First call: embedded preview not available
        Promise.resolve().then(() => proc1.emit('close', 1));
        return proc1 as unknown as ChildProcess;
      }
      // Second call: full TIFF decode succeeds
      Promise.resolve().then(() => {
        proc2.stdout.emit('data', tiffData);
        proc2.emit('close', 0);
      });
      return proc2 as unknown as ChildProcess;
    });

    const toBufferMock = vi.fn().mockResolvedValue(jpegData);
    const jpegMock = vi.fn().mockReturnValue({ toBuffer: toBufferMock });
    mockSharp.mockReturnValue({ jpeg: jpegMock } as unknown as ReturnType<
      typeof sharpFn
    >);

    const result = await convertRawToJpeg('/photos/shot.nef');
    expect(result).toEqual(jpegData);
    expect(mockSpawn).toHaveBeenCalledTimes(2);
    expect(mockSpawn).toHaveBeenNthCalledWith(1, 'dcraw', [
      '-c',
      '-e',
      '/photos/shot.nef',
    ]);
    expect(mockSpawn).toHaveBeenNthCalledWith(2, 'dcraw', [
      '-c',
      '-w',
      '-T',
      '/photos/shot.nef',
    ]);
    expect(mockSharp).toHaveBeenCalledWith(tiffData);
  });

  it('throws with clear message when dcraw is not installed (ENOENT)', async () => {
    const proc = makeProcess();

    mockSpawn.mockImplementation(() => {
      Promise.resolve().then(() => {
        const err = Object.assign(new Error('spawn dcraw ENOENT'), {
          code: 'ENOENT',
        });
        proc.emit('error', err);
      });
      return proc as unknown as ChildProcess;
    });

    await expect(convertRawToJpeg('/photos/shot.arw')).rejects.toThrow(
      'dcraw not found',
    );
    // Must not attempt fallback
    expect(mockSpawn).toHaveBeenCalledTimes(1);
  });

  it('throws when dcraw fails on full decode after embedded preview fails', async () => {
    const proc1 = makeProcess();
    const proc2 = makeProcess();

    let callCount = 0;
    mockSpawn.mockImplementation(() => {
      callCount++;
      const current = callCount;
      const proc = current === 1 ? proc1 : proc2;
      Promise.resolve().then(() => {
        if (current === 2)
          proc.stderr.emit('data', Buffer.from('decode error'));
        proc.emit('close', current === 1 ? 1 : 2);
      });
      return proc as unknown as ChildProcess;
    });

    await expect(convertRawToJpeg('/photos/shot.orf')).rejects.toThrow(
      'dcraw failed',
    );
  });
});
