import type { Client } from '@libsql/client';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { openDatabase } from '../../db.js';
import { migrateDatabase } from '../../migrate.js';
import {
  dataSources,
  libraries,
  matchingQueue,
  mediaItems,
} from '../../schema.js';
import { signAccessToken } from '../../routes/auth.js';

const AUTH_ADMIN = `Bearer ${await signAccessToken('admin-id', 'admin', 'admin')}`;
const AUTH_USER = `Bearer ${await signAccessToken('user-id', 'regularuser', 'user')}`;

describe('Matching API', () => {
  let client: Client;
  let db: LibSQLDatabase;
  let app: ReturnType<typeof createApp>;
  let libraryId: string;
  let mediaItemId: string;

  beforeEach(async () => {
    ({ client, db } = await openDatabase(':memory:'));
    await migrateDatabase(db);
    app = createApp(db);

    const now = new Date();
    libraryId = crypto.randomUUID();
    const sourceId = crypto.randomUUID();
    mediaItemId = crypto.randomUUID();

    await db.insert(libraries).values({
      id: libraryId,
      name: 'Test Library',
      allowedMediaTypes: '[]',
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(dataSources).values({
      id: sourceId,
      libraryId,
      type: 'local',
      path: '/test/movies',
      recursive: true,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(mediaItems).values({
      id: mediaItemId,
      libraryId,
      dataSourceId: sourceId,
      filePath: '/test/movies/Inception.mkv',
      fileName: 'Inception.mkv',
      fileSize: 1_000_000,
      mimeType: 'video/x-matroska',
      mediaCategory: 'Movies',
      createdAt: now,
      updatedAt: now,
    });
  });

  afterEach(() => {
    client.close();
  });

  async function insertQueueItem(
    overrides: Partial<{
      id: string;
      mediaItemId: string;
      suggestedTitle: string;
      confidence: number;
      status: 'pending' | 'confirmed' | 'rejected';
      matchSource: 'local' | 'cloud';
    }> = {},
  ) {
    const id = overrides.id ?? `q-${Date.now()}-${Math.random()}`;
    await db.insert(matchingQueue).values({
      id,
      mediaItemId: overrides.mediaItemId ?? mediaItemId,
      suggestedTitle: overrides.suggestedTitle ?? 'Inception',
      suggestedMetadata: JSON.stringify({ year: 2010 }),
      confidence: overrides.confidence ?? 72,
      status: overrides.status ?? 'pending',
      matchSource: overrides.matchSource ?? 'local',
    });
    return id;
  }

  describe('GET /api/v1/matching/pending', () => {
    it('returns empty items list when queue is empty', async () => {
      const res = await app.request('/api/v1/matching/pending', {
        headers: { Authorization: AUTH_ADMIN },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toHaveLength(0);
    });

    it('returns pending queue items with media item info', async () => {
      await insertQueueItem();
      const res = await app.request('/api/v1/matching/pending', {
        headers: { Authorization: AUTH_ADMIN },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toHaveLength(1);
      expect(body.items[0].suggestedTitle).toBe('Inception');
      expect(body.items[0].confidence).toBe(72);
      expect(body.items[0].mediaItem).toBeDefined();
      expect(body.items[0].mediaItem.id).toBe(mediaItemId);
    });

    it('does not return confirmed or rejected items', async () => {
      await insertQueueItem({ status: 'confirmed' });
      await insertQueueItem({ status: 'rejected' });
      const res = await app.request('/api/v1/matching/pending', {
        headers: { Authorization: AUTH_ADMIN },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toHaveLength(0);
    });

    it('respects limit and offset query params', async () => {
      await insertQueueItem({ id: 'q1' });
      await insertQueueItem({ id: 'q2' });
      await insertQueueItem({ id: 'q3' });

      const res = await app.request(
        '/api/v1/matching/pending?limit=2&offset=1',
        {
          headers: { Authorization: AUTH_ADMIN },
        },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toHaveLength(2);
      expect(body.limit).toBe(2);
      expect(body.offset).toBe(1);
    });

    it('parses suggestedMetadata as JSON object', async () => {
      await insertQueueItem();
      const res = await app.request('/api/v1/matching/pending', {
        headers: { Authorization: AUTH_ADMIN },
      });
      const body = await res.json();
      expect(body.items[0].suggestedMetadata).toEqual({ year: 2010 });
    });

    it('returns 401 when not authenticated', async () => {
      const res = await app.request('/api/v1/matching/pending');
      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/v1/matching/:id/confirm', () => {
    it('confirms a pending queue item and updates media item title', async () => {
      const qId = await insertQueueItem({ suggestedTitle: 'Inception' });

      const res = await app.request(`/api/v1/matching/${qId}/confirm`, {
        method: 'PUT',
        headers: { Authorization: AUTH_ADMIN },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('confirmed');

      // Media item title should be updated
      const rows = await db
        .select({ title: mediaItems.title })
        .from(mediaItems);
      expect(rows[0]?.title).toBe('Inception');
    });

    it('merges suggested metadata into existing media item metadata', async () => {
      // Set initial metadata on the item
      await db
        .update(mediaItems)
        .set({ metadata: JSON.stringify({ genre: 'Sci-Fi' }) })
        .where(mediaItems.id === mediaItemId);

      const qId = await insertQueueItem({
        suggestedTitle: 'Inception',
      });

      await app.request(`/api/v1/matching/${qId}/confirm`, {
        method: 'PUT',
        headers: { Authorization: AUTH_ADMIN },
      });

      const rows = await db
        .select({ metadata: mediaItems.metadata })
        .from(mediaItems);
      const meta = JSON.parse(rows[0]?.metadata ?? '{}') as Record<
        string,
        unknown
      >;
      expect(meta.year).toBe(2010);
    });

    it('returns 404 for non-existent queue item', async () => {
      const res = await app.request('/api/v1/matching/does-not-exist/confirm', {
        method: 'PUT',
        headers: { Authorization: AUTH_ADMIN },
      });
      expect(res.status).toBe(404);
    });

    it('returns 409 when confirming an already-confirmed item', async () => {
      const qId = await insertQueueItem({ status: 'confirmed' });
      const res = await app.request(`/api/v1/matching/${qId}/confirm`, {
        method: 'PUT',
        headers: { Authorization: AUTH_ADMIN },
      });
      expect(res.status).toBe(409);
    });

    it('returns 401 when not authenticated', async () => {
      const qId = await insertQueueItem();
      const res = await app.request(`/api/v1/matching/${qId}/confirm`, {
        method: 'PUT',
      });
      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/v1/matching/:id/reject', () => {
    it('rejects a pending queue item', async () => {
      const qId = await insertQueueItem();

      const res = await app.request(`/api/v1/matching/${qId}/reject`, {
        method: 'PUT',
        headers: { Authorization: AUTH_ADMIN },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('rejected');
    });

    it('returns 404 for non-existent queue item', async () => {
      const res = await app.request('/api/v1/matching/does-not-exist/reject', {
        method: 'PUT',
        headers: { Authorization: AUTH_ADMIN },
      });
      expect(res.status).toBe(404);
    });

    it('returns 409 when rejecting an already-rejected item', async () => {
      const qId = await insertQueueItem({ status: 'rejected' });
      const res = await app.request(`/api/v1/matching/${qId}/reject`, {
        method: 'PUT',
        headers: { Authorization: AUTH_ADMIN },
      });
      expect(res.status).toBe(409);
    });

    it('does not update media item title on reject', async () => {
      const qId = await insertQueueItem({ suggestedTitle: 'Should Not Apply' });

      await app.request(`/api/v1/matching/${qId}/reject`, {
        method: 'PUT',
        headers: { Authorization: AUTH_ADMIN },
      });

      const rows = await db
        .select({ title: mediaItems.title })
        .from(mediaItems);
      expect(rows[0]?.title).toBeNull();
    });

    it('returns 401 when not authenticated', async () => {
      const qId = await insertQueueItem();
      const res = await app.request(`/api/v1/matching/${qId}/reject`, {
        method: 'PUT',
      });
      expect(res.status).toBe(401);
    });
  });

  describe('Access control for regular users', () => {
    it('regular user cannot see items from inaccessible libraries', async () => {
      await insertQueueItem();
      // user-id has no library access grants
      const res = await app.request('/api/v1/matching/pending', {
        headers: { Authorization: AUTH_USER },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toHaveLength(0);
    });
  });
});
