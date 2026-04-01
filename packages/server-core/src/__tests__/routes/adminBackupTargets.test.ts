import { copyFile, mkdir } from 'node:fs/promises';
import type { Client } from '@libsql/client';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import { openDatabase } from '../../db/db.js';
import { migrateDatabase } from '../../db/migrate.js';
import { backupTargets } from '../../db/schema.js';
import {
  copyFilesToDestination,
  runBackupToTarget,
} from '../../routes/adminBackupTargets.js';
import { signAccessToken } from '../../routes/auth.js';

vi.mock('node:fs/promises', () => ({
  copyFile: vi.fn(),
  mkdir: vi.fn(),
}));

const AUTH = `Bearer ${await signAccessToken('admin-id', 'admin', 'admin')}`;

describe('Backup Targets API', () => {
  let client: Client;
  let db: LibSQLDatabase;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    ({ client, db } = await openDatabase(':memory:'));
    await migrateDatabase(db);
    app = createApp(db);
    vi.clearAllMocks();
  });

  afterEach(() => {
    client.close();
  });

  // ---------------------------------------------------------------------------
  // List
  // ---------------------------------------------------------------------------

  it('GET /admin/backup/targets — returns empty list initially', async () => {
    const res = await app.request('/api/v1/admin/backup/targets', {
      headers: { Authorization: AUTH },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------------

  it('POST /admin/backup/targets — creates a local target', async () => {
    const res = await app.request('/api/v1/admin/backup/targets', {
      method: 'POST',
      headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Local Backup',
        type: 'local',
        config: { destPath: '/backups/media' },
        enabled: true,
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe('Local Backup');
    expect(body.type).toBe('local');
    expect(JSON.parse(body.config)).toEqual({ destPath: '/backups/media' });
    expect(body.enabled).toBe(true);
    expect(body.id).toBeTruthy();
  });

  it('POST /admin/backup/targets — creates a network target', async () => {
    const res = await app.request('/api/v1/admin/backup/targets', {
      method: 'POST',
      headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'NAS Backup',
        type: 'network',
        config: { mountPath: '/mnt/nas/backups' },
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.type).toBe('network');
    expect(JSON.parse(body.config)).toEqual({ mountPath: '/mnt/nas/backups' });
  });

  it('POST /admin/backup/targets — 400 on missing name', async () => {
    const res = await app.request('/api/v1/admin/backup/targets', {
      method: 'POST',
      headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'local', config: {} }),
    });
    expect(res.status).toBe(400);
  });

  // ---------------------------------------------------------------------------
  // Get single
  // ---------------------------------------------------------------------------

  it('GET /admin/backup/targets/:id — returns created target', async () => {
    const now = new Date();
    const id = crypto.randomUUID();
    await db.insert(backupTargets).values({
      id,
      name: 'Test',
      type: 'local',
      config: '{"destPath":"/tmp"}',
      enabled: true,
      createdAt: now,
    });

    const res = await app.request(`/api/v1/admin/backup/targets/${id}`, {
      headers: { Authorization: AUTH },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(id);
    expect(body.name).toBe('Test');
  });

  it('GET /admin/backup/targets/:id — 404 for unknown id', async () => {
    const res = await app.request('/api/v1/admin/backup/targets/nonexistent', {
      headers: { Authorization: AUTH },
    });
    expect(res.status).toBe(404);
  });

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  it('PUT /admin/backup/targets/:id — updates fields', async () => {
    const now = new Date();
    const id = crypto.randomUUID();
    await db.insert(backupTargets).values({
      id,
      name: 'Old Name',
      type: 'local',
      config: '{"destPath":"/old"}',
      enabled: true,
      createdAt: now,
    });

    const res = await app.request(`/api/v1/admin/backup/targets/${id}`, {
      method: 'PUT',
      headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Name', enabled: false }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('New Name');
    expect(body.enabled).toBe(false);
  });

  it('PUT /admin/backup/targets/:id — 404 for unknown id', async () => {
    const res = await app.request('/api/v1/admin/backup/targets/nonexistent', {
      method: 'PUT',
      headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated' }),
    });
    expect(res.status).toBe(404);
  });

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  it('DELETE /admin/backup/targets/:id — deletes existing target', async () => {
    const now = new Date();
    const id = crypto.randomUUID();
    await db.insert(backupTargets).values({
      id,
      name: 'To Delete',
      type: 'local',
      config: '{}',
      enabled: true,
      createdAt: now,
    });

    const res = await app.request(`/api/v1/admin/backup/targets/${id}`, {
      method: 'DELETE',
      headers: { Authorization: AUTH },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Confirm gone
    const check = await app.request(`/api/v1/admin/backup/targets/${id}`, {
      headers: { Authorization: AUTH },
    });
    expect(check.status).toBe(404);
  });

  it('DELETE /admin/backup/targets/:id — 404 for unknown id', async () => {
    const res = await app.request('/api/v1/admin/backup/targets/nonexistent', {
      method: 'DELETE',
      headers: { Authorization: AUTH },
    });
    expect(res.status).toBe(404);
  });

  // ---------------------------------------------------------------------------
  // Schedule
  // ---------------------------------------------------------------------------

  it('PUT /admin/backup/targets/:id/schedule — sets cron schedule', async () => {
    const id = crypto.randomUUID();
    await db.insert(backupTargets).values({
      id,
      name: 'Scheduled Target',
      type: 'local',
      config: '{"destPath":"/backups"}',
      enabled: true,
      createdAt: new Date(),
    });

    const res = await app.request(
      `/api/v1/admin/backup/targets/${id}/schedule`,
      {
        method: 'PUT',
        headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule: '0 2 * * *' }),
      },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.schedule).toBe('0 2 * * *');
    // nextScheduledAt should be set
    expect(body.nextScheduledAt).toBeTruthy();
  });

  it('PUT /admin/backup/targets/:id/schedule — sets retention count', async () => {
    const id = crypto.randomUUID();
    await db.insert(backupTargets).values({
      id,
      name: 'Retention Target',
      type: 'local',
      config: '{}',
      enabled: true,
      createdAt: new Date(),
    });

    const res = await app.request(
      `/api/v1/admin/backup/targets/${id}/schedule`,
      {
        method: 'PUT',
        headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({ retentionKeepCount: 5 }),
      },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.retentionKeepCount).toBe(5);
  });

  it('PUT /admin/backup/targets/:id/schedule — sets retention days', async () => {
    const id = crypto.randomUUID();
    await db.insert(backupTargets).values({
      id,
      name: 'Retention Days Target',
      type: 'local',
      config: '{}',
      enabled: true,
      createdAt: new Date(),
    });

    const res = await app.request(
      `/api/v1/admin/backup/targets/${id}/schedule`,
      {
        method: 'PUT',
        headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({ retentionKeepDays: 30 }),
      },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.retentionKeepDays).toBe(30);
  });

  it('PUT /admin/backup/targets/:id/schedule — 400 for invalid cron', async () => {
    const id = crypto.randomUUID();
    await db.insert(backupTargets).values({
      id,
      name: 'Bad Schedule Target',
      type: 'local',
      config: '{}',
      enabled: true,
      createdAt: new Date(),
    });

    const res = await app.request(
      `/api/v1/admin/backup/targets/${id}/schedule`,
      {
        method: 'PUT',
        headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule: 'not-a-cron' }),
      },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid cron expression/);
  });

  it('PUT /admin/backup/targets/:id/schedule — 404 for unknown target', async () => {
    const res = await app.request(
      '/api/v1/admin/backup/targets/nonexistent/schedule',
      {
        method: 'PUT',
        headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule: '0 * * * *' }),
      },
    );
    expect(res.status).toBe(404);
  });

  it('PUT /admin/backup/targets/:id/schedule — clears schedule when null', async () => {
    const id = crypto.randomUUID();
    await db.insert(backupTargets).values({
      id,
      name: 'Clear Schedule Target',
      type: 'local',
      config: '{}',
      enabled: true,
      schedule: '0 2 * * *',
      createdAt: new Date(),
    });

    const res = await app.request(
      `/api/v1/admin/backup/targets/${id}/schedule`,
      {
        method: 'PUT',
        headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule: null }),
      },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.schedule).toBeNull();
    expect(body.nextScheduledAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Backup copy logic unit tests
// ---------------------------------------------------------------------------

describe('copyFilesToDestination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(copyFile).mockResolvedValue(undefined);
  });

  it('copies files and counts them', async () => {
    const result = await copyFilesToDestination(
      ['/media/movies/a.mkv', '/media/movies/b.mkv'],
      '/media',
      '/backup',
    );
    expect(result.copied).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(copyFile).toHaveBeenCalledTimes(2);
    expect(copyFile).toHaveBeenCalledWith(
      '/media/movies/a.mkv',
      '/backup/movies/a.mkv',
    );
    expect(copyFile).toHaveBeenCalledWith(
      '/media/movies/b.mkv',
      '/backup/movies/b.mkv',
    );
  });

  it('records errors without throwing', async () => {
    vi.mocked(copyFile).mockRejectedValueOnce(new Error('Permission denied'));
    const result = await copyFilesToDestination(
      ['/media/file.mkv'],
      '/media',
      '/backup',
    );
    expect(result.copied).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Permission denied');
  });
});

describe('runBackupToTarget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(copyFile).mockResolvedValue(undefined);
  });

  it('handles local target', async () => {
    const result = await runBackupToTarget(
      { type: 'local', config: '{"destPath":"/backups"}' },
      ['/media/file.mkv'],
      '/media',
    );
    expect(result.copied).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(copyFile).toHaveBeenCalledWith(
      '/media/file.mkv',
      '/backups/file.mkv',
    );
  });

  it('handles network target', async () => {
    const result = await runBackupToTarget(
      { type: 'network', config: '{"mountPath":"/mnt/nas"}' },
      ['/media/file.mkv'],
      '/media',
    );
    expect(result.copied).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(copyFile).toHaveBeenCalledWith(
      '/media/file.mkv',
      '/mnt/nas/file.mkv',
    );
  });

  it('returns error for invalid JSON config', async () => {
    const result = await runBackupToTarget(
      { type: 'local', config: 'not-json' },
      ['/media/file.mkv'],
      '/media',
    );
    expect(result.copied).toBe(0);
    expect(result.errors[0]).toContain('Invalid target config JSON');
  });

  it('returns error for local target missing destPath', async () => {
    const result = await runBackupToTarget(
      { type: 'local', config: '{}' },
      ['/media/file.mkv'],
      '/media',
    );
    expect(result.copied).toBe(0);
    expect(result.errors[0]).toContain('Invalid local config');
  });

  it('returns error for unknown target type', async () => {
    const result = await runBackupToTarget(
      { type: 'ftp', config: '{}' },
      ['/media/file.mkv'],
      '/media',
    );
    expect(result.copied).toBe(0);
    expect(result.errors[0]).toContain('Unknown target type');
  });
});
