import type { Client } from '@libsql/client';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { openDatabase } from '../../db/db.js';
import { migrateDatabase } from '../../db/migrate.js';
import { hashPassword } from '../../auth/password.js';
import { signAccessToken } from '../../routes/auth.js';
import { users } from '../../db/schema.js';

const ADMIN_AUTH = `Bearer ${await signAccessToken('admin-1', 'admin', 'admin')}`;
const USER_AUTH = `Bearer ${await signAccessToken('user-1', 'user', 'user')}`;

describe('Admin Users API', () => {
  let client: Client;
  let db: LibSQLDatabase;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    ({ client, db } = await openDatabase(':memory:'));
    await migrateDatabase(db);
    app = createApp(db);

    await db.insert(users).values({
      id: 'admin-1',
      username: 'admin',
      email: 'admin@example.com',
      displayName: 'Admin User',
      passwordHash: await hashPassword('admin123'),
      role: 'admin',
    });

    await db.insert(users).values({
      id: 'user-1',
      username: 'regularuser',
      email: 'user@example.com',
      displayName: 'Regular User',
      passwordHash: await hashPassword('user123'),
      role: 'user',
    });
  });

  afterEach(() => {
    client.close();
  });

  // ─── GET /admin/users ────────────────────────────────────────────────────────

  describe('GET /api/v1/admin/users', () => {
    it('returns 200 with user list for admin', async () => {
      const res = await app.request('/api/v1/admin/users', {
        headers: { Authorization: ADMIN_AUTH },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(2);
      // should not expose passwordHash
      expect(body[0]).not.toHaveProperty('passwordHash');
    });

    it('returns 403 for non-admin role', async () => {
      const res = await app.request('/api/v1/admin/users', {
        headers: { Authorization: USER_AUTH },
      });
      expect(res.status).toBe(403);
    });

    it('returns 401 without auth', async () => {
      const res = await app.request('/api/v1/admin/users');
      expect(res.status).toBe(401);
    });
  });

  // ─── POST /admin/users ───────────────────────────────────────────────────────

  describe('POST /api/v1/admin/users', () => {
    it('creates a new user', async () => {
      const res = await app.request('/api/v1/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: ADMIN_AUTH,
        },
        body: JSON.stringify({
          username: 'newuser',
          email: 'new@example.com',
          displayName: 'New User',
          password: 'newpass123',
          role: 'manager',
        }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.username).toBe('newuser');
      expect(body.role).toBe('manager');
      expect(body).not.toHaveProperty('passwordHash');
    });

    it('returns 403 for non-admin', async () => {
      const res = await app.request('/api/v1/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: USER_AUTH,
        },
        body: JSON.stringify({
          username: 'other',
          email: 'other@example.com',
          displayName: 'Other',
          password: 'pass',
          role: 'user',
        }),
      });
      expect(res.status).toBe(403);
    });
  });

  // ─── PUT /admin/users/:id ────────────────────────────────────────────────────

  describe('PUT /api/v1/admin/users/:id', () => {
    it('updates user fields', async () => {
      const res = await app.request('/api/v1/admin/users/user-1', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: ADMIN_AUTH,
        },
        body: JSON.stringify({ displayName: 'Updated Name', role: 'manager' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.displayName).toBe('Updated Name');
      expect(body.role).toBe('manager');
    });

    it('returns 404 for unknown user', async () => {
      const res = await app.request('/api/v1/admin/users/nonexistent', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: ADMIN_AUTH,
        },
        body: JSON.stringify({ displayName: 'X' }),
      });
      expect(res.status).toBe(404);
    });

    it('returns 403 for non-admin', async () => {
      const res = await app.request('/api/v1/admin/users/user-1', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: USER_AUTH,
        },
        body: JSON.stringify({ displayName: 'Hacked' }),
      });
      expect(res.status).toBe(403);
    });
  });

  // ─── DELETE /admin/users/:id ─────────────────────────────────────────────────

  describe('DELETE /api/v1/admin/users/:id', () => {
    it('deletes a user', async () => {
      const res = await app.request('/api/v1/admin/users/user-1', {
        method: 'DELETE',
        headers: { Authorization: ADMIN_AUTH },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('returns 404 for unknown user', async () => {
      const res = await app.request('/api/v1/admin/users/nonexistent', {
        method: 'DELETE',
        headers: { Authorization: ADMIN_AUTH },
      });
      expect(res.status).toBe(404);
    });

    it('returns 403 for non-admin', async () => {
      const res = await app.request('/api/v1/admin/users/admin-1', {
        method: 'DELETE',
        headers: { Authorization: USER_AUTH },
      });
      expect(res.status).toBe(403);
    });
  });
});
