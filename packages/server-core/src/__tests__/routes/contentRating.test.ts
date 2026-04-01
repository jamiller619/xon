import type { Client } from '@libsql/client';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { hashPassword } from '../../auth/password.js';
import { openDatabase } from '../../db/db.js';
import { migrateDatabase } from '../../db/migrate.js';
import { getAllowedRatings } from '../../db/schema.js';
import { dataSources, libraries, mediaItems, users } from '../../db/schema.js';
import { signAccessToken } from '../../routes/auth.js';

const ADMIN_AUTH = `Bearer ${await signAccessToken('admin-1', 'admin', 'admin')}`;
const USER_G_AUTH = `Bearer ${await signAccessToken('user-g', 'user_g', 'user')}`;
const USER_PG13_AUTH = `Bearer ${await signAccessToken('user-pg13', 'user_pg13', 'user')}`;
const USER_NONE_AUTH = `Bearer ${await signAccessToken('user-none', 'user_none', 'user')}`;

// ── getAllowedRatings unit tests ───────────────────────────────────────────────

describe('getAllowedRatings', () => {
  it("returns null for 'none' (no restriction)", () => {
    expect(getAllowedRatings('none')).toBeNull();
  });

  it("returns ['G'] for 'G'", () => {
    expect(getAllowedRatings('G')).toEqual(['G']);
  });

  it("returns ['G','PG'] for 'PG'", () => {
    expect(getAllowedRatings('PG')).toEqual(['G', 'PG']);
  });

  it("returns ['G','PG','PG-13'] for 'PG-13'", () => {
    expect(getAllowedRatings('PG-13')).toEqual(['G', 'PG', 'PG-13']);
  });

  it("returns up through 'R' for 'R'", () => {
    expect(getAllowedRatings('R')).toEqual(['G', 'PG', 'PG-13', 'R']);
  });

  it("returns all rated items for 'unrated'", () => {
    expect(getAllowedRatings('unrated')).toEqual([
      'G',
      'PG',
      'PG-13',
      'R',
      'unrated',
    ]);
  });
});

// ── Integration tests ─────────────────────────────────────────────────────────

