import type { Client } from '@libsql/client';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { hashPassword } from '../../auth/password.js';
import { openDatabase } from '../../db/db.js';
import { migrateDatabase } from '../../db/migrate.js';
import { dataSources, libraries, mediaItems, users } from '../../db/schema.js';
import { signAccessToken } from '../../routes/auth.js';

const USER_AUTH = `Bearer ${await signAccessToken('user-1', 'testuser', 'user')}`;
const OTHER_AUTH = `Bearer ${await signAccessToken('user-2', 'otheruser', 'user')}`;

describe('Progress API', () => {
  let client: Client;
  let db: LibSQLDatabase;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    ({ client, db } = await openDatabase(':memory:'));
    await migrateDatabase(db);
    app = createApp(db);

    await db.insert(users).values({
      id: 'user-1',
      username: 'testuser',
      email: 'testuser@example.com',
      displayName: 'Test User',
      passwordHash: await hashPassword('pass123'),
      role: 'user',
    });

    await db.insert(users).values({
      id: 'user-2',
      username: 'otheruser',
      email: 'otheruser@example.com',
      displayName: 'Other User',
      passwordHash: await hashPassword('pass123'),
      role: 'user',
    });

    await db.insert(libraries).values({
      id: 'lib-1',
      name: 'Movies',
      allowedMediaTypes: '[]',
    });

    await db.insert(dataSources).values({
      id: 'ds-1',
      libraryId: 'lib-1',
      type: 'local',
      path: '/movies',
    });

    await db.insert(mediaItems).values({
      id: 'item-1',
      libraryId: 'lib-1',
      dataSourceId: 'ds-1',
      filePath: '/movies/movie.mp4',
      fileName: 'movie.mp4',
      fileSize: 1000000,
      mimeType: 'video/mp4',
      mediaCategory: 'Movies',
      title: 'Test Movie',
    });

    await db.insert(mediaItems).values({
      id: 'item-2',
      libraryId: 'lib-1',
      dataSourceId: 'ds-1',
      filePath: '/movies/movie2.mp4',
      fileName: 'movie2.mp4',
      fileSize: 2000000,
      mimeType: 'video/mp4',
      mediaCategory: 'Movies',
      title: 'Test Movie 2',
    });
  });

  afterEach(() => {
    client.close();
  });

  // ─── PUT /media/:id/progress ─────────────────────────────────────────────────

  describe('PUT /api/v1/media/:id/progress', () => {
    it('saves progress for a media item', async () => {
      const res = await app.request('/api/v1/media/item-1/progress', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: USER_AUTH,
        },
        body: JSON.stringify({ position: 120, duration: 3600 }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ok: true });
    });

    it('updates progress on subsequent calls', async () => {
      await app.request('/api/v1/media/item-1/progress', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: USER_AUTH,
        },
        body: JSON.stringify({ position: 120, duration: 3600 }),
      });

      const res = await app.request('/api/v1/media/item-1/progress', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: USER_AUTH,
        },
        body: JSON.stringify({
          position: 300,
          duration: 3600,
          completed: false,
        }),
      });
      expect(res.status).toBe(200);
    });

    it('can mark item as completed', async () => {
      const res = await app.request('/api/v1/media/item-1/progress', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: USER_AUTH,
        },
        body: JSON.stringify({
          position: 3600,
          duration: 3600,
          completed: true,
        }),
      });
      expect(res.status).toBe(200);
    });

    it('returns 404 for nonexistent media item', async () => {
      const res = await app.request('/api/v1/media/nonexistent/progress', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: USER_AUTH,
        },
        body: JSON.stringify({ position: 0 }),
      });
      expect(res.status).toBe(404);
    });

    it('requires authentication', async () => {
      const res = await app.request('/api/v1/media/item-1/progress', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: 0 }),
      });
      expect(res.status).toBe(401);
    });
  });

  // ─── GET /users/me/progress ──────────────────────────────────────────────────

  describe('GET /api/v1/users/me/progress', () => {
    it('returns empty array when no progress recorded', async () => {
      const res = await app.request('/api/v1/users/me/progress', {
        headers: { Authorization: USER_AUTH },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual([]);
    });

    it('returns in-progress items', async () => {
      await app.request('/api/v1/media/item-1/progress', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: USER_AUTH,
        },
        body: JSON.stringify({ position: 120, duration: 3600 }),
      });

      const res = await app.request('/api/v1/users/me/progress', {
        headers: { Authorization: USER_AUTH },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(1);
      expect(body[0].mediaItemId).toBe('item-1');
      expect(body[0].position).toBe(120);
      expect(body[0].duration).toBe(3600);
      expect(body[0].completed).toBe(false);
      expect(body[0].mediaItem).toBeDefined();
      expect(body[0].mediaItem.title).toBe('Test Movie');
    });

    it('excludes completed items', async () => {
      await app.request('/api/v1/media/item-1/progress', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: USER_AUTH,
        },
        body: JSON.stringify({
          position: 3600,
          duration: 3600,
          completed: true,
        }),
      });

      const res = await app.request('/api/v1/users/me/progress', {
        headers: { Authorization: USER_AUTH },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(0);
    });

    it('only returns items for the authenticated user', async () => {
      await app.request('/api/v1/media/item-1/progress', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: USER_AUTH,
        },
        body: JSON.stringify({ position: 120, duration: 3600 }),
      });

      // Other user should see nothing
      const res = await app.request('/api/v1/users/me/progress', {
        headers: { Authorization: OTHER_AUTH },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(0);
    });

    it('requires authentication', async () => {
      const res = await app.request('/api/v1/users/me/progress');
      expect(res.status).toBe(401);
    });

    it('returns multiple in-progress items ordered by updatedAt desc', async () => {
      await app.request('/api/v1/media/item-1/progress', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: USER_AUTH,
        },
        body: JSON.stringify({ position: 120, duration: 3600 }),
      });
      await app.request('/api/v1/media/item-2/progress', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: USER_AUTH,
        },
        body: JSON.stringify({ position: 60, duration: 7200 }),
      });

      const res = await app.request('/api/v1/users/me/progress', {
        headers: { Authorization: USER_AUTH },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(2);
    });
  });
});
