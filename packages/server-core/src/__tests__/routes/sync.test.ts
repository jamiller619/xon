import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import type { Client } from '@libsql/client';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import { openDatabase } from '../../db/db.js';
import { migrateDatabase } from '../../db/migrate.js';
import { syncProfiles, syncRuns } from '../../db/schema.js';
import { signAccessToken } from '../../routes/auth.js';

vi.mock('node:fs/promises', () => ({
  copyFile: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));

const AUTH = `Bearer ${await signAccessToken('user-id', 'admin', 'admin')}`;

describe('Sync Profiles API', () => {
  let client: Client;
  let db: LibSQLDatabase;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    ({ client, db } = await openDatabase(':memory:'));
    await migrateDatabase(db);
    app = createApp(db);
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(writeFile).mockResolvedValue(undefined);
    vi.mocked(copyFile).mockResolvedValue(undefined);
  });

  afterEach(() => {
    client.close();
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // List
  // ---------------------------------------------------------------------------

  it('GET /sync/profiles — returns empty list initially', async () => {
    const res = await app.request('/api/v1/sync/profiles', {
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

  it('POST /sync/profiles — creates a full sync profile', async () => {
    const res = await app.request('/api/v1/sync/profiles', {
      method: 'POST',
      headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Full Sync',
        type: 'full',
        targetPath: '/sync/dest',
        includeMedia: false,
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe('Full Sync');
    expect(body.type).toBe('full');
    expect(body.targetPath).toBe('/sync/dest');
    expect(body.includeMedia).toBe(false);
    expect(body.id).toBeTruthy();
  });

  it('POST /sync/profiles — creates a partial sync profile', async () => {
    const res = await app.request('/api/v1/sync/profiles', {
      method: 'POST',
      headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Partial Sync',
        type: 'partial',
        scope: { libraryIds: ['lib-1'], mediaTypes: ['Movies'] },
        targetPath: '/sync/partial',
        includeMedia: true,
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe('Partial Sync');
    expect(body.type).toBe('partial');
    expect(JSON.parse(body.scope)).toEqual({
      libraryIds: ['lib-1'],
      mediaTypes: ['Movies'],
    });
    expect(body.includeMedia).toBe(true);
  });

  it('POST /sync/profiles — 400 on missing required fields', async () => {
    const res = await app.request('/api/v1/sync/profiles', {
      method: 'POST',
      headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '' }),
    });
    expect(res.status).toBe(400);
  });

  // ---------------------------------------------------------------------------
  // Get single
  // ---------------------------------------------------------------------------

  it('GET /sync/profiles/:id — returns profile', async () => {
    const createRes = await app.request('/api/v1/sync/profiles', {
      method: 'POST',
      headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test', targetPath: '/sync/test' }),
    });
    const created = await createRes.json();

    const res = await app.request(`/api/v1/sync/profiles/${created.id}`, {
      headers: { Authorization: AUTH },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(created.id);
    expect(body.name).toBe('Test');
  });

  it('GET /sync/profiles/:id — 404 for unknown id', async () => {
    const res = await app.request('/api/v1/sync/profiles/nonexistent', {
      headers: { Authorization: AUTH },
    });
    expect(res.status).toBe(404);
  });

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  it('PUT /sync/profiles/:id — updates fields', async () => {
    const createRes = await app.request('/api/v1/sync/profiles', {
      method: 'POST',
      headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Old Name', targetPath: '/sync/old' }),
    });
    const created = await createRes.json();

    const res = await app.request(`/api/v1/sync/profiles/${created.id}`, {
      method: 'PUT',
      headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'New Name',
        targetPath: '/sync/new',
        includeMedia: true,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('New Name');
    expect(body.targetPath).toBe('/sync/new');
    expect(body.includeMedia).toBe(true);
  });

  it('PUT /sync/profiles/:id — 404 for unknown id', async () => {
    const res = await app.request('/api/v1/sync/profiles/nonexistent', {
      method: 'PUT',
      headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'X' }),
    });
    expect(res.status).toBe(404);
  });

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  it('DELETE /sync/profiles/:id — removes profile', async () => {
    const createRes = await app.request('/api/v1/sync/profiles', {
      method: 'POST',
      headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'ToDelete', targetPath: '/sync/del' }),
    });
    const created = await createRes.json();

    const delRes = await app.request(`/api/v1/sync/profiles/${created.id}`, {
      method: 'DELETE',
      headers: { Authorization: AUTH },
    });
    expect(delRes.status).toBe(204);

    const getRes = await app.request(`/api/v1/sync/profiles/${created.id}`, {
      headers: { Authorization: AUTH },
    });
    expect(getRes.status).toBe(404);
  });

  it('DELETE /sync/profiles/:id — 404 for unknown id', async () => {
    const res = await app.request('/api/v1/sync/profiles/nonexistent', {
      method: 'DELETE',
      headers: { Authorization: AUTH },
    });
    expect(res.status).toBe(404);
  });

  // ---------------------------------------------------------------------------
  // Run
  // ---------------------------------------------------------------------------

  it('POST /sync/profiles/:id/run — creates a sync run', async () => {
    const createRes = await app.request('/api/v1/sync/profiles', {
      method: 'POST',
      headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Runnable', targetPath: '/sync/run' }),
    });
    const profile = await createRes.json();

    const res = await app.request(`/api/v1/sync/profiles/${profile.id}/run`, {
      method: 'POST',
      headers: { Authorization: AUTH },
    });
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.runId).toBeTruthy();
    expect(body.status).toBe('running');
  });

  it('POST /sync/profiles/:id/run — 404 for unknown profile', async () => {
    const res = await app.request('/api/v1/sync/profiles/nonexistent/run', {
      method: 'POST',
      headers: { Authorization: AUTH },
    });
    expect(res.status).toBe(404);
  });

  it('POST /sync/profiles/:id/run — writes metadata.json to targetPath', async () => {
    const createRes = await app.request('/api/v1/sync/profiles', {
      method: 'POST',
      headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Meta Sync', targetPath: '/sync/meta' }),
    });
    const profile = await createRes.json();

    await app.request(`/api/v1/sync/profiles/${profile.id}/run`, {
      method: 'POST',
      headers: { Authorization: AUTH },
    });

    // Allow async job to complete
    await new Promise((r) => setTimeout(r, 100));

    expect(vi.mocked(mkdir)).toHaveBeenCalledWith('/sync/meta', {
      recursive: true,
    });
    expect(vi.mocked(writeFile)).toHaveBeenCalledWith(
      expect.stringContaining('metadata.json'),
      expect.any(String),
      'utf-8',
    );
  });

  // ---------------------------------------------------------------------------
  // List runs
  // ---------------------------------------------------------------------------

  it('GET /sync/profiles/:id/runs — lists runs for profile', async () => {
    const createRes = await app.request('/api/v1/sync/profiles', {
      method: 'POST',
      headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Runnable2', targetPath: '/sync/r2' }),
    });
    const profile = await createRes.json();

    await app.request(`/api/v1/sync/profiles/${profile.id}/run`, {
      method: 'POST',
      headers: { Authorization: AUTH },
    });

    const res = await app.request(`/api/v1/sync/profiles/${profile.id}/runs`, {
      headers: { Authorization: AUTH },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /sync/runs/:id — returns a single run', async () => {
    const createRes = await app.request('/api/v1/sync/profiles', {
      method: 'POST',
      headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Single Run', targetPath: '/sync/sr' }),
    });
    const profile = await createRes.json();

    const runRes = await app.request(
      `/api/v1/sync/profiles/${profile.id}/run`,
      {
        method: 'POST',
        headers: { Authorization: AUTH },
      },
    );
    const runBody = await runRes.json();

    const res = await app.request(
      `/api/v1/sync/profiles/runs/${runBody.runId}`,
      {
        headers: { Authorization: AUTH },
      },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(runBody.runId);
  });
});