describe('Content rating filtering', () => {
  let client: Client;
  let db: LibSQLDatabase;
  let app: ReturnType<typeof createApp>;
  let libId: string;
  let sourceId: string;

  beforeEach(async () => {
    ({ client, db } = await openDatabase(':memory:'));
    await migrateDatabase(db);
    app = createApp(db);

    const now = new Date();
    libId = crypto.randomUUID();
    sourceId = crypto.randomUUID();

    await db.insert(libraries).values({
      id: libId,
      name: 'Test Library',
      allowedMediaTypes: '[]',
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(dataSources).values({
      id: sourceId,
      libraryId: libId,
      type: 'local',
      path: '/media',
      recursive: true,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });

    // Insert media items with different content ratings
    for (const [id, rating] of [
      ['item-g', 'G'],
      ['item-pg', 'PG'],
      ['item-pg13', 'PG-13'],
      ['item-r', 'R'],
      ['item-unrated', 'unrated'],
      ['item-null', null],
    ] as const) {
      await db.insert(mediaItems).values({
        id,
        libraryId: libId,
        dataSourceId: sourceId,
        filePath: `/media/${id}.mp4`,
        fileName: `${id}.mp4`,
        fileSize: 1000,
        contentRating: rating ?? undefined,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Users with different maxContentRating
    await db.insert(users).values({
      id: 'admin-1',
      username: 'admin',
      email: 'admin@example.com',
      displayName: 'Admin',
      passwordHash: await hashPassword('admin'),
      role: 'admin',
      maxContentRating: 'none',
    });

    await db.insert(users).values({
      id: 'user-g',
      username: 'user_g',
      email: 'user_g@example.com',
      displayName: 'G User',
      passwordHash: await hashPassword('pass'),
      role: 'user',
      maxContentRating: 'G',
    });

    await db.insert(users).values({
      id: 'user-pg13',
      username: 'user_pg13',
      email: 'user_pg13@example.com',
      displayName: 'PG13 User',
      passwordHash: await hashPassword('pass'),
      role: 'user',
      maxContentRating: 'PG-13',
    });

    await db.insert(users).values({
      id: 'user-none',
      username: 'user_none',
      email: 'user_none@example.com',
      displayName: 'None User',
      passwordHash: await hashPassword('pass'),
      role: 'user',
      maxContentRating: 'none',
    });

    // Grant all users access to the library
    for (const userId of ['admin-1', 'user-g', 'user-pg13', 'user-none']) {
      await db.insert((await import('../../schema.js')).libraryAccess).values({
        userId,
        libraryId: libId,
        grantedBy: 'admin-1',
      });
    }
  });

  afterEach(() => {
    client.close();
  });

  // ── GET /media ─────────────────────────────────────────────────────────────

  describe('GET /api/v1/media', () => {
    it('admin (none) sees all 6 items', async () => {
      const res = await app.request('/api/v1/media', {
        headers: { Authorization: ADMIN_AUTH },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(6);
    });

    it('user with maxContentRating=G sees only G and null-rated items', async () => {
      const res = await app.request('/api/v1/media', {
        headers: { Authorization: USER_G_AUTH },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { id: string }[];
      const ids = body.map((i) => i.id);
      expect(ids).toContain('item-g');
      expect(ids).not.toContain('item-pg');
      expect(ids).not.toContain('item-pg13');
      expect(ids).not.toContain('item-r');
      expect(ids).not.toContain('item-unrated');
      // null-rated items are hidden when maxRating is below "unrated"
      expect(ids).not.toContain('item-null');
    });

    it('user with maxContentRating=PG-13 sees G, PG, PG-13 but not R or unrated', async () => {
      const res = await app.request('/api/v1/media', {
        headers: { Authorization: USER_PG13_AUTH },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { id: string }[];
      const ids = body.map((i) => i.id);
      expect(ids).toContain('item-g');
      expect(ids).toContain('item-pg');
      expect(ids).toContain('item-pg13');
      expect(ids).not.toContain('item-r');
      expect(ids).not.toContain('item-unrated');
      expect(ids).not.toContain('item-null');
    });

    it('user with maxContentRating=none sees all items', async () => {
      const res = await app.request('/api/v1/media', {
        headers: { Authorization: USER_NONE_AUTH },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(6);
    });
  });

  // ── GET /media/:id ─────────────────────────────────────────────────────────

  describe('GET /api/v1/media/:id', () => {
    it('user-g can access G-rated item', async () => {
      const res = await app.request('/api/v1/media/item-g', {
        headers: { Authorization: USER_G_AUTH },
      });
      expect(res.status).toBe(200);
    });

    it('user-g cannot access R-rated item (returns 404)', async () => {
      const res = await app.request('/api/v1/media/item-r', {
        headers: { Authorization: USER_G_AUTH },
      });
      expect(res.status).toBe(404);
    });

    it('user-pg13 can access PG-13 item', async () => {
      const res = await app.request('/api/v1/media/item-pg13', {
        headers: { Authorization: USER_PG13_AUTH },
      });
      expect(res.status).toBe(200);
    });

    it('user-pg13 cannot access unrated item', async () => {
      const res = await app.request('/api/v1/media/item-unrated', {
        headers: { Authorization: USER_PG13_AUTH },
      });
      expect(res.status).toBe(404);
    });

    it('user-none can access any item including R', async () => {
      const res = await app.request('/api/v1/media/item-r', {
        headers: { Authorization: USER_NONE_AUTH },
      });
      expect(res.status).toBe(200);
    });
  });

  // ── GET /libraries/:id/media ───────────────────────────────────────────────

  describe('GET /api/v1/libraries/:id/media', () => {
    it('user-pg13 sees only allowed ratings in library media', async () => {
      const res = await app.request(`/api/v1/libraries/${libId}/media`, {
        headers: { Authorization: USER_PG13_AUTH },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { id: string }[];
      const ids = body.map((i) => i.id);
      expect(ids).toContain('item-g');
      expect(ids).toContain('item-pg');
      expect(ids).toContain('item-pg13');
      expect(ids).not.toContain('item-r');
      expect(ids).not.toContain('item-unrated');
    });
  });

  // ── PUT /admin/users/:id maxContentRating ──────────────────────────────────

  describe('PUT /api/v1/admin/users/:id (maxContentRating)', () => {
    it('admin can set maxContentRating on a user', async () => {
      const res = await app.request('/api/v1/admin/users/user-none', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: ADMIN_AUTH,
        },
        body: JSON.stringify({ maxContentRating: 'PG' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.maxContentRating).toBe('PG');
    });

    it('maxContentRating is returned in user list', async () => {
      const res = await app.request('/api/v1/admin/users', {
        headers: { Authorization: ADMIN_AUTH },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { maxContentRating: string }[];
      for (const u of body) {
        expect(u).toHaveProperty('maxContentRating');
      }
    });
  });
});
