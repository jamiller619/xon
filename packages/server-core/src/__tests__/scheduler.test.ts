import { watch } from 'node:fs';
import type { Client } from '@libsql/client';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase } from '../db.js';
import { migrateDatabase } from '../migrate.js';
import { parseCronInterval, startScheduler } from '../scheduler.js';
import { dataSources, libraries } from '../schema.js';

vi.mock('node:fs', () => ({
  watch: vi.fn(),
}));

const mockWatch = vi.mocked(watch);

describe('parseCronInterval', () => {
  it('parses every-N-minutes pattern', () => {
    expect(parseCronInterval('*/30 * * * *')).toBe(30 * 60 * 1000);
    expect(parseCronInterval('*/1 * * * *')).toBe(60 * 1000);
    expect(parseCronInterval('*/59 * * * *')).toBe(59 * 60 * 1000);
  });

  it('parses every-N-hours pattern', () => {
    expect(parseCronInterval('0 */6 * * *')).toBe(6 * 60 * 60 * 1000);
    expect(parseCronInterval('0 */1 * * *')).toBe(60 * 60 * 1000);
    expect(parseCronInterval('0 */23 * * *')).toBe(23 * 60 * 60 * 1000);
  });

  it('returns null for unsupported or invalid expressions', () => {
    expect(parseCronInterval('* * * * *')).toBeNull();
    expect(parseCronInterval('0 0 * * *')).toBeNull();
    expect(parseCronInterval('*/0 * * * *')).toBeNull();
    expect(parseCronInterval('*/60 * * * *')).toBeNull();
    expect(parseCronInterval('0 */24 * * *')).toBeNull();
    expect(parseCronInterval('not a cron')).toBeNull();
    expect(parseCronInterval('0 */6 1 * *')).toBeNull();
  });
});

describe('startScheduler', () => {
  let client: Client;
  let db: LibSQLDatabase;

  beforeEach(async () => {
    vi.useFakeTimers();
    mockWatch.mockReset();
    // Default mock: return a watcher with a close() no-op
    mockWatch.mockReturnValue({ close: vi.fn() } as unknown as ReturnType<
      typeof watch
    >);
    ({ client, db } = await openDatabase(':memory:'));
    await migrateDatabase(db);
  });

  afterEach(() => {
    vi.useRealTimers();
    client.close();
  });

  it('calls trigger at the scheduled interval for a library with scanSchedule', async () => {
    const trigger = vi.fn().mockResolvedValue(undefined);
    await db.insert(libraries).values({
      id: 'lib-1',
      name: 'Scheduled Lib',
      scanSchedule: '0 */6 * * *',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const handle = await startScheduler(db, trigger);

    expect(trigger).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);
    expect(trigger).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveBeenCalledWith(db, 'lib-1');

    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);
    expect(trigger).toHaveBeenCalledTimes(2);

    handle.stop();
  });

  it('does not set up interval timer for library without scanSchedule', async () => {
    const trigger = vi.fn().mockResolvedValue(undefined);
    await db.insert(libraries).values({
      id: 'lib-2',
      name: 'No Schedule Lib',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const handle = await startScheduler(db, trigger);
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(trigger).not.toHaveBeenCalled();

    handle.stop();
  });

  it('sets up fs.watch for local enabled data sources', async () => {
    await db.insert(libraries).values({
      id: 'lib-3',
      name: 'Watch Lib',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await db.insert(dataSources).values({
      id: 'src-1',
      libraryId: 'lib-3',
      type: 'local',
      path: '/media/movies',
      recursive: true,
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const trigger = vi.fn().mockResolvedValue(undefined);
    const handle = await startScheduler(db, trigger);

    expect(mockWatch).toHaveBeenCalledWith(
      '/media/movies',
      { recursive: true },
      expect.any(Function),
    );

    handle.stop();
  });

  it('does not watch disabled data sources', async () => {
    await db.insert(libraries).values({
      id: 'lib-4',
      name: 'Lib',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await db.insert(dataSources).values({
      id: 'src-2',
      libraryId: 'lib-4',
      type: 'local',
      path: '/media/music',
      recursive: false,
      enabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const trigger = vi.fn().mockResolvedValue(undefined);
    const handle = await startScheduler(db, trigger);

    expect(mockWatch).not.toHaveBeenCalled();
    handle.stop();
  });

  it('does not watch network data sources', async () => {
    await db.insert(libraries).values({
      id: 'lib-5',
      name: 'Lib',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await db.insert(dataSources).values({
      id: 'src-3',
      libraryId: 'lib-5',
      type: 'network',
      path: '//server/share',
      recursive: false,
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const trigger = vi.fn().mockResolvedValue(undefined);
    const handle = await startScheduler(db, trigger);

    expect(mockWatch).not.toHaveBeenCalled();
    handle.stop();
  });

  it('debounces fs.watch events — triggers scan 2s after last change', async () => {
    await db.insert(libraries).values({
      id: 'lib-6',
      name: 'Debounce Lib',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await db.insert(dataSources).values({
      id: 'src-4',
      libraryId: 'lib-6',
      type: 'local',
      path: '/media/videos',
      recursive: false,
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const trigger = vi.fn().mockResolvedValue(undefined);
    let capturedCallback: (() => void) | undefined;
    mockWatch.mockImplementation((_path, _opts, cb) => {
      capturedCallback = cb as () => void;
      return { close: vi.fn() } as unknown as ReturnType<typeof watch>;
    });

    const handle = await startScheduler(db, trigger);
    expect(capturedCallback).toBeDefined();

    // Simulate rapid file changes
    capturedCallback?.();
    capturedCallback?.();
    capturedCallback?.();

    // Scan should not fire until 2s after last change
    await vi.advanceTimersByTimeAsync(1000);
    expect(trigger).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1500);
    expect(trigger).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveBeenCalledWith(db, 'lib-6');

    handle.stop();
  });

  it('stop() clears interval timers and watchers', async () => {
    const closeFn = vi.fn();
    mockWatch.mockReturnValue({ close: closeFn } as unknown as ReturnType<
      typeof watch
    >);

    await db.insert(libraries).values({
      id: 'lib-7',
      name: 'Stop Test Lib',
      scanSchedule: '*/30 * * * *',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await db.insert(dataSources).values({
      id: 'src-5',
      libraryId: 'lib-7',
      type: 'local',
      path: '/media/photos',
      recursive: false,
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const trigger = vi.fn().mockResolvedValue(undefined);
    const handle = await startScheduler(db, trigger);

    handle.stop();

    // After stop, advancing time should not trigger any scans
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(trigger).not.toHaveBeenCalled();
    expect(closeFn).toHaveBeenCalled();
  });
});
